import { requireSession } from "@/lib/session";
import { authorize } from "@/lib/authz";
import { withTenant } from "@/lib/db";
import { formatMoney, toNum } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FilterBar, type FilterDef } from "@/components/data/filter-bar";
import { SimpleReport, type ReportRow } from "@/components/accounts/simple-report";

export const dynamic = "force-dynamic";

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Operational Profit & Loss — the transport business only.
 *
 * Revenue: LR freight already billed (Lr.total via InvoiceLr on live
 * invoices — invoice ADDITIONAL charges are deliberately NOT LR revenue),
 * LR freight still awaiting a bill, and the broker (party) side of broker
 * slips. Expenses: the owner side of chalans and broker slips (lorry hire),
 * plus every operational ledger head.
 *
 * Excluded on purpose:
 *  - Vehicle-module entries (vehicle expenses, allocations, AdBlue, trip
 *    urea, driver salary/advance/FNF/shortage) — costed in Vehicle P&L.
 *  - EVERY Finance-module entry: loan disbursements, every EMI voucher,
 *    every Other Receipt/Payment voucher, and the "Vehicle EMI Expense"
 *    head — financing is never operational.
 *  - Chalan / broker-slip ledger legs — those documents are already counted
 *    at document value, so their ledger echoes would double-count.
 *  - The "Freight Income" head — that is the billed revenue itself; invoice
 *    ADDITIONAL charge heads stay in ledger income, per their own heads.
 *
 * Ledger heads classify AUTOMATICALLY by their DR/CR balance in the period:
 * net credit → Ledger Head Income, net debit → Ledger Head Expense. No
 * manual mapping — a new head appears in the right section the first time
 * it is used.
 */

const EXCLUDED_REF_TYPES = [
  // vehicle module
  "VEHICLE_EXPENSE",
  "VEH_EXP_ALLOC",
  "ADBLUE",
  "TRIP_UREA",
  "DRIVER_ADVANCE",
  "DRIVER_FNF",
  "DRIVER_SALARY",
  "DRIVER_SALARY_PAY",
  "DRIVER_SHORTAGE",
  // finance module
  "LOAN",
  // documents already counted at document value above
  "CHALAN",
  "CHALAN_ADVANCE",
  "CHALAN_BALANCE",
  "CHALAN_BALANCE_ADJ",
  "FREIGHT_CHALLAN",
  "BROKER_SLIP",
  "BROKER_SLIP_ADVANCE",
  "BROKER_SLIP_EXP_TRANSFER",
  "BROKER_ENTRY",
];

const EXCLUDED_HEADS = ["Vehicle EMI Expense", "Freight Income"];

export default async function OperationalPnlPage({
  searchParams,
}: {
  searchParams: { date_from?: string; date_to?: string };
}) {
  const session = requireSession();
  await authorize(session, "reports", "view");

  const dateWhere =
    searchParams.date_from || searchParams.date_to
      ? {
          ...(searchParams.date_from ? { gte: new Date(searchParams.date_from + "T00:00:00") } : {}),
          ...(searchParams.date_to ? { lte: new Date(searchParams.date_to + "T23:59:59") } : {}),
        }
      : undefined;

  const data = await withTenant(session.tenantId, async (tx) => {
    const scope = { firmId: session.firmId, fyId: session.fyId };

    // finance postings ride the generic VOUCHER refType, so the module's
    // vouchers (EMIs + other receipts/payments) are excluded by id
    const [emiVouchers, financeTxns] = await Promise.all([
      tx.loanEmi.findMany({
        where: { ...scope, deletedAt: null, voucherId: { not: null } },
        select: { voucherId: true },
      }),
      tx.financeTxn.findMany({
        where: { ...scope, voucherId: { not: null } },
        select: { voucherId: true },
      }),
    ]);
    const financeVoucherIds = Array.from(
      new Set(
        [...emiVouchers, ...financeTxns].map((v) => v.voucherId).filter(Boolean) as string[]
      )
    );

    const [billedLrLinks, pendingLrs, slips, chalans, heads, headSums] = await Promise.all([
      // LRs on LIVE invoices — billed in the period the BILL was made
      tx.invoiceLr.findMany({
        where: {
          invoice: {
            ...scope,
            deletedAt: null,
            ...(dateWhere ? { invoiceDate: dateWhere } : {}),
          },
        },
        include: { lr: true },
      }),
      // LRs with no live bill yet — revenue still waiting to be billed
      tx.lr.findMany({
        where: {
          ...scope,
          deletedAt: null,
          lrType: { notIn: ["CANCELLED", "PAPER_CHANGE"] },
          invoiceLrs: { none: {} },
          ...(dateWhere ? { lrDate: dateWhere } : {}),
        },
        select: { total: true },
      }),
      tx.brokerSlip.aggregate({
        where: { ...scope, deletedAt: null, ...(dateWhere ? { slipDate: dateWhere } : {}) },
        _sum: { pNetAmt: true, vNetAmt: true },
      }),
      tx.chalan.aggregate({
        where: { ...scope, deletedAt: null, ...(dateWhere ? { chalanDate: dateWhere } : {}) },
        _sum: { grandTotal: true },
      }),
      tx.accountHead.findMany({ select: { id: true, name: true, kind: true } }),
      tx.ledgerEntry.groupBy({
        by: ["accountHeadId", "side"],
        where: {
          ...scope,
          accountHeadId: { not: null },
          refType: { notIn: EXCLUDED_REF_TYPES },
          // every voucher the Finance module created (EMI / other
          // receipts & payments) is financial, never operational
          ...(financeVoucherIds.length
            ? { NOT: { refType: "VOUCHER", refId: { in: financeVoucherIds } } }
            : {}),
          ...(dateWhere ? { date: dateWhere } : {}),
        },
        _sum: { amount: true },
      }),
    ]);

    return { billedLrLinks, pendingLrs, slips, chalans, heads, headSums };
  });

  const { billedLrLinks, pendingLrs, slips, chalans, heads, headSums } = data;

  // ---- revenue ----
  const billedLr = r2(billedLrLinks.reduce((s, l) => s + toNum(String(l.lr.total)), 0));
  const pendingLr = r2(pendingLrs.reduce((s, l) => s + toNum(String(l.total)), 0));
  const brokerRevenue = r2(toNum(String(slips._sum.pNetAmt ?? 0)));
  const totalRevenue = r2(billedLr + pendingLr + brokerRevenue);

  // ---- lorry hire ----
  const chalanOwner = r2(toNum(String(chalans._sum.grandTotal ?? 0)));
  const brokerOwner = r2(toNum(String(slips._sum.vNetAmt ?? 0)));
  const lorryHire = r2(chalanOwner + brokerOwner);

  // ---- ledger heads (operational only) ----
  const headById = new Map(heads.map((h) => [h.id, h]));
  const perHead = new Map<string, { debit: number; credit: number }>();
  for (const g of headSums) {
    if (!g.accountHeadId) continue;
    const acc = perHead.get(g.accountHeadId) ?? { debit: 0, credit: 0 };
    const amt = toNum(String(g._sum.amount ?? 0));
    if (g.side === "DEBIT") acc.debit = r2(acc.debit + amt);
    else acc.credit = r2(acc.credit + amt);
    perHead.set(g.accountHeadId, acc);
  }
  const headRows: ReportRow[] = [];
  let ledgerIncome = 0;
  let ledgerExpense = 0;
  for (const [headId, sums] of Array.from(perHead.entries())) {
    const head = headById.get(headId);
    if (!head || EXCLUDED_HEADS.includes(head.name)) continue;
    // automatic classification by the period's DR/CR balance — net credit is
    // income, net debit is expense; no manual mapping, whatever the head's
    // master kind says
    const balance = r2(sums.credit - sums.debit);
    if (Math.abs(balance) < 0.009) continue;
    const isIncome = balance > 0;
    const net = Math.abs(balance);
    if (isIncome) ledgerIncome = r2(ledgerIncome + net);
    else ledgerExpense = r2(ledgerExpense + net);
    headRows.push({
      head: head.name,
      kind: isIncome ? "INCOME" : "EXPENSE",
      debit: sums.debit,
      credit: sums.credit,
      net,
    });
  }
  headRows.sort((a, b) =>
    String(a.kind).localeCompare(String(b.kind)) || String(a.head).localeCompare(String(b.head))
  );

  const profit = r2(totalRevenue - lorryHire - ledgerExpense + ledgerIncome);

  const filters: FilterDef[] = [{ type: "daterange", key: "date", label: "Period" }];

  const money = (v: number) => formatMoney(v);
  const line = (label: string, value: number, strong = false, negative = false) => (
    <div
      key={label}
      className={`flex justify-between py-0.5 ${strong ? "border-t pt-1 font-semibold" : ""}`}
    >
      <span>{label}</span>
      <span className="tabular-nums">
        {negative ? "− " : ""}
        {money(Math.abs(value))}
      </span>
    </div>
  );

  return (
    <div className="space-y-4 p-4">
      <h1 className="page-title">Operational Profit &amp; Loss</h1>
      <p className="text-sm text-muted-foreground">
        Transport operations only — vehicle-module costs, loan EMIs and finance entries are
        excluded (see Vehicle P&amp;L and Finance for those). Invoice additional charges are
        not LR revenue; they appear under their own ledger heads below.
      </p>
      <FilterBar filters={filters} />

      {/* ---- KPI ---- */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm text-muted-foreground">Total Operational Revenue</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold tabular-nums">{money(totalRevenue)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm text-muted-foreground">Total Operational Expenses</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold tabular-nums">
            {money(r2(lorryHire + ledgerExpense))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm text-muted-foreground">Operational Profit / Loss</CardTitle>
          </CardHeader>
          <CardContent
            className={`text-2xl font-bold tabular-nums ${profit >= 0 ? "text-emerald-600" : "text-destructive"}`}
          >
            {money(profit)}
          </CardContent>
        </Card>
      </div>

      {/* ---- sections ---- */}
      <div className="grid gap-3 text-sm lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Income</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                LR Revenue
              </div>
              {line(`Billed LR Amount (${billedLrLinks.length} LRs)`, billedLr)}
              {line(`Pending LR Amount (${pendingLrs.length} LRs, bill not yet made)`, pendingLr)}
              {line("Broker Revenue (broker slip party side)", brokerRevenue)}
              {line("Total Operational Revenue", totalRevenue, true)}
            </div>
            <div>
              <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                Ledger Head Income
              </div>
              {headRows
                .filter((rw) => rw.kind === "INCOME")
                .map((rw) => line(String(rw.head), Number(rw.net)))}
              {line("Total Ledger Income", ledgerIncome, true)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Expenses</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                Lorry Hire Expenses
              </div>
              {line("Challan Owner Expenses", chalanOwner)}
              {line("Broker Owner Expenses (slip owner side)", brokerOwner)}
              {line("Total Lorry Hire Expenses", lorryHire, true)}
            </div>
            <div>
              <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                Ledger Head Expenses
              </div>
              {headRows
                .filter((rw) => rw.kind === "EXPENSE")
                .map((rw) => line(String(rw.head), Number(rw.net)))}
              {line("Total Ledger Expenses", ledgerExpense, true)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ---- summary ---- */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Summary</CardTitle>
        </CardHeader>
        <CardContent className="max-w-md text-sm">
          {line("Total Operational Revenue", totalRevenue)}
          {line("Total Lorry Hire Expenses", lorryHire, false, true)}
          {line("Total Ledger Expenses", ledgerExpense, false, true)}
          {line("Total Ledger Income", ledgerIncome)}
          <div
            className={`mt-1 flex justify-between border-t pt-1 text-base font-bold ${profit >= 0 ? "text-emerald-600" : "text-destructive"}`}
          >
            <span>Operational Profit / Loss</span>
            <span className="tabular-nums">{money(profit)}</span>
          </div>
        </CardContent>
      </Card>

      {/* ---- head detail with export ---- */}
      <SimpleReport
        title="Operational ledger heads (vehicle-module, finance and document-echo entries excluded)"
        columns={[
          { key: "head", header: "Ledger Head" },
          { key: "kind", header: "Kind", kind: "badge" },
          { key: "debit", header: "Debit", kind: "money" },
          { key: "credit", header: "Credit", kind: "money" },
          { key: "net", header: "Net", kind: "money" },
        ]}
        rows={headRows}
        fileName="operational-pnl-heads"
        emptyMessage="No operational ledger activity in this period."
      />
    </div>
  );
}
