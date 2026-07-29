import { requireSession } from "@/lib/session";
import { authorize } from "@/lib/authz";
import { withTenant } from "@/lib/db";
import { toNum } from "@/lib/utils";
import { FilterBar } from "@/components/data/filter-bar";
import { TdsReportTable, type TdsReportRow } from "@/components/accounts/tds-report-table";

export const dynamic = "force-dynamic";

/**
 * TDS Payable Register — every voucher carrying TDS (header field or a TDS
 * adjustment line) appears here automatically on create / edit / delete.
 */
export default async function TdsReportPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const session = requireSession();
  await authorize(session, "vouchers", "view");
  const { date_from, date_to, party } = searchParams;

  const { rows, parties, fyLabel } = await withTenant(session.tenantId, async (tx) => {
    const [vouchers, parties, fy] = await Promise.all([
      tx.voucher.findMany({
        where: {
          firmId: session.firmId,
          fyId: session.fyId,
          deletedAt: null,
          ...(date_from || date_to
            ? {
                voucherDate: {
                  ...(date_from ? { gte: new Date(date_from + "T00:00:00") } : {}),
                  ...(date_to ? { lte: new Date(date_to + "T23:59:59") } : {}),
                },
              }
            : {}),
          ...(party ? { partyId: party } : {}),
          OR: [
            { tdsAmt: { gt: 0 } },
            { adjustments: { some: { adjustmentType: "TDS", amount: { gt: 0 } } } },
            { allocations: { some: { tdsAmt: { gt: 0 } } } },
          ],
        },
        include: { adjustments: true, allocations: true },
        orderBy: { voucherDate: "desc" },
      }),
      tx.party.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
      tx.financialYear.findUnique({ where: { id: session.fyId } }),
    ]);
    return { rows: vouchers, parties, fyLabel: fy?.label ?? "" };
  });

  const partyName = (id: string | null) =>
    id ? parties.find((p) => p.id === id)?.name ?? "" : "";

  const data: TdsReportRow[] = rows.map((v) => {
    const adjTds = v.adjustments
      .filter((a) => a.adjustmentType === "TDS")
      .reduce((s, a) => s + toNum(String(a.amount)), 0);
    const allocTds = v.allocations.reduce((s, a) => s + toNum(String(a.tdsAmt)), 0);
    const tdsAmt = toNum(String(v.tdsAmt)) + adjTds + allocTds;
    const gross = toNum(String(v.amount));
    const refs = Array.from(
      new Set([
        ...v.allocations.map((a) => a.refNo),
        ...v.adjustments.filter((a) => a.adjustmentType === "TDS").map((a) => a.referenceNo),
      ])
    ).filter(Boolean);
    const pcts = Array.from(
      new Set(v.allocations.map((a) => toNum(String(a.tdsPct))).filter((p) => p > 0))
    );
    return {
      id: v.id,
      voucherNo: v.voucherNo,
      voucherDate: v.voucherDate.toISOString(),
      voucherType: v.type,
      party: partyName(v.partyId),
      reference: refs.join(", "),
      gross,
      tdsPct: pcts.length ? pcts.join(", ") : gross > 0 ? String(Math.round((tdsAmt / gross) * 10000) / 100) : "",
      tdsAmt,
      netPayment: toNum(String(v.netAmount)),
      financialYear: fyLabel,
      remarks: v.remarks ?? "",
    };
  });

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-semibold">TDS Report / TDS Payable Register</h1>
      <FilterBar
        filters={[
          { type: "daterange", key: "date", label: "Date" },
          {
            type: "combobox",
            key: "party",
            label: "Party",
            options: parties.map((p) => ({ value: p.id, label: p.name })),
          },
        ]}
      />
      <TdsReportTable rows={data} />
    </div>
  );
}
