import { ClipboardCheck, FileCheck2, IndianRupee, Map as MapIcon } from "lucide-react";
import { requireSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

/**
 * Operational dashboard — E-Way Bill monitoring front door. The card opens the
 * full monitoring screen (five date tabs, check + extend) in a new window.
 */

const calDate = (d: Date) => new Date(d.getTime() + 12 * 3600 * 1000).toISOString().slice(0, 10);

export default async function DashboardPage() {
  const session = requireSession();

  const todayCal = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
  const dayMs = 24 * 3600 * 1000;
  const base = new Date(`${todayCal}T00:00:00Z`).getTime();
  const window = [-2, -1, 0, 1, 2].map((off) => new Date(base + off * dayMs).toISOString().slice(0, 10));

  const {
    expiredCount, todayCount, upcomingCount, docTypeCounts, docProblem, emiActive, emiDue,
    laneAlive, laneCooling, laneSleeping,
  } = await withTenant(session.tenantId, async (tx) => {
      const lrs = await tx.lr.findMany({
        where: {
          firmId: session.firmId,
          fyId: session.fyId,
          deletedAt: null,
          ewayBillNo: { not: null },
          ewayExpiry: { not: null },
        },
        select: { ewayExpiry: true },
      });
      let expiredCount = 0;
      let todayCount = 0;
      let upcomingCount = 0;
      for (const l of lrs) {
        const c = calDate(l.ewayExpiry as Date);
        if (!window.includes(c)) continue;
        if (c < todayCal) expiredCount++;
        else if (c === todayCal) todayCount++;
        else upcomingCount++;
      }
      // document counts follow each type's reminderDays window (Document
      // Master), exactly like the status page itself
      const docs = await tx.vehicleDocument.findMany({
        where: { expiryDate: { not: null } },
        include: { docType: true },
      });
      const now = new Date();
      const typeCounts = new Map<string, number>();
      let docProblem = 0;
      for (const d of docs) {
        if (!d.docType.showReminder || !d.expiryDate) continue;
        const windowEnd = new Date(now);
        windowEnd.setDate(windowEnd.getDate() + (d.docType.reminderDays ?? 30));
        if (d.expiryDate > windowEnd) continue;
        typeCounts.set(d.docType.name, (typeCounts.get(d.docType.name) ?? 0) + 1);
        if (d.status === "PROBLEM") docProblem++;
      }
      const docTypeCounts = Array.from(typeCounts.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);

      // EMI due: active EMI loans; due/overdue = next scheduled date has arrived
      const loans = await tx.loan.findMany({
        where: { firmId: session.firmId, fyId: session.fyId, deletedAt: null, status: "ACTIVE", emiApplicable: true },
        include: { emis: { where: { deletedAt: null }, select: { principal: true } } },
      });
      const { nextDueDate } = await import("@/lib/loan");
      let emiActive = 0;
      let emiDue = 0;
      for (const l of loans) {
        const repaid = l.emis.reduce((s, e) => s + Number(e.principal), 0);
        if (Number(l.amount) - repaid <= 0.009) continue;
        emiActive++;
        const due = nextDueDate(l.emiStartDate, l.emiFrequency, l.emis.length);
        if (due && due <= now) emiDue++;
      }
      // route heartbeat: same rules as the /routes page (>=3 trips counted;
      // sleeping > 20 days, cooling 8-20)
      const [lrRoutes, slipRoutes] = await Promise.all([
        tx.lr.findMany({
          where: {
            firmId: session.firmId,
            fyId: session.fyId,
            deletedAt: null,
            lrType: { notIn: ["CANCELLED", "PAPER_CHANGE"] },
          },
          select: { sourceCityId: true, destCityId: true, lrDate: true },
        }),
        tx.brokerSlip.findMany({
          where: { firmId: session.firmId, fyId: session.fyId, deletedAt: null },
          select: { loadStationId: true, destCityId: true, slipDate: true },
        }),
      ]);
      const lanes = new Map<string, { count: number; last: Date }>();
      const addLane = (a: string | null, b: string | null, d: Date) => {
        if (!a || !b) return;
        const k = `${a}|${b}`;
        const cur = lanes.get(k);
        lanes.set(k, { count: (cur?.count ?? 0) + 1, last: !cur || d > cur.last ? d : cur.last });
      };
      lrRoutes.forEach((l) => addLane(l.sourceCityId, l.destCityId, l.lrDate));
      slipRoutes.forEach((s) => addLane(s.loadStationId, s.destCityId, s.slipDate));
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
        expiredCount, todayCount, upcomingCount, docTypeCounts, docProblem, emiActive, emiDue,
        laneAlive, laneCooling, laneSleeping,
      };
    });

  return (
    <div className="space-y-4 p-4">
      <h1 className="page-title">Dashboard</h1>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <a href="/eway" target="_blank" rel="noreferrer" className="group">
          <Card className="h-full transition-all hover:border-primary/40 hover:shadow-card">
            <CardContent className="flex items-start gap-3 p-5">
              <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <FileCheck2 className="h-6 w-6" />
              </span>
              <span className="min-w-0">
                <span className="block text-lg font-semibold group-hover:text-primary">
                  E-Way Bill (3 Days)
                </span>
                <span className="block text-sm text-muted-foreground">
                  Expiring e-way bills — check &amp; extend from one screen
                </span>
                <span className="mt-2 flex flex-wrap gap-2 text-xs font-medium">
                  <span className="rounded bg-red-500/10 px-2 py-0.5 text-red-600">
                    Expired: {expiredCount}
                  </span>
                  <span className="rounded bg-amber-500/10 px-2 py-0.5 text-amber-600">
                    Today: {todayCount}
                  </span>
                  <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-emerald-600">
                    Next 2 days: {upcomingCount}
                  </span>
                </span>
              </span>
            </CardContent>
          </Card>
        </a>

        <a href="/documents-status" target="_blank" rel="noreferrer" className="group">
          <Card className="h-full transition-all hover:border-primary/40 hover:shadow-card">
            <CardContent className="flex items-start gap-3 p-5">
              <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <ClipboardCheck className="h-6 w-6" />
              </span>
              <span className="min-w-0">
                <span className="block text-lg font-semibold group-hover:text-primary">
                  Document Registration
                </span>
                <span className="block text-sm text-muted-foreground">
                  Renewal workflow — bulk / individual status
                </span>
                <span className="mt-2 flex flex-wrap gap-1.5 text-xs font-medium">
                  {docTypeCounts.length === 0 ? (
                    <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-emerald-600">
                      All documents in order
                    </span>
                  ) : (
                    docTypeCounts.map((t) => (
                      <span key={t.name} className="rounded bg-amber-500/10 px-2 py-0.5 text-amber-700 dark:text-amber-500">
                        {t.name} ({t.count})
                      </span>
                    ))
                  )}
                  {docProblem > 0 && (
                    <span className="rounded bg-red-500/10 px-2 py-0.5 text-red-600">
                      Problem: {docProblem}
                    </span>
                  )}
                </span>
              </span>
            </CardContent>
          </Card>
        </a>

        <a href="/emi-due" target="_blank" rel="noreferrer" className="group">
          <Card className="h-full transition-all hover:border-primary/40 hover:shadow-card">
            <CardContent className="flex items-start gap-3 p-5">
              <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <IndianRupee className="h-6 w-6" />
              </span>
              <span className="min-w-0">
                <span className="block text-lg font-semibold group-hover:text-primary">EMI Due</span>
                <span className="block text-sm text-muted-foreground">
                  Upcoming loan EMIs — pay from one list
                </span>
                <span className="mt-2 flex flex-wrap gap-2 text-xs font-medium">
                  <span className="rounded bg-blue-500/10 px-2 py-0.5 text-blue-600">
                    Active EMI loans: {emiActive}
                  </span>
                  {emiDue > 0 && (
                    <span className="rounded bg-red-500/10 px-2 py-0.5 text-red-600">
                      Due now: {emiDue}
                    </span>
                  )}
                </span>
              </span>
            </CardContent>
          </Card>
        </a>

        <a href="/routes" target="_blank" rel="noreferrer" className="group">
          <Card className="h-full transition-all hover:border-primary/40 hover:shadow-card">
            <CardContent className="flex items-start gap-3 p-5">
              <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <MapIcon className="h-6 w-6" />
              </span>
              <span className="min-w-0">
                <span className="block text-lg font-semibold group-hover:text-primary">
                  Route Heartbeat
                </span>
                <span className="block text-sm text-muted-foreground">
                  Kaun sa lane zinda hai, kaun sota — parties ko time par jagao
                </span>
                <span className="mt-2 flex flex-wrap gap-2 text-xs font-medium">
                  {laneSleeping > 0 && (
                    <span className="rounded bg-red-500/10 px-2 py-0.5 text-red-600">
                      🔴 Sote: {laneSleeping}
                    </span>
                  )}
                  {laneCooling > 0 && (
                    <span className="rounded bg-amber-500/10 px-2 py-0.5 text-amber-700 dark:text-amber-500">
                      🟠 Thande: {laneCooling}
                    </span>
                  )}
                  <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-emerald-600">
                    🟢 Zinda: {laneAlive}
                  </span>
                </span>
              </span>
            </CardContent>
          </Card>
        </a>
      </div>
    </div>
  );
}
