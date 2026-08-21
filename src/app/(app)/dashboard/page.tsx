import { ClipboardCheck, FileCheck2, IndianRupee, Map as MapIcon, Percent } from "lucide-react";
import { requireSession } from "@/lib/session";
import { syncDocumentStatuses } from "@/lib/document-status";
import { withTenant } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { FinanceCardsSection } from "./finance-cards";
import { InfoHint } from "@/components/ui/info-hint";
import { getLrSummary } from "./lr-actions";
import { getOutstandingAgeing } from "./outstanding-actions";
import { getTdsMonitor } from "./tds-actions";
import { LR_VIEW_META } from "./lr-views";
import { formatMoney } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Operational dashboard — E-Way Bill monitoring front door. The card opens the
 * full monitoring screen (five date tabs, check + extend) in a new window.
 */

const calDate = (d: Date) => new Date(d.getTime() + 12 * 3600 * 1000).toISOString().slice(0, 10);

export default async function DashboardPage() {
  const session = requireSession();
  const [lrSummary, recvRes, payRes, tdsRes] = await Promise.all([
    getLrSummary(),
    getOutstandingAgeing({ side: "RECV" }),
    getOutstandingAgeing({ side: "PAY" }),
    getTdsMonitor(),
  ]);
  const tds = tdsRes.ok ? tdsRes.data : null;
  const recv = recvRes.ok ? recvRes.data.totals : null;
  const pay = payRes.ok ? payRes.data.totals : null;

  const todayCal = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
  const dayMs = 24 * 3600 * 1000;
  const base = new Date(`${todayCal}T00:00:00Z`).getTime();
  const window = [-2, -1, 0, 1, 2].map((off) => new Date(base + off * dayMs).toISOString().slice(0, 10));

  const {
    expiredCount, todayCount, upcomingCount, docTypeCounts, docProblem, docExpired, emiActive, emiDue,
    laneAlive, laneCooling, laneSleeping,
  } = await withTenant(session.tenantId, async (tx) => {
      const lrs = await tx.lr.findMany({
        // expiry-date driven, not FY-scoped: a 30/31 March e-way must still
        // alert in April (FY continuity)
        where: {
          firmId: session.firmId,
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
      // Master), exactly like the status page itself — and the same DONE →
      // PENDING flip runs here, so opening the dashboard is enough for a
      // document entering its window to show as pending everywhere
      await syncDocumentStatuses(tx);
      const docs = await tx.vehicleDocument.findMany({
        where: { expiryDate: { not: null } },
        include: { docType: true },
      });
      const now = new Date();
      const typeCounts = new Map<string, number>();
      let docProblem = 0;
      let docExpired = 0;
      for (const d of docs) {
        if (!d.docType.showReminder || !d.expiryDate) continue;
        const windowEnd = new Date(now);
        windowEnd.setDate(windowEnd.getDate() + (d.docType.reminderDays ?? 30));
        if (d.expiryDate > windowEnd) continue;
        typeCounts.set(d.docType.name, (typeCounts.get(d.docType.name) ?? 0) + 1);
        if (d.status === "PROBLEM") docProblem++;
        // expiry already passed — the loudest state of all
        if (d.expiryDate < now) docExpired++;
      }
      const docTypeCounts = Array.from(typeCounts.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);

      // EMI due: active EMI loans; due/overdue = next scheduled date has arrived
      const loans = await tx.loan.findMany({
        // loans are lifetime — an old-year loan's EMI stays due (FY continuity)
        where: { firmId: session.firmId, deletedAt: null, status: "ACTIVE", emiApplicable: true },
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
          // route heartbeat continues across FYs — a lane's history does not
          // reset on 1 April
          where: {
            firmId: session.firmId,
            deletedAt: null,
            lrType: { notIn: ["CANCELLED", "PAPER_CHANGE"] },
          },
          select: { sourceCityId: true, destCityId: true, lrDate: true },
        }),
        tx.brokerSlip.findMany({
          where: { firmId: session.firmId, deletedAt: null },
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
        expiredCount, todayCount, upcomingCount, docTypeCounts, docProblem, docExpired, emiActive, emiDue,
        laneAlive, laneCooling, laneSleeping,
      };
    });

  return (
    <div className="space-y-4 p-4">
      <h1 className="page-title">Dashboard</h1>

      {/* date filter here touches ONLY these cards */}
      <FinanceCardsSection defaultFrom={`${todayCal.slice(0, 8)}01`} defaultTo={todayCal} />

      {/* receivable / payable position with ageing drill-down */}
      {(recv || pay) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {recv && (
            <a href="/dashboard/outstanding?side=RECV" target="_blank" rel="noreferrer" className="group">
              <Card className="h-full transition-all hover:border-primary/40 hover:shadow-card">
                <CardContent className="p-5">
                  <span className="flex items-center gap-1.5 text-lg font-semibold group-hover:text-primary">
                    Receivable
                    <InfoHint>
                      Open party bills by settlement math — click for party-wise ageing
                      (0–30 / 31–60 / 61–90 / 90+ days) with pending documents
                    </InfoHint>
                  </span>
                  <div className="mt-1 text-2xl font-black tabular-nums text-emerald-600">
                    {formatMoney(recv.total)}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-2 text-xs font-medium">
                    <span className="rounded bg-blue-500/10 px-2 py-0.5 text-blue-600">
                      {recv.parties} parties
                    </span>
                    {recv.b90 > 0 && (
                      <span className="rounded bg-red-500/10 px-2 py-0.5 text-red-600">
                        90+ days: {formatMoney(recv.b90)}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            </a>
          )}
          {pay && (
            <a href="/dashboard/outstanding?side=PAY" target="_blank" rel="noreferrer" className="group">
              <Card className="h-full transition-all hover:border-primary/40 hover:shadow-card">
                <CardContent className="p-5">
                  <span className="flex items-center gap-1.5 text-lg font-semibold group-hover:text-primary">
                    Payable
                    <InfoHint>
                      Open payables — market chalan balances, broker slips and hire slips —
                      click for party-wise ageing with pending documents
                    </InfoHint>
                  </span>
                  <div className="mt-1 text-2xl font-black tabular-nums text-red-600">
                    {formatMoney(pay.total)}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-2 text-xs font-medium">
                    <span className="rounded bg-blue-500/10 px-2 py-0.5 text-blue-600">
                      {pay.parties} parties
                    </span>
                    {pay.b90 > 0 && (
                      <span className="rounded bg-red-500/10 px-2 py-0.5 text-red-600">
                        90+ days: {formatMoney(pay.b90)}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            </a>
          )}
        </div>
      )}

      {/* LR summary — each card drills into its own dashboard detail page */}
      {lrSummary.ok && (
        <Card>
          <CardContent className="space-y-3 p-5">
            <span className="text-lg font-semibold">LR Summary</span>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {lrSummary.cards.map((c) => (
                <a
                  key={c.view}
                  href={`/dashboard/lr-detail?view=${c.view}`}
                  target="_blank"
                  rel="noreferrer"
                  className="group/lr rounded-md border p-3 transition-all hover:border-primary/40 hover:shadow-card"
                >
                  <div className="flex items-center gap-1 text-[11px] font-medium uppercase text-muted-foreground">
                    <span className="group-hover/lr:text-primary">{LR_VIEW_META[c.view].title}</span>
                    <InfoHint>{LR_VIEW_META[c.view].info}</InfoHint>
                  </div>
                  <div className="text-xl font-bold tabular-nums">{c.count}</div>
                  {c.amount !== null && (
                    <div className="text-xs tabular-nums text-muted-foreground">
                      {formatMoney(c.amount)}
                    </div>
                  )}
                </a>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <a href="/eway" target="_blank" rel="noreferrer" className="group">
          <Card className="h-full transition-all hover:border-primary/40 hover:shadow-card">
            <CardContent className="flex items-start gap-3 p-5">
              <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <FileCheck2 className="h-6 w-6" />
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-lg font-semibold group-hover:text-primary">
                  E-Way Bill (3 Days)
                  <InfoHint>Expiring e-way bills — check &amp; extend from one screen</InfoHint>
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
                <span className="flex items-center gap-1.5 text-lg font-semibold group-hover:text-primary">
                  Document Registration
                  <InfoHint>Renewal workflow — bulk / individual status update</InfoHint>
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
                  {docExpired > 0 && (
                    <span className="rounded bg-red-500/15 px-2 py-0.5 font-semibold text-red-600">
                      EXPIRED: {docExpired}
                    </span>
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
                <span className="flex items-center gap-1.5 text-lg font-semibold group-hover:text-primary">
                  EMI Due
                  <InfoHint>Upcoming loan EMIs — pay from one list</InfoHint>
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

        <a href="/dashboard/tds-monitor" target="_blank" rel="noreferrer" className="group">
          <Card className="h-full transition-all hover:border-primary/40 hover:shadow-card">
            <CardContent className="flex items-start gap-3 p-5">
              <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Percent className="h-6 w-6" />
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-lg font-semibold group-hover:text-primary">
                  TDS Threshold Monitor
                  <InfoHint>
                    Supplier-wise limits per TDS section (heads connected in the TDS Master) —
                    who crossed, who is close, and the TDS still to deduct
                  </InfoHint>
                </span>
                <span className="mt-2 flex flex-wrap gap-2 text-xs font-medium">
                  {tds && tds.crossedCount > 0 && (
                    <span className="rounded bg-red-500/10 px-2 py-0.5 text-red-600">
                      Crossed: {tds.crossedCount}
                    </span>
                  )}
                  {tds && tds.nearCount > 0 && (
                    <span className="rounded bg-amber-500/10 px-2 py-0.5 text-amber-600">
                      Near limit: {tds.nearCount}
                    </span>
                  )}
                  {tds && tds.toDeductTotal > 0 ? (
                    <span className="rounded bg-red-500/10 px-2 py-0.5 text-red-600">
                      To deduct: {formatMoney(tds.toDeductTotal)}
                    </span>
                  ) : (
                    <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-emerald-600">
                      All clear
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
                <span className="flex items-center gap-1.5 text-lg font-semibold group-hover:text-primary">
                  Route Activity Monitor
                  <InfoHint>
                    Lane-wise trip activity from the last trip date — reconnect with parties on
                    inactive routes before they go cold
                  </InfoHint>
                </span>
                <span className="mt-2 flex flex-wrap gap-2 text-xs font-medium">
                  {laneSleeping > 0 && (
                    <span className="rounded bg-red-500/10 px-2 py-0.5 text-red-600">
                      🔴 Inactive: {laneSleeping}
                    </span>
                  )}
                  {laneCooling > 0 && (
                    <span className="rounded bg-amber-500/10 px-2 py-0.5 text-amber-700 dark:text-amber-500">
                      🟠 Slowing: {laneCooling}
                    </span>
                  )}
                  <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-emerald-600">
                    🟢 Active: {laneAlive}
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
