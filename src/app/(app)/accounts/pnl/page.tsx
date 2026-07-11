import { requireSession } from "@/lib/session";
import { authorize } from "@/lib/authz";
import { withTenant } from "@/lib/db";
import { formatMoney, toNum } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FilterBar, type FilterDef } from "@/components/data/filter-bar";
import { SimpleReport } from "@/components/accounts/simple-report";

export const dynamic = "force-dynamic";

export default async function PnlPage({
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
    const [invoiceIncome, chalanCost, brokerCost, hireCost, heads, headEntries, vehicleExp] =
      await Promise.all([
        tx.invoice.aggregate({
          where: { ...scope, deletedAt: null, ...(dateWhere ? { invoiceDate: dateWhere } : {}) },
          _sum: { grandTotal: true },
        }),
        tx.chalan.aggregate({
          where: { ...scope, deletedAt: null, ...(dateWhere ? { chalanDate: dateWhere } : {}) },
          _sum: { grandTotal: true },
        }),
        tx.brokerSlip.aggregate({
          where: { ...scope, deletedAt: null, ...(dateWhere ? { slipDate: dateWhere } : {}) },
          _sum: { vNetAmt: true, pNetAmt: true },
        }),
        tx.hireSlip.aggregate({
          where: { ...scope, deletedAt: null, ...(dateWhere ? { slipDate: dateWhere } : {}) },
          _sum: { totalHire: true },
        }),
        tx.accountHead.findMany({ orderBy: { name: "asc" } }),
        tx.ledgerEntry.groupBy({
          by: ["accountHeadId", "side"],
          where: { ...scope, accountHeadId: { not: null }, ...(dateWhere ? { date: dateWhere } : {}) },
          _sum: { amount: true },
        }),
        tx.vehicleExpense.aggregate({
          where: { ...scope, ...(dateWhere ? { date: dateWhere } : {}) },
          _sum: { amount: true },
        }),
      ]);
    return { invoiceIncome, chalanCost, brokerCost, hireCost, heads, headEntries, vehicleExp };
  });

  const n = (v: unknown) => toNum(String(v ?? 0));
  const income = n(data.invoiceIncome._sum.grandTotal) + n(data.brokerCost._sum.pNetAmt);
  const expense =
    n(data.chalanCost._sum.grandTotal) +
    n(data.brokerCost._sum.vNetAmt) +
    n(data.hireCost._sum.totalHire) +
    n(data.vehicleExp._sum.amount);

  // account-head wise voucher income/expense
  const byHead = new Map<string, { debit: number; credit: number }>();
  for (const e of data.headEntries) {
    if (!e.accountHeadId) continue;
    const acc = byHead.get(e.accountHeadId) ?? { debit: 0, credit: 0 };
    if (e.side === "DEBIT") acc.debit += n(e._sum.amount);
    else acc.credit += n(e._sum.amount);
    byHead.set(e.accountHeadId, acc);
  }
  const headRows = data.heads
    .map((h) => {
      const acc = byHead.get(h.id) ?? { debit: 0, credit: 0 };
      const net = h.kind === "INCOME" ? acc.credit - acc.debit : acc.debit - acc.credit;
      return { head: h.name, kind: h.kind, debit: acc.debit, credit: acc.credit, net };
    })
    .filter((r) => r.debit !== 0 || r.credit !== 0);
  const headIncome = headRows.filter((r) => r.kind === "INCOME").reduce((s, r) => s + r.net, 0);
  const headExpense = headRows.filter((r) => r.kind === "EXPENSE").reduce((s, r) => s + r.net, 0);

  const totalIncome = income + headIncome;
  const totalExpense = expense + headExpense;
  const profit = totalIncome - totalExpense;

  const filters: FilterDef[] = [{ type: "daterange", key: "date", label: "Period" }];

  const summary = [
    { label: "Billing Income (Invoices)", value: n(data.invoiceIncome._sum.grandTotal) },
    { label: "Broker Party Side (Receivable)", value: n(data.brokerCost._sum.pNetAmt) },
    { label: "Other Income (Vouchers)", value: headIncome },
    { label: "Freight Chalan Cost", value: n(data.chalanCost._sum.grandTotal) },
    { label: "Broker Owner Side (Payable)", value: n(data.brokerCost._sum.vNetAmt) },
    { label: "Lorry Hire", value: n(data.hireCost._sum.totalHire) },
    { label: "Vehicle Expenses", value: n(data.vehicleExp._sum.amount) },
    { label: "Other Expenses (Vouchers)", value: headExpense },
  ];

  return (
    <div className="space-y-4 p-4">
      <h1 className="page-title">Profit &amp; Loss</h1>
      <FilterBar filters={filters} />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="p-4 pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Income</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-2xl font-semibold tabular-nums text-emerald-600">
            {formatMoney(totalIncome)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="p-4 pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Expense</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-2xl font-semibold tabular-nums text-destructive">
            {formatMoney(totalExpense)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="p-4 pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {profit >= 0 ? "Net Profit" : "Net Loss"}
            </CardTitle>
          </CardHeader>
          <CardContent
            className={`p-4 pt-0 text-2xl font-semibold tabular-nums ${profit >= 0 ? "text-emerald-600" : "text-destructive"}`}
          >
            {formatMoney(Math.abs(profit))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm font-medium">Components</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-x-8 gap-y-1 p-4 pt-0 text-sm sm:grid-cols-2">
          {summary.map((s) => (
            <div key={s.label} className="flex justify-between tabular-nums">
              <span className="text-muted-foreground">{s.label}</span>
              <span>{formatMoney(s.value)}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <SimpleReport
        title="Account-head wise (from vouchers)"
        columns={[
          { key: "head", header: "Account Head" },
          { key: "kind", header: "Type", kind: "badge" },
          { key: "debit", header: "Debit", kind: "money" },
          { key: "credit", header: "Credit", kind: "money" },
          { key: "net", header: "Net", kind: "money" },
        ]}
        rows={headRows}
        fileName="pnl-account-heads"
        emptyMessage="No voucher activity on income/expense heads yet."
      />
    </div>
  );
}
