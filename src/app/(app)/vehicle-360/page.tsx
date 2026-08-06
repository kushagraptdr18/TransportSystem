import Link from "next/link";
import { requireSession } from "@/lib/session";
import { authorize } from "@/lib/authz";
import { withTenant } from "@/lib/db";
import { formatDate, formatMoney, toNum } from "@/lib/utils";
import { round2 } from "@/lib/calc/tds";
import { nextDueDate } from "@/lib/loan";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Picker360 } from "../party-360/picker";

export const dynamic = "force-dynamic";

/**
 * Vehicle-stamped ledger refTypes (urea, driver costs). Vehicle EXPENSE
 * vouchers are deliberately NOT here: their head legs carry no vehicle stamp —
 * the per-vehicle share lives in the allocation items, which are read
 * separately below.
 */
const STAMPED_REF_TYPES = [
  "ADBLUE",
  "TRIP_UREA",
  "DRIVER_ADVANCE",
  "DRIVER_FNF",
  "DRIVER_SALARY",
  "DRIVER_SALARY_PAY",
  "DRIVER_SHORTAGE",
];

/**
 * Vehicle 360° — one screen, the truck's whole world: earned vs spent, loan &
 * next EMI, documents with expiry, trips, drivers and open workshop jobs. All
 * read from what the modules already store.
 */
export default async function Vehicle360Page({ searchParams }: { searchParams: { id?: string } }) {
  const session = requireSession();
  await authorize(session, "reports", "view");
  const vehicleId = searchParams.id ?? null;

  const data = await withTenant(session.tenantId, async (tx) => {
    const vehicles = await tx.vehicle.findMany({
      where: { isActive: true },
      orderBy: { number: "asc" },
      select: { id: true, number: true, ownershipType: true },
    });
    if (!vehicleId) return { vehicles, view: null };
    const vehicle = vehicles.find((v) => v.id === vehicleId)
      ? await tx.vehicle.findFirst({ where: { id: vehicleId } })
      : null;
    if (!vehicle) return { vehicles, view: null };

    const scope = { firmId: session.firmId, fyId: session.fyId };
    const [chalans, slips, headSums, expenseItems, heads, loans, docs, assignments, drivers, works] =
      await Promise.all([
        tx.chalan.findMany({
          where: { ...scope, deletedAt: null, cancelledAt: null, vehicleId },
          orderBy: { chalanDate: "desc" },
          select: {
            chalanNo: true,
            chalanDate: true,
            freight: true,
            totalChalanAmt: true,
            grandTotal: true,
            paymentStatus: true,
          },
        }),
        tx.brokerSlip.findMany({
          where: { ...scope, deletedAt: null, vehicleId },
          orderBy: { slipDate: "desc" },
          select: { slipNo: true, slipDate: true, vChalanAmt: true },
        }),
        tx.ledgerEntry.groupBy({
          by: ["accountHeadId", "side"],
          where: { ...scope, vehicleId, accountHeadId: { not: null }, refType: { in: STAMPED_REF_TYPES } },
          _sum: { amount: true },
        }),
        // this vehicle's share of every expense bill (the head leg itself is
        // never vehicle-stamped — the allocation items carry the split)
        tx.vehicleExpenseItem.findMany({
          where: {
            vehicleId,
            voucher: { ...scope, deletedAt: null, txnType: "EXPENSE" },
          },
          include: { voucher: { include: { lines: true } } },
        }),
        tx.accountHead.findMany({ select: { id: true, name: true } }),
        tx.loan.findMany({
          where: { ...scope, deletedAt: null, vehicleId, status: "ACTIVE" },
          include: { emis: { where: { deletedAt: null }, select: { principal: true } } },
        }),
        tx.vehicleDocument.findMany({
          where: { vehicleId },
          include: { docType: true },
          orderBy: { expiryDate: "asc" },
        }),
        tx.driverAssignment.findMany({ where: { vehicleId }, orderBy: { fromDate: "desc" }, take: 6 }),
        tx.driver.findMany({ select: { id: true, name: true, mobile: true } }),
        tx.vehicleWork.findMany({
          where: { ...scope, deletedAt: null, vehicleId },
          orderBy: { workDate: "desc" },
          take: 6,
        }),
      ]);
    return { vehicles, view: { vehicle, chalans, slips, headSums, expenseItems, heads, loans, docs, assignments, drivers, works } };
  });

  const { vehicles, view } = data;

  let body: React.ReactNode = (
    <div className="rounded-md border p-10 text-center text-sm text-muted-foreground">
      Upar se gaadi chuno — uski poori kahani ek screen par.
    </div>
  );

  if (view) {
    const { vehicle, chalans, slips, headSums, expenseItems, heads, loans, docs, assignments, drivers, works } = view;
    const headName = new Map(heads.map((h) => [h.id, h.name]));
    const driverOf = new Map(drivers.map((d) => [d.id, d]));
    const isOwn = vehicle.ownershipType === "OWNER";

    // income: for own/relative vehicles the chalan freight is company income;
    // for a broker vehicle it is the hire we PAID (shown as cost, not income)
    const chalanTotal = round2(chalans.reduce((s, c) => s + toNum(c.freight), 0));
    const slipTotal = round2(slips.reduce((s, x) => s + toNum(x.vChalanAmt), 0));
    const earned = round2(chalanTotal + slipTotal);

    // expenses = vehicle-stamped ledger (urea, driver costs) net Dr − Cr,
    // PLUS this vehicle's share of expense bills from the allocation items —
    // a multi-head bill's share splits across its lines in proportion
    const perHead = new Map<string, { debit: number; credit: number }>();
    for (const g of headSums) {
      if (!g.accountHeadId) continue;
      const acc = perHead.get(g.accountHeadId) ?? { debit: 0, credit: 0 };
      const amt = toNum(String(g._sum.amount ?? 0));
      if (g.side === "DEBIT") acc.debit = round2(acc.debit + amt);
      else acc.credit = round2(acc.credit + amt);
      perHead.set(g.accountHeadId, acc);
    }
    for (const item of expenseItems) {
      const share = toNum(item.amount);
      const v = item.voucher;
      const vTotal = toNum(v.amount);
      const parts =
        v.lines.length && vTotal > 0
          ? v.lines.map((l, idx) => ({
              headId: l.headId,
              amount:
                idx === v.lines.length - 1
                  ? round2(
                      share -
                        v.lines
                          .slice(0, -1)
                          .reduce((s, x) => s + round2((share * toNum(x.amount)) / vTotal), 0)
                    )
                  : round2((share * toNum(l.amount)) / vTotal),
            }))
          : [{ headId: v.headId, amount: share }];
      for (const p of parts) {
        if (p.amount <= 0.009) continue;
        const acc = perHead.get(p.headId) ?? { debit: 0, credit: 0 };
        acc.debit = round2(acc.debit + p.amount);
        perHead.set(p.headId, acc);
      }
    }
    const expenseRows = Array.from(perHead.entries())
      .map(([id, s]) => ({ head: headName.get(id) ?? "", net: round2(s.debit - s.credit) }))
      .filter((r) => Math.abs(r.net) > 0.009)
      .sort((a, b) => b.net - a.net);
    const expenseTotal = round2(expenseRows.reduce((s, r) => s + r.net, 0));

    // loans: outstanding + next EMI
    const loanRows = loans.map((l) => {
      const repaid = round2(l.emis.reduce((s, e) => s + toNum(e.principal), 0));
      return {
        loanNo: l.loanNo,
        outstanding: round2(toNum(l.amount) - repaid),
        emiAmount: toNum(l.emiAmount),
        nextDue: nextDueDate(l.emiStartDate, l.emiFrequency, l.emis.length),
      };
    });
    const loanOutstanding = round2(loanRows.reduce((s, l) => s + l.outstanding, 0));

    const now = new Date();
    const currentAssignment = assignments.find((a) => !a.toDate);
    const currentDriver = currentAssignment ? driverOf.get(currentAssignment.driverId) : null;
    const openWorks = works.filter((w) => !w.completeDate);
    const netProfit = round2(earned - expenseTotal);

    body = (
      <div className="space-y-3">
        <Card>
          <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
            <div>
              <div className="text-xl font-bold">{vehicle.number}</div>
              <div className="text-sm text-muted-foreground">
                {vehicle.ownershipType === "OWNER"
                  ? "Own Vehicle"
                  : vehicle.ownershipType === "RELATIVE"
                    ? "Relative Vehicle"
                    : "Market / Broker Vehicle"}
              </div>
              <div className="mt-1 text-sm">
                Driver:{" "}
                {currentDriver ? (
                  <>
                    <b>{currentDriver.name}</b>
                    {currentDriver.mobile && (
                      <a className="ml-1 text-primary underline" href={`tel:${currentDriver.mobile}`}>
                        📞 {currentDriver.mobile}
                      </a>
                    )}
                  </>
                ) : (
                  <span className="text-muted-foreground">koi assigned nahi</span>
                )}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground">
                {isOwn ? "Net (kamai − kharcha, FY)" : "Is gaadi par hire (FY)"}
              </div>
              <div
                className={`text-2xl font-black tabular-nums ${
                  isOwn ? (netProfit >= 0 ? "text-emerald-600" : "text-red-600") : ""
                }`}
              >
                {isOwn ? formatMoney(netProfit) : formatMoney(earned)}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {(
            [
              [isOwn ? "Kamaya (chalan + slip)" : "Hire diya (chalan + slip)", formatMoney(earned), `${chalans.length + slips.length} trips`],
              ["Vehicle Kharcha (ledger net)", formatMoney(expenseTotal), ""],
              ["Loan Outstanding", formatMoney(loanOutstanding), loanRows.length ? `${loanRows.length} active loan` : "koi loan nahi"],
              [
                "Next EMI",
                loanRows.length && loanRows[0].nextDue ? formatDate(loanRows[0].nextDue.toISOString()) : "—",
                loanRows.length ? formatMoney(loanRows[0].emiAmount) : "",
              ],
            ] as [string, string, string][]
          ).map(([label, value, sub]) => (
            <div key={label} className="rounded-md border p-3">
              <div className="text-[11px] text-muted-foreground">{label}</div>
              <div className="text-lg font-bold tabular-nums">{value}</div>
              {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
            </div>
          ))}
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          {/* documents */}
          <div className="rounded-md border p-3">
            <div className="mb-1 text-xs font-black uppercase text-muted-foreground">Documents</div>
            {docs.length === 0 && <p className="text-xs text-muted-foreground">Koi document registration nahi.</p>}
            {docs.map((d) => {
              const expired = !!d.expiryDate && d.expiryDate < now;
              return (
                <div key={d.id} className="flex items-center justify-between border-b py-1 text-xs last:border-0">
                  <span className="font-medium">{d.docType.name}</span>
                  <span className="flex items-center gap-1.5">
                    {d.expiryDate ? (
                      <span className={expired ? "font-bold text-destructive" : ""}>
                        {formatDate(d.expiryDate.toISOString())}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">no expiry</span>
                    )}
                    {d.status === "PROBLEM" ? (
                      <Badge variant="destructive">Problem</Badge>
                    ) : d.status === "PROCESSING" ? (
                      <Badge variant="secondary">Processing</Badge>
                    ) : expired ? (
                      <Badge variant="destructive">Expired</Badge>
                    ) : null}
                  </span>
                </div>
              );
            })}
          </div>

          {/* expenses breakup */}
          <div className="rounded-md border p-3">
            <div className="mb-1 text-xs font-black uppercase text-muted-foreground">Kharcha Head-wise (FY)</div>
            {expenseRows.length === 0 && <p className="text-xs text-muted-foreground">Koi vehicle kharcha nahi.</p>}
            {expenseRows.slice(0, 10).map((r) => (
              <div key={r.head} className="flex items-center justify-between border-b py-1 text-xs last:border-0">
                <span>{r.head}</span>
                <span className="font-medium tabular-nums">{formatMoney(r.net)}</span>
              </div>
            ))}
          </div>

          {/* trips */}
          <div className="rounded-md border p-3">
            <div className="mb-1 text-xs font-black uppercase text-muted-foreground">
              Aakhri Trips ({chalans.length + slips.length} is FY)
            </div>
            {chalans.slice(0, 8).map((c) => (
              <div key={c.chalanNo} className="flex items-center justify-between border-b py-1 text-xs last:border-0">
                <span>
                  {formatDate(c.chalanDate.toISOString())} · <b>{c.chalanNo}</b>
                </span>
                <span className="tabular-nums">{formatMoney(toNum(c.freight))}</span>
              </div>
            ))}
            {slips.slice(0, 4).map((s) => (
              <div key={s.slipNo} className="flex items-center justify-between border-b py-1 text-xs last:border-0">
                <span>
                  {formatDate(s.slipDate.toISOString())} · <b>{s.slipNo}</b> (slip)
                </span>
                <span className="tabular-nums">{formatMoney(toNum(s.vChalanAmt))}</span>
              </div>
            ))}
            {chalans.length === 0 && slips.length === 0 && (
              <p className="text-xs text-muted-foreground">Is FY me koi trip nahi.</p>
            )}
          </div>

          {/* drivers + workshop */}
          <div className="rounded-md border p-3">
            <div className="mb-1 text-xs font-black uppercase text-muted-foreground">Driver History</div>
            {assignments.length === 0 && <p className="text-xs text-muted-foreground">Koi assignment nahi.</p>}
            {assignments.map((a) => (
              <div key={a.id} className="flex items-center justify-between border-b py-1 text-xs last:border-0">
                <span className="font-medium">{driverOf.get(a.driverId)?.name ?? ""}</span>
                <span className="text-muted-foreground">
                  {formatDate(a.fromDate.toISOString())} → {a.toDate ? formatDate(a.toDate.toISOString()) : "ab tak"}
                </span>
              </div>
            ))}
            <div className="mb-1 mt-3 text-xs font-black uppercase text-muted-foreground">
              Workshop / Extra Work {openWorks.length > 0 && <Badge variant="destructive">{openWorks.length} pending</Badge>}
            </div>
            {works.length === 0 && <p className="text-xs text-muted-foreground">Koi work entry nahi.</p>}
            {works.map((w) => (
              <div key={w.id} className="flex items-center justify-between gap-2 border-b py-1 text-xs last:border-0">
                <span className="truncate" title={w.description}>
                  {formatDate(w.workDate.toISOString())} · {w.description}
                </span>
                {w.completeDate ? <Badge>Done</Badge> : <Badge variant="destructive">Pending</Badge>}
              </div>
            ))}
            <Link className="mt-1 block text-xs text-primary underline" href="/vehicle/work">
              Extra Work screen →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="page-title">Vehicle 360°</h1>
          <p className="text-sm text-muted-foreground">
            Gaadi chuno — kamai, kharcha, EMI, documents, driver, workshop — sab ek screen par.
          </p>
        </div>
        <Picker360
          options={vehicles.map((v) => ({ value: v.id, label: `${v.number} (${v.ownershipType})` }))}
          value={vehicleId}
          base="/vehicle-360"
          placeholder="Vehicle chuno..."
        />
      </div>
      {body}
    </div>
  );
}
