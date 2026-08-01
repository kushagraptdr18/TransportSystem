import type { Prisma } from "@prisma/client";
import { requireSession } from "@/lib/session";
import { authorize } from "@/lib/authz";
import { withTenant } from "@/lib/db";
import { toNum } from "@/lib/utils";
import { FilterBar, type FilterDef } from "@/components/data/filter-bar";
import { SimpleReport } from "@/components/accounts/simple-report";

export const dynamic = "force-dynamic";

const KIND_ROUTE: Record<string, string> = {
  PART_TRUCK: "billing/part-truck",
  FULL_TRUCK: "billing/full-truck",
  MANUAL: "billing/manual",
  GST: "billing/gst",
};

export async function OutstandingReceivableTab({
  searchParams,
}: {
  searchParams: {
    date_from?: string;
    date_to?: string;
    party?: string;
    source?: string;
    show_closed?: string;
  };
}) {
  const session = requireSession();
  await authorize(session, "reports", "view");

  const showClosed = searchParams.show_closed === "1";
  const source = searchParams.source; // INVOICE | BROKER_SLIP | undefined (all)

  const dateWhere =
    searchParams.date_from || searchParams.date_to
      ? {
          ...(searchParams.date_from ? { gte: new Date(searchParams.date_from + "T00:00:00") } : {}),
          ...(searchParams.date_to ? { lte: new Date(searchParams.date_to + "T23:59:59") } : {}),
        }
      : undefined;

  const { rows, parties } = await withTenant(session.tenantId, async (tx) => {
    const invoiceWhere: Prisma.InvoiceWhereInput = {
      firmId: session.firmId,
      fyId: session.fyId,
      deletedAt: null,
    };
    if (searchParams.party) invoiceWhere.partyId = searchParams.party;
    if (dateWhere) invoiceWhere.invoiceDate = dateWhere;

    const slipWhere: Prisma.BrokerSlipWhereInput = {
      firmId: session.firmId,
      fyId: session.fyId,
      deletedAt: null,
      partyId: searchParams.party ? searchParams.party : { not: null },
    };
    if (dateWhere) slipWhere.slipDate = dateWhere;

    const [invoices, slips, parties, allocations] = await Promise.all([
      source === "BROKER_SLIP"
        ? Promise.resolve([])
        : tx.invoice.findMany({ where: invoiceWhere, orderBy: { invoiceDate: "asc" } }),
      source === "INVOICE"
        ? Promise.resolve([])
        : tx.brokerSlip.findMany({ where: slipWhere, orderBy: { slipDate: "asc" } }),
      tx.party.findMany({
        where: { ledgerGroup: { in: ["CONSIGNEE_CONSIGNOR", "OWNER_BROKER"] }, isActive: true },
        orderBy: { name: "asc" },
      }),
      tx.voucherAllocation.findMany({
        where: {
          refType: { in: ["BILLING", "GST_BILLING", "BROKER_ENTRY"] },
          // only live vouchers of this firm + FY count towards received
          voucher: { deletedAt: null, firmId: session.firmId, fyId: session.fyId },
        },
        select: { refId: true, amount: true, tdsAmt: true, deduction: true, otherAmt: true },
      }),
    ]);
    return { invoices, slips, parties, allocations };
  }).then(({ invoices, slips, parties, allocations }) => {
    const settledByRef = new Map<string, number>();
    for (const a of allocations) {
      // approved deductions (TDS / deduction) settle the bill just like money
      // received — adjusted amounts never remain outstanding
      const settled =
        toNum(String(a.amount)) + toNum(String(a.tdsAmt)) + toNum(String(a.deduction));
      settledByRef.set(a.refId, (settledByRef.get(a.refId) ?? 0) + settled);
    }
    const partyById = new Map(parties.map((p) => [p.id, p.name]));
    const status = (total: number, outstanding: number) =>
      outstanding <= 0.009 ? "PAID" : outstanding < total - 0.009 ? "PARTLY PAID" : "UNPAID";

    const invoiceRows = invoices.map((i) => {
      const net = toNum(String(i.netTotal));
      const received = (settledByRef.get(i.id) ?? 0) + toNum(String(i.advance));
      const outstanding = Math.round((net - received) * 100) / 100;
      return {
        refNo: i.invoiceNo,
        date: i.invoiceDate.toISOString(),
        kind: i.kind,
        party: partyById.get(i.partyId) ?? "",
        netTotal: net,
        received,
        outstanding,
        status: status(net, outstanding),
        link: `${KIND_ROUTE[i.kind] ?? "billing/register"}?id=${i.id}`,
      };
    });

    // broker slip party side: total = pNetAmt; received = advance + settlement
    // (round-off / shortage written off at settlement count as adjusted)
    const slipRows = slips.map((s) => {
      const net = toNum(String(s.pNetAmt));
      const received =
        toNum(String(s.pAdvance)) +
        toNum(String(s.pPaidAmount)) +
        toNum(String(s.pRoundOff)) +
        toNum(String(s.pShortage)) +
        (settledByRef.get(s.id) ?? 0);
      const outstanding = Math.round((net - received) * 100) / 100;
      return {
        refNo: s.slipNo,
        date: s.slipDate.toISOString(),
        kind: "BROKER_SLIP",
        party: (s.partyId && partyById.get(s.partyId)) || "",
        netTotal: net,
        received,
        outstanding,
        status: status(net, outstanding),
        link: `broker/slip?id=${s.id}`,
      };
    });

    return {
      parties,
      rows: [...invoiceRows, ...slipRows]
        .filter((r) => r.netTotal > 0)
        .filter((r) => showClosed || r.outstanding > 0.009)
        .sort((a, b) => a.date.localeCompare(b.date)),
    };
  });

  const filters: FilterDef[] = [
    { type: "daterange", key: "date", label: "Date" },
    {
      type: "combobox",
      key: "party",
      label: "Party / Broker",
      options: parties.map((p) => ({
        value: p.id,
        label: p.ledgerGroup === "OWNER_BROKER" ? `${p.name} (Broker)` : p.name,
      })),
    },
    {
      type: "select",
      key: "source",
      label: "Type",
      options: [
        { value: "INVOICE", label: "Customer Invoices" },
        { value: "BROKER_SLIP", label: "Broker Slips" },
      ],
    },
    {
      type: "select",
      key: "show_closed",
      label: "Show Closed",
      options: [{ value: "1", label: "Include settled" }],
    },
  ];

  return (
    <div className="space-y-4">
      <FilterBar filters={filters} />
      <SimpleReport
        title={`${rows.length} receivable${rows.length === 1 ? "" : "s"} (customer invoices + broker slips)`}
        columns={[
          { key: "refNo", header: "Ref No", linkBase: "/", linkParamKey: "link" },
          { key: "date", header: "Date", kind: "date" },
          { key: "kind", header: "Type", kind: "badge" },
          { key: "party", header: "Party / Broker" },
          { key: "netTotal", header: "Total Amt", kind: "money" },
          { key: "received", header: "Received / Adj", kind: "money" },
          { key: "outstanding", header: "Outstanding", kind: "money" },
          { key: "status", header: "Status", kind: "badge" },
        ]}
        rows={rows}
        fileName="outstanding"
        emptyMessage="No outstanding receivables — everything is settled."
      />
    </div>
  );
}
