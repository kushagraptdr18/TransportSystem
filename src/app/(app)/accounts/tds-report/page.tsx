import { requireSession } from "@/lib/session";
import { authorize } from "@/lib/authz";
import { withTenant } from "@/lib/db";
import { toNum } from "@/lib/utils";
import { FilterBar, type FilterDef } from "@/components/data/filter-bar";
import { SimpleReport, type ReportRow } from "@/components/accounts/simple-report";

export const dynamic = "force-dynamic";

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * TDS PAYABLE Register — TDS OUR company deducts while MAKING payments.
 * Sources: Chalan (owner payment side), Broker Slip (owner payment side),
 * PAYMENT vouchers. Receipt vouchers NEVER appear here.
 */
export default async function TdsPayableRegisterPage({
  searchParams,
}: {
  searchParams: {
    q?: string;
    tds?: string;
    party?: string;
    module?: string;
    date_from?: string;
    date_to?: string;
  };
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

  const { rows, parties, fyLabel } = await withTenant(session.tenantId, async (tx) => {
    const scope = { firmId: session.firmId, fyId: session.fyId, deletedAt: null };
    const [payVouchers, chalans, slips, parties, fy] = await Promise.all([
      // PAYMENT vouchers only — receipts must never appear in TDS Payable
      tx.voucher.findMany({
        where: {
          ...scope,
          type: "PAYMENT",
          ...(dateWhere ? { voucherDate: dateWhere } : {}),
          OR: [{ tdsAmt: { gt: 0 } }, { allocations: { some: { tdsAmt: { gt: 0 } } } }],
        },
        include: { allocations: true },
      }),
      tx.chalan.findMany({
        where: { ...scope, tdsAmt: { gt: 0 }, ...(dateWhere ? { chalanDate: dateWhere } : {}) },
      }),
      tx.brokerSlip.findMany({
        where: { ...scope, vTdsAmt: { gt: 0 }, ...(dateWhere ? { slipDate: dateWhere } : {}) },
      }),
      tx.party.findMany({ select: { id: true, name: true, pan: true } }),
      tx.financialYear.findFirst({ where: { id: session.fyId } }),
    ]);
    const partyById = new Map(parties.map((p) => [p.id, p]));

    const out: ReportRow[] = [];
    for (const v of payVouchers) {
      const p = v.partyId ? partyById.get(v.partyId) : undefined;
      const allocTds = v.allocations.filter((a) => toNum(String(a.tdsAmt)) > 0);
      if (allocTds.length) {
        for (const a of allocTds) {
          out.push({
            voucherNo: v.voucherNo,
            date: v.voucherDate.toISOString(),
            module: "PAYMENT VOUCHER",
            party: p?.name ?? "",
            pan: p?.pan ?? "",
            refNo: a.refNo,
            invoiceAmount: toNum(String(a.billAmt)),
            tdsPct: toNum(String(a.tdsPct)),
            tdsAmt: toNum(String(a.tdsAmt)),
            net: r2(toNum(String(a.amount))),
            remarks: a.remarks ?? v.remarks ?? "",
          });
        }
      } else if (toNum(String(v.tdsAmt)) > 0) {
        out.push({
          voucherNo: v.voucherNo,
          date: v.voucherDate.toISOString(),
          module: "PAYMENT VOUCHER",
          party: p?.name ?? "",
          pan: p?.pan ?? "",
          refNo: v.voucherNo,
          invoiceAmount: toNum(String(v.amount)),
          tdsPct: 0,
          tdsAmt: toNum(String(v.tdsAmt)),
          net: toNum(String(v.netAmount)),
          remarks: v.remarks ?? "",
        });
      }
    }
    for (const c of chalans) {
      const p = partyById.get(c.brokerId);
      out.push({
        voucherNo: c.chalanNo,
        date: c.chalanDate.toISOString(),
        module: "CHALLAN (OWNER)",
        party: p?.name ?? "",
        pan: p?.pan ?? "",
        refNo: c.chalanNo,
        invoiceAmount: toNum(String(c.totalChalanAmt)),
        tdsPct: toNum(String(c.tdsPct)),
        tdsAmt: toNum(String(c.tdsAmt)),
        net: toNum(String(c.grandTotal)),
        remarks: c.remarks ?? "",
      });
    }
    for (const s of slips) {
      const p = s.ownerId ? partyById.get(s.ownerId) : undefined;
      out.push({
        voucherNo: s.slipNo,
        date: s.slipDate.toISOString(),
        module: "BROKER SLIP (OWNER)",
        party: p?.name ?? s.ownerName ?? "",
        pan: p?.pan ?? "",
        refNo: s.slipNo,
        invoiceAmount: toNum(String(s.vChalanAmt)),
        tdsPct: toNum(String(s.vTdsPct)),
        tdsAmt: toNum(String(s.vTdsAmt)),
        net: toNum(String(s.vNetAmt)),
        remarks: s.vRemarks ?? "",
      });
    }
    return {
      rows: out.sort((a, b) => String(a.date).localeCompare(String(b.date))),
      parties,
      fyLabel: fy?.label ?? "",
    };
  });

  let filtered: ReportRow[] = rows.map((r) => ({ ...r, fy: fyLabel }));
  if (searchParams.party) {
    const name = parties.find((p) => p.id === searchParams.party)?.name ?? "";
    filtered = filtered.filter((r) => r.party === name);
  }
  if (searchParams.module) filtered = filtered.filter((r) => r.module === searchParams.module);
  if (searchParams.q) {
    const q = searchParams.q.toLowerCase();
    filtered = filtered.filter(
      (r) =>
        String(r.voucherNo).toLowerCase().includes(q) || String(r.refNo).toLowerCase().includes(q)
    );
  }
  if (searchParams.tds) {
    filtered = filtered.filter((r) => String(r.tdsPct) === searchParams.tds?.trim());
  }

  const filters: FilterDef[] = [
    { type: "text", key: "q", label: "Voucher / Ref No..." },
    { type: "text", key: "tds", label: "TDS % (exact)..." },
    { type: "daterange", key: "date", label: "Date" },
    {
      type: "combobox",
      key: "party",
      label: "Party",
      options: parties.map((p) => ({ value: p.id, label: p.name })),
    },
    {
      type: "select",
      key: "module",
      label: "Module",
      options: [
        { value: "PAYMENT VOUCHER", label: "Payment Voucher" },
        { value: "CHALLAN (OWNER)", label: "Challan (Owner)" },
        { value: "BROKER SLIP (OWNER)", label: "Broker Slip (Owner)" },
      ],
    },
  ];

  return (
    <div className="space-y-4 p-4">
      <h1 className="page-title">TDS Payable Register</h1>
      <p className="text-sm text-muted-foreground">
        TDS deducted by OUR company while making payments (challan owner side, broker slip owner
        side, payment vouchers). Receipt-voucher TDS never appears here — see the TDS Receivable
        Register.
      </p>
      <FilterBar filters={filters} />
      <SimpleReport
        title={`${filtered.length} TDS entr${filtered.length === 1 ? "y" : "ies"} — FY ${fyLabel}`}
        columns={[
          { key: "voucherNo", header: "Voucher No" },
          { key: "date", header: "Voucher Date", kind: "date" },
          { key: "module", header: "Module", kind: "badge" },
          { key: "party", header: "Party Name" },
          { key: "pan", header: "PAN" },
          { key: "refNo", header: "Reference No" },
          { key: "invoiceAmount", header: "Invoice Amount", kind: "money" },
          { key: "tdsPct", header: "TDS %" },
          { key: "tdsAmt", header: "TDS Amount", kind: "money" },
          { key: "net", header: "Net Paid", kind: "money" },
          { key: "fy", header: "FY" },
          { key: "remarks", header: "Remarks" },
        ]}
        rows={filtered}
        fileName="tds-payable-register"
        emptyMessage="No TDS deducted on payments in this period."
      />
    </div>
  );
}
