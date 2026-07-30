import { requireSession } from "@/lib/session";
import { authorize } from "@/lib/authz";
import { withTenant } from "@/lib/db";
import { toNum } from "@/lib/utils";
import { FilterBar, type FilterDef } from "@/components/data/filter-bar";
import { SimpleReport, type ReportRow } from "@/components/accounts/simple-report";

export const dynamic = "force-dynamic";

const OWNERSHIP_LABEL: Record<string, string> = {
  OWNER: "Own",
  RELATIVE: "Relative",
  BROKER: "Market / Broker",
};

/**
 * Vehicle expense summaries: vehicle-wise, head-wise, monthly, and vehicle
 * type-wise — all computed from the vehicle-wise allocation items.
 */
export default async function VehicleExpenseSummaryPage({
  searchParams,
}: {
  searchParams: { group?: string; date_from?: string; date_to?: string };
}) {
  const session = requireSession();
  await authorize(session, "reports", "view");
  const group = searchParams.group ?? "VEHICLE"; // VEHICLE | HEAD | MONTH | TYPE

  const rows = await withTenant(session.tenantId, async (tx) => {
    const items = await tx.vehicleExpenseItem.findMany({
      where: {
        voucher: {
          firmId: session.firmId,
          fyId: session.fyId,
          deletedAt: null,
          ...(searchParams.date_from || searchParams.date_to
            ? {
                date: {
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
    });
    const [vehicles, heads] = await Promise.all([
      tx.vehicle.findMany(),
      tx.accountHead.findMany(),
    ]);
    const vehicleById = new Map(vehicles.map((v) => [v.id, v]));
    const headName = new Map(heads.map((h) => [h.id, h.name]));

    const buckets = new Map<string, { expense: number; income: number; count: number }>();
    for (const it of items) {
      const key =
        group === "HEAD"
          ? headName.get(it.voucher.headId) ?? "(unknown head)"
          : group === "MONTH"
            ? it.voucher.date.toISOString().slice(0, 7)
            : group === "TYPE"
              ? OWNERSHIP_LABEL[vehicleById.get(it.vehicleId)?.ownershipType ?? ""] ?? "Unknown"
              : vehicleById.get(it.vehicleId)?.number ?? "(unknown vehicle)";
      const b = buckets.get(key) ?? { expense: 0, income: 0, count: 0 };
      const amt = toNum(String(it.amount));
      if (it.voucher.txnType === "INCOME") b.income += amt;
      else b.expense += amt;
      b.count += 1;
      buckets.set(key, b);
    }
    return Array.from(buckets.entries())
      .map(
        ([key, b]): ReportRow => ({
          group: key,
          entries: b.count,
          expense: Math.round(b.expense * 100) / 100,
          income: Math.round(b.income * 100) / 100,
          net: Math.round((b.expense - b.income) * 100) / 100,
        })
      )
      .sort((a, b) => String(a.group).localeCompare(String(b.group)));
  });

  const groupLabel =
    group === "HEAD" ? "Expense Head" : group === "MONTH" ? "Month" : group === "TYPE" ? "Vehicle Type" : "Vehicle";

  const filters: FilterDef[] = [
    {
      type: "select",
      key: "group",
      label: "Group By",
      options: [
        { value: "VEHICLE", label: "Vehicle-wise" },
        { value: "HEAD", label: "Head-wise" },
        { value: "MONTH", label: "Monthly" },
        { value: "TYPE", label: "Vehicle Type-wise" },
      ],
    },
    { type: "daterange", key: "date", label: "Date" },
  ];

  return (
    <div className="space-y-4 p-4">
      <h1 className="page-title">Vehicle Expense Summary</h1>
      <FilterBar filters={filters} />
      <SimpleReport
        title={`${groupLabel}-wise summary (${rows.length} group${rows.length === 1 ? "" : "s"})`}
        columns={[
          { key: "group", header: groupLabel },
          { key: "entries", header: "Entries" },
          { key: "expense", header: "Expense", kind: "money" },
          { key: "income", header: "Income", kind: "money" },
          { key: "net", header: "Net Cost", kind: "money" },
        ]}
        rows={rows}
        fileName={`vehicle-expense-summary-${group.toLowerCase()}`}
        emptyMessage="No vehicle expenses in this period."
      />
    </div>
  );
}
