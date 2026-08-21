import { requireSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { syncDocumentStatusesThrottled } from "@/lib/document-status";
import { nextDueDate } from "@/lib/loan";

/**
 * Operational card metrics as DB aggregates. The old dashboard loaded every
 * LR, vehicle document, loan (with all EMI rows) and route row into Node and
 * counted in JS — linear in table size on every view. Counts and group-bys
 * keep the transferred data proportional to the number of *buckets* instead.
 */
export interface OpsMetrics {
  expiredCount: number;
  todayCount: number;
  upcomingCount: number;
  docTypeCounts: { name: string; count: number }[];
  docProblem: number;
  docExpired: number;
  emiActive: number;
  emiDue: number;
  laneAlive: number;
  laneCooling: number;
  laneSleeping: number;
}

const H12 = 12 * 3600 * 1000;
const DAY = 24 * 3600 * 1000;

export async function getOpsMetrics(todayCal: string): Promise<OpsMetrics> {
  const session = requireSession();
  // calDate(d) = UTC date of (d + 12h), so bucket c === X  ⇔  d ∈ [X−12h, X+12h)
  const t = new Date(`${todayCal}T00:00:00Z`).getTime();
  const ewayWhere = {
    // expiry-date driven, not FY-scoped: a 30/31 March e-way must still
    // alert in April (FY continuity)
    firmId: session.firmId,
    deletedAt: null,
    ewayBillNo: { not: null },
  };

  return withTenant(session.tenantId, async (tx) => {
    // DONE → PENDING flip so a document entering its window shows as pending
    // everywhere — throttled: windows only move at day granularity
    await syncDocumentStatusesThrottled(tx, session.tenantId);

    const [expiredCount, todayCount, upcomingCount, docTypes, loans, lrLanes, slipLanes] =
      await Promise.all([
        // c ∈ {today−2, today−1}
        tx.lr.count({
          where: { ...ewayWhere, ewayExpiry: { gte: new Date(t - 2 * DAY - H12), lt: new Date(t - H12) } },
        }),
        // c === today
        tx.lr.count({
          where: { ...ewayWhere, ewayExpiry: { gte: new Date(t - H12), lt: new Date(t + H12) } },
        }),
        // c ∈ {today+1, today+2}
        tx.lr.count({
          where: { ...ewayWhere, ewayExpiry: { gte: new Date(t + H12), lt: new Date(t + 2 * DAY + H12) } },
        }),
        tx.documentType.findMany({
          where: { showReminder: true },
          select: { id: true, name: true, reminderDays: true },
        }),
        // loans are lifetime — an old-year loan's EMI stays due (FY continuity)
        tx.loan.findMany({
          where: { firmId: session.firmId, deletedAt: null, status: "ACTIVE", emiApplicable: true },
          select: { id: true, amount: true, emiStartDate: true, emiFrequency: true },
        }),
        // route heartbeat continues across FYs — a lane's history does not
        // reset on 1 April
        tx.lr.groupBy({
          by: ["sourceCityId", "destCityId"],
          where: {
            firmId: session.firmId,
            deletedAt: null,
            lrType: { notIn: ["CANCELLED", "PAPER_CHANGE"] },
          },
          _count: { _all: true },
          _max: { lrDate: true },
        }),
        tx.brokerSlip.groupBy({
          by: ["loadStationId", "destCityId"],
          where: { firmId: session.firmId, deletedAt: null },
          _count: { _all: true },
          _max: { slipDate: true },
        }),
      ]);

    const now = new Date();

    // documents: each type has its own reminder window — fetch only documents
    // inside the WIDEST window (nothing outside it can match any type)
    const daysByType = new Map(docTypes.map((d) => [d.id, d.reminderDays ?? 30]));
    const maxDays = docTypes.length ? Math.max(...Array.from(daysByType.values())) : 0;
    const maxWindowEnd = new Date(now);
    maxWindowEnd.setDate(maxWindowEnd.getDate() + maxDays);

    const [docs, emiSums] = await Promise.all([
      docTypes.length
        ? tx.vehicleDocument.findMany({
            where: {
              expiryDate: { not: null, lte: maxWindowEnd },
              docTypeId: { in: docTypes.map((d) => d.id) },
            },
            select: { status: true, expiryDate: true, docTypeId: true },
          })
        : Promise.resolve([]),
      loans.length
        ? tx.loanEmi.groupBy({
            by: ["loanId"],
            where: { loanId: { in: loans.map((l) => l.id) }, deletedAt: null },
            _sum: { principal: true },
            _count: { _all: true },
          })
        : Promise.resolve([]),
    ]);

    const nameByType = new Map(docTypes.map((d) => [d.id, d.name]));
    const typeCounts = new Map<string, number>();
    let docProblem = 0;
    let docExpired = 0;
    for (const d of docs) {
      if (!d.expiryDate) continue;
      const windowEnd = new Date(now);
      windowEnd.setDate(windowEnd.getDate() + (daysByType.get(d.docTypeId) ?? 30));
      if (d.expiryDate > windowEnd) continue;
      const name = nameByType.get(d.docTypeId) ?? "?";
      typeCounts.set(name, (typeCounts.get(name) ?? 0) + 1);
      if (d.status === "PROBLEM") docProblem++;
      // expiry already passed — the loudest state of all
      if (d.expiryDate < now) docExpired++;
    }
    const docTypeCounts = Array.from(typeCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    // EMI due: active EMI loans; due/overdue = next scheduled date has arrived
    const emiByLoan = new Map(emiSums.map((e) => [e.loanId, e]));
    let emiActive = 0;
    let emiDue = 0;
    for (const l of loans) {
      const agg = emiByLoan.get(l.id);
      const repaid = Number(agg?._sum.principal ?? 0);
      if (Number(l.amount) - repaid <= 0.009) continue;
      emiActive++;
      const due = nextDueDate(l.emiStartDate, l.emiFrequency, agg?._count._all ?? 0);
      if (due && due <= now) emiDue++;
    }

    // route heartbeat: same rules as the /routes page (>=3 trips counted;
    // sleeping > 20 days, cooling 8-20)
    const lanes = new Map<string, { count: number; last: Date }>();
    const addLane = (a: string | null, b: string | null, count: number, last: Date | null) => {
      if (!a || !b || !last) return;
      const k = `${a}|${b}`;
      const cur = lanes.get(k);
      lanes.set(k, {
        count: (cur?.count ?? 0) + count,
        last: !cur || last > cur.last ? last : cur.last,
      });
    };
    for (const r of lrLanes) addLane(r.sourceCityId, r.destCityId, r._count._all, r._max.lrDate);
    for (const r of slipLanes) addLane(r.loadStationId, r.destCityId, r._count._all, r._max.slipDate);
    let laneAlive = 0;
    let laneCooling = 0;
    let laneSleeping = 0;
    for (const v of Array.from(lanes.values())) {
      if (v.count < 3) continue;
      const days = Math.floor((now.getTime() - v.last.getTime()) / 86400000);
      if (days <= 7) laneAlive++;
      else if (days <= 20) laneCooling++;
      else laneSleeping++;
    }

    return {
      expiredCount, todayCount, upcomingCount, docTypeCounts, docProblem, docExpired,
      emiActive, emiDue, laneAlive, laneCooling, laneSleeping,
    };
  });
}
