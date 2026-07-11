import type { Prisma } from "@prisma/client";
import { requireSession } from "@/lib/session";
import { authorize } from "@/lib/authz";
import { withTenant } from "@/lib/db";
import { toNum } from "@/lib/utils";
import { FilterBar, type FilterDef } from "@/components/data/filter-bar";
import { SimpleReport } from "@/components/accounts/simple-report";

export const dynamic = "force-dynamic";

export default async function OutstandingPage({
  searchParams,
}: {
  searchParams: { date_from?: string; date_to?: string; party?: string };
}) {
  const session = requireSession();
  await authorize(session, "reports", "view");

  const { rows, parties } = await withTenant(session.tenantId, async (tx) => {
    const where: Prisma.InvoiceWhereInput = {
      firmId: session.firmId,
      fyId: session.fyId,
      deletedAt: null,
    };
    if (searchParams.party) where.partyId = searchParams.party;
    if (searchParams.date_from || searchParams.date_to) {
      where.invoiceDate = {
        ...(searchParams.date_from ? { gte: new Date(searchParams.date_from + "T00:00:00") } : {}),
        ...(searchParams.date_to ? { lte: new Date(searchParams.date_to + "T23:59:59") } : {}),
      };
    }
    const [invoices, parties, allocations] = await Promise.all([
      tx.invoice.findMany({ where, orderBy: { invoiceDate: "asc" } }),
      tx.party.findMany({ where: { ledgerGroup: "CONSIGNEE_CONSIGNOR" }, orderBy: { name: "asc" } }),
      tx.voucherAllocation.findMany({
        where: { refType: { in: ["BILLING", "GST_BILLING"] } },
        select: { refId: true, amount: true },
      }),
    ]);
    return { rows: invoices, parties, allocations };
  }).then(({ rows, parties, allocations }) => {
    const receivedByInvoice = new Map<string, number>();
    for (const a of allocations) {
      receivedByInvoice.set(a.refId, (receivedByInvoice.get(a.refId) ?? 0) + toNum(String(a.amount)));
    }
    const partyById = new Map(parties.map((p) => [p.id, p.name]));
    return {
      parties,
      rows: rows
        .map((i) => {
          const net = toNum(String(i.netTotal));
          const received = (receivedByInvoice.get(i.id) ?? 0) + toNum(String(i.advance));
          return {
            invoiceNo: i.invoiceNo,
            date: i.invoiceDate.toISOString(),
            kind: i.kind,
            party: partyById.get(i.partyId) ?? "",
            netTotal: net,
            received,
            outstanding: Math.round((net - received) * 100) / 100,
          };
        })
        .filter((r) => r.outstanding > 0.009),
    };
  });

  const filters: FilterDef[] = [
    { type: "daterange", key: "date", label: "Invoice Date" },
    {
      type: "combobox",
      key: "party",
      label: "Party",
      options: parties.map((p) => ({ value: p.id, label: p.name })),
    },
  ];

  return (
    <div className="space-y-4 p-4">
      <h1 className="page-title">Outstanding (Receivables)</h1>
      <FilterBar filters={filters} />
      <SimpleReport
        title={`${rows.length} unpaid / partly-paid invoices`}
        columns={[
          { key: "invoiceNo", header: "Invoice No" },
          { key: "date", header: "Date", kind: "date" },
          { key: "kind", header: "Type", kind: "badge" },
          { key: "party", header: "Party" },
          { key: "netTotal", header: "Invoice Amt", kind: "money" },
          { key: "received", header: "Received / Adv", kind: "money" },
          { key: "outstanding", header: "Outstanding", kind: "money" },
        ]}
        rows={rows}
        fileName="outstanding"
        emptyMessage="No outstanding invoices — everything is settled."
      />
    </div>
  );
}
