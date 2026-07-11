import { requireSession } from "@/lib/session";
import { authorize } from "@/lib/authz";
import { withTenant } from "@/lib/db";
import { toNum } from "@/lib/utils";
import { FilterBar, type FilterDef } from "@/components/data/filter-bar";
import { SimpleReport } from "@/components/accounts/simple-report";

export const dynamic = "force-dynamic";

/** Per-vehicle earnings vs running cost across all modules. */
export default async function VehicleReportPage({
  searchParams,
}: {
  searchParams: { date_from?: string; date_to?: string };
}) {
  const session = requireSession();
  await authorize(session, "reports", "view");

  const dateRange = (field: string) =>
    searchParams.date_from || searchParams.date_to
      ? {
          [field]: {
            ...(searchParams.date_from ? { gte: new Date(searchParams.date_from + "T00:00:00") } : {}),
            ...(searchParams.date_to ? { lte: new Date(searchParams.date_to + "T23:59:59") } : {}),
          },
        }
      : {};

  const data = await withTenant(session.tenantId, async (tx) => {
    const scope = { firmId: session.firmId, fyId: session.fyId };
    const [vehicles, trips, chalans, expenses, jobs] = await Promise.all([
      tx.vehicle.findMany({ orderBy: { number: "asc" } }),
      tx.trip.groupBy({
        by: ["vehicleId"],
        where: { ...scope, deletedAt: null, ...dateRange("tripDate") },
        _count: true,
        _sum: { gTotalFreight: true, rTotalFreight: true },
      }),
      tx.chalan.groupBy({
        by: ["vehicleId"],
        where: { ...scope, deletedAt: null, ...dateRange("chalanDate") },
        _count: true,
        _sum: { grandTotal: true },
      }),
      tx.vehicleExpense.groupBy({
        by: ["vehicleId"],
        where: { ...scope, ...dateRange("date") },
        _sum: { amount: true },
      }),
      tx.jobEntry.groupBy({
        by: ["vehicleId"],
        where: { ...scope, deletedAt: null, ...dateRange("invoiceDate") },
        _sum: { grandTotal: true },
      }),
    ]);
    return { vehicles, trips, chalans, expenses, jobs };
  });

  const n = (v: unknown) => toNum(String(v ?? 0));
  const tripByV = new Map(data.trips.map((t) => [t.vehicleId, t]));
  const chalanByV = new Map(data.chalans.map((c) => [c.vehicleId, c]));
  const expByV = new Map(data.expenses.map((e) => [e.vehicleId, e]));
  const jobByV = new Map(data.jobs.filter((j) => j.vehicleId).map((j) => [j.vehicleId as string, j]));

  const rows = data.vehicles
    .map((v) => {
      const t = tripByV.get(v.id);
      const c = chalanByV.get(v.id);
      const e = expByV.get(v.id);
      const j = jobByV.get(v.id);
      const tripFreight = n(t?._sum.gTotalFreight) + n(t?._sum.rTotalFreight);
      const chalanFreight = n(c?._sum.grandTotal);
      const expense = n(e?._sum.amount) + n(j?._sum.grandTotal);
      return {
        vehicle: v.number,
        own: v.isOwn ? "OWN" : "MARKET",
        trips: t?._count ?? 0,
        chalans: c?._count ?? 0,
        tripFreight,
        chalanFreight,
        expense,
        net: Math.round((tripFreight - expense) * 100) / 100,
      };
    })
    .filter((r) => r.trips || r.chalans || r.tripFreight || r.expense);

  const filters: FilterDef[] = [{ type: "daterange", key: "date", label: "Period" }];

  return (
    <div className="space-y-4 p-4">
      <h1 className="page-title">Vehicle Report</h1>
      <FilterBar filters={filters} />
      <SimpleReport
        title="Earnings and running cost per vehicle"
        columns={[
          { key: "vehicle", header: "Vehicle" },
          { key: "own", header: "Ownership", kind: "badge" },
          { key: "trips", header: "Trips" },
          { key: "chalans", header: "Chalans" },
          { key: "tripFreight", header: "Trip Freight", kind: "money" },
          { key: "chalanFreight", header: "Chalan Freight", kind: "money" },
          { key: "expense", header: "Expenses + Jobs", kind: "money" },
          { key: "net", header: "Net (Trips − Exp)", kind: "money" },
        ]}
        rows={rows}
        fileName="vehicle-report"
        emptyMessage="No vehicle activity in this period."
      />
    </div>
  );
}
