import { requireSession } from "@/lib/session";
import { authorize } from "@/lib/authz";
import { withTenant } from "@/lib/db";
import { toNum } from "@/lib/utils";
import { FilterBar, type FilterDef } from "@/components/data/filter-bar";
import { SimpleReport, type ReportRow } from "@/components/accounts/simple-report";

export const dynamic = "force-dynamic";

/**
 * TDS Receivable — TDS deducted by parties on receipts (allocation-level TDS
 * of receipt vouchers), for Income Tax return filing.
 */
export default async function TdsReceivablePage({
  searchParams,
}: {
  searchParams: { party?: string; date_from?: string; date_to?: string };
}) {
  const session = requireSession();
  await authorize(session, "reports", "view");

  const { rows, parties, fyLabel } = await withTenant(session.tenantId, async (tx) => {
    const [allocations, parties, fy] = await Promise.all([
      tx.voucherAllocation.findMany({
        where: {
          tdsAmt: { gt: 0 },
          voucher: {
            firmId: session.firmId,
            fyId: session.fyId,
            type: "RECEIPT",
            deletedAt: null,
            ...(searchParams.party ? { partyId: searchParams.party } : {}),
            ...(searchParams.date_from || searchParams.date_to
              ? {
                  voucherDate: {
                    ...(searchParams.date_from
                      ? { gte: new Date(searchParams.date_from + "T00:00:00") }
                      : {}),
                    ...(searchParams.date_to
                      ? { lte: new Date(searchParams.date_to + "T23:59:59") }
                      : {}),
                  },
                }
              : {}),
          },
        },
        include: { voucher: true },
        orderBy: { voucher: { voucherDate: "asc" } },
      }),
      tx.party.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
      tx.financialYear.findFirst({ where: { id: session.fyId } }),
    ]);
    return { rows: allocations, parties, fyLabel: fy?.label ?? "" };
  });

  const partyName = new Map(parties.map((p) => [p.id, p.name]));

  const data: ReportRow[] = rows.map((a) => ({
    date: a.voucher.voucherDate.toISOString(),
    party: (a.voucher.partyId && partyName.get(a.voucher.partyId)) || "",
    voucherNo: a.voucher.voucherNo,
    billNo: a.refNo,
    invoiceAmount: toNum(String(a.billAmt)),
    tdsAmt: toNum(String(a.tdsAmt)),
    fy: fyLabel,
    status: "RECEIVABLE",
  }));

  const filters: FilterDef[] = [
    {
      type: "combobox",
      key: "party",
      label: "Party",
      options: parties.map((p) => ({ value: p.id, label: p.name })),
    },
    { type: "daterange", key: "date", label: "Date" },
  ];

  return (
    <div className="space-y-4 p-4">
      <h1 className="page-title">TDS Receivable</h1>
      <p className="text-sm text-muted-foreground">
        TDS deducted by parties before payment (receipt-voucher allocations). Use this while
        filing the Income Tax return; export to Excel or print (Ctrl+P / print-to-PDF).
      </p>
      <FilterBar filters={filters} />
      <SimpleReport
        title={`${data.length} TDS entr${data.length === 1 ? "y" : "ies"}`}
        columns={[
          { key: "party", header: "Party Name" },
          { key: "voucherNo", header: "Voucher No" },
          { key: "billNo", header: "Bill No" },
          { key: "invoiceAmount", header: "Invoice Amount", kind: "money" },
          { key: "tdsAmt", header: "TDS Amount", kind: "money" },
          { key: "fy", header: "Financial Year" },
          { key: "date", header: "Date", kind: "date" },
          { key: "status", header: "Status", kind: "badge" },
        ]}
        rows={data}
        fileName="tds-receivable"
        emptyMessage="No TDS deducted on receipts in this period."
      />
    </div>
  );
}
