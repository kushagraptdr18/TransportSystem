import { requireSession } from "@/lib/session";
import { authorize } from "@/lib/authz";
import { withTenant } from "@/lib/db";
import { toNum } from "@/lib/utils";
import { FilterBar, type FilterDef } from "@/components/data/filter-bar";
import { SimpleReport, type ReportRow } from "@/components/accounts/simple-report";

export const dynamic = "force-dynamic";

export default async function TdsReportPage({
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

  const rows: ReportRow[] = await withTenant(session.tenantId, async (tx) => {
    const scope = { firmId: session.firmId, fyId: session.fyId, deletedAt: null };
    const [vouchers, chalans, slips, parties, vehicles] = await Promise.all([
      tx.voucher.findMany({
        where: { ...scope, tdsAmt: { gt: 0 }, ...(dateWhere ? { voucherDate: dateWhere } : {}) },
      }),
      tx.chalan.findMany({
        where: { ...scope, tdsAmt: { gt: 0 }, ...(dateWhere ? { chalanDate: dateWhere } : {}) },
      }),
      tx.brokerSlip.findMany({
        where: { ...scope, vTdsAmt: { gt: 0 }, ...(dateWhere ? { slipDate: dateWhere } : {}) },
      }),
      tx.party.findMany({ select: { id: true, name: true, pan: true } }),
      tx.vehicle.findMany({ select: { id: true, number: true, ownerId: true } }),
    ]);
    const partyById = new Map(parties.map((p) => [p.id, p]));
    const vehicleById = new Map(vehicles.map((v) => [v.id, v]));

    const out: ReportRow[] = [];
    for (const v of vouchers) {
      const p = v.partyId ? partyById.get(v.partyId) : undefined;
      out.push({
        date: v.voucherDate.toISOString(),
        source: `${v.type} VOUCHER`,
        docNo: v.voucherNo,
        party: p?.name ?? "",
        pan: p?.pan ?? "",
        base: toNum(String(v.amount)),
        tds: toNum(String(v.tdsAmt)),
      });
    }
    for (const c of chalans) {
      const broker = partyById.get(c.brokerId);
      out.push({
        date: c.chalanDate.toISOString(),
        source: "FREIGHT CHALAN",
        docNo: c.chalanNo,
        party: broker?.name ?? vehicleById.get(c.vehicleId)?.number ?? "",
        pan: broker?.pan ?? "",
        base: toNum(String(c.freight)),
        tds: toNum(String(c.tdsAmt)),
      });
    }
    for (const s of slips) {
      const owner = s.ownerId ? partyById.get(s.ownerId) : undefined;
      out.push({
        date: s.slipDate.toISOString(),
        source: "BROKER SLIP",
        docNo: s.slipNo,
        party: owner?.name ?? s.ownerName ?? "",
        pan: owner?.pan ?? "",
        base: toNum(String(s.vFreight)),
        tds: toNum(String(s.vTdsAmt)),
      });
    }
    return out.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  });

  const filters: FilterDef[] = [{ type: "daterange", key: "date", label: "Date" }];

  return (
    <div className="space-y-4 p-4">
      <h1 className="page-title">TDS Report</h1>
      <FilterBar filters={filters} />
      <SimpleReport
        title={`${rows.length} documents with TDS deducted`}
        columns={[
          { key: "date", header: "Date", kind: "date" },
          { key: "source", header: "Source" },
          { key: "docNo", header: "Doc No" },
          { key: "party", header: "Deductee" },
          { key: "pan", header: "PAN" },
          { key: "base", header: "Base Amount", kind: "money" },
          { key: "tds", header: "TDS", kind: "money" },
        ]}
        rows={rows}
        fileName="tds-report"
        emptyMessage="No TDS deductions in this period."
      />
    </div>
  );
}
