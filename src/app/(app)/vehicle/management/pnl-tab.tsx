import type { Prisma } from "@prisma/client";
import { requireSession } from "@/lib/session";
import { authorize } from "@/lib/authz";
import { withTenant } from "@/lib/db";
import { toNum } from "@/lib/utils";
import { tripGrandTotals } from "@/lib/trip-docs";
import {
  VehiclePnlClient,
  type VehiclePnlRow,
  type PnlTrip,
} from "@/components/vehicle/vehicle-pnl-client";

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Vehicle Profit & Loss — Own / Relative vehicles only.
 *   P&L = Trip Freight − Trip Expenses (company approved grand total)
 *         − Vehicle Expenses (excluding Diesel & Toll — already in trips)
 *         − Booked Driver Salary (payment status is irrelevant).
 *
 * Trip Freight is the GRAND TOTAL of the chalans / broker slips linked to the
 * trip, not their bare freight: detention, ODC and fine slip are earned on the
 * trip and commission, mamul and courier are suffered on it, so freight alone
 * overstates what the vehicle made. It is read live through the TripDoc links
 * so editing a chalan updates this report with nothing to re-save.
 */
export async function VehiclePnlTab({
  searchParams,
}: {
  searchParams: {
    date_from?: string;
    date_to?: string;
    vehicle?: string;
    ownership?: string;
    driver?: string;
  };
}) {
  const session = requireSession();
  await authorize(session, "reports", "view");

  const dateFrom = searchParams.date_from ? new Date(searchParams.date_from + "T00:00:00") : null;
  const dateTo = searchParams.date_to ? new Date(searchParams.date_to + "T23:59:59") : null;

  const data = await withTenant(session.tenantId, async (tx) => {
    const tripWhere: Prisma.TripWhereInput = {
      firmId: session.firmId,
      fyId: session.fyId,
      deletedAt: null,
    };
    if (searchParams.vehicle) tripWhere.vehicleId = searchParams.vehicle;
    if (searchParams.driver) tripWhere.driverId = searchParams.driver;
    if (dateFrom || dateTo) {
      tripWhere.tripDate = { ...(dateFrom ? { gte: dateFrom } : {}), ...(dateTo ? { lte: dateTo } : {}) };
    }

    const [
      vehicles,
      trips,
      drivers,
      cities,
      heads,
      expItems,
      salaries,
      assignments,
      settlements,
      advances,
      loanEmis,
    ] = await Promise.all([
        tx.vehicle.findMany({
          where: { ownershipType: { in: ["OWNER", "RELATIVE"] } },
          orderBy: { number: "asc" },
        }),
        tx.trip.findMany({ where: tripWhere, include: { expenses: true }, orderBy: { tripDate: "asc" } }),
        tx.driver.findMany({ where: { firmId: session.firmId, deletedAt: null } }),
        tx.city.findMany(),
        tx.accountHead.findMany(),
        tx.vehicleExpenseItem.findMany({
          where: {
            // the ALLOCATION date decides the period, not the purchase date: a
            // chain bought on the 1st and fitted on the 8th is the 8th's cost
            ...(dateFrom || dateTo
              ? {
                  allocDate: {
                    ...(dateFrom ? { gte: dateFrom } : {}),
                    ...(dateTo ? { lte: dateTo } : {}),
                  },
                }
              : {}),
            voucher: {
              firmId: session.firmId,
              fyId: session.fyId,
              txnType: "EXPENSE",
              deletedAt: null,
            },
          },
          include: { voucher: true },
        }),
        tx.driverSalary.findMany({
          where: { firmId: session.firmId, fyId: session.fyId, deletedAt: null },
        }),
        tx.driverAssignment.findMany(),
        tx.driverSettlement.findMany({
          where: { firmId: session.firmId, deletedAt: null },
          orderBy: [{ date: "asc" }, { createdAt: "asc" }],
        }),
        tx.driverAdvance.findMany({
          where: { firmId: session.firmId, deletedAt: null, tripId: { not: null } },
        }),
        // vehicle loan instalments — a financed vehicle carries its EMI cost on
        // the date the instalment was paid
        tx.loanEmi.findMany({
          where: {
            deletedAt: null,
            ...(dateFrom || dateTo
              ? { payDate: { ...(dateFrom ? { gte: dateFrom } : {}), ...(dateTo ? { lte: dateTo } : {}) } }
              : {}),
            loan: {
              firmId: session.firmId,
              fyId: session.fyId,
              deletedAt: null,
              vehicleId: { not: null },
            },
          },
          include: { loan: true },
        }),
      ]);
    // live trip income from the linked chalans / broker slips
    const docTotals = await tripGrandTotals(tx, trips.map((t) => t.id));
    return {
      vehicles,
      trips,
      drivers,
      cities,
      heads,
      expItems,
      salaries,
      assignments,
      settlements,
      advances,
      loanEmis,
      docTotals,
    };
  });

  const {
    vehicles,
    trips,
    drivers,
    cities,
    heads,
    expItems,
    salaries,
    assignments,
    settlements,
    advances,
    loanEmis,
    docTotals,
  } = data;

  const cityName = new Map(cities.map((c) => [c.id, c.name]));
  const driverById = new Map(drivers.map((d) => [d.id, d]));
  const headName = new Map(heads.map((h) => [h.id, h.name]));
  const isDieselOrToll = (headId: string) => {
    const n = (headName.get(headId) ?? "").toLowerCase();
    return n.includes("diesel") || n.includes("toll");
  };

  // driver settlement running balances (previous / final per trip settlement)
  const runningByDriver = new Map<string, number>();
  const settlementByTrip = new Map<
    string,
    { prev: number; current: number; final: number; status: string }
  >();
  for (const s of settlements) {
    const amt = toNum(String(s.amount));
    const prev = runningByDriver.get(s.driverId) ?? 0;
    const final = prev + (s.status === "PENDING" ? amt : 0);
    runningByDriver.set(s.driverId, final);
    if (s.tripId) settlementByTrip.set(s.tripId, { prev, current: amt, final, status: s.status });
  }

  // booked driver salary attributed to a vehicle via the assignment history
  const salaryByVehicle = new Map<string, number>();
  for (const sal of salaries) {
    if (searchParams.driver && sal.driverId !== searchParams.driver) continue;
    const monthStart = new Date(`${sal.month}-01T00:00:00`);
    const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0, 23, 59, 59);
    if (dateFrom && monthEnd < dateFrom) continue;
    if (dateTo && monthStart > dateTo) continue;
    const a = assignments.find(
      (x) =>
        x.driverId === sal.driverId &&
        x.fromDate <= monthEnd &&
        (!x.toDate || x.toDate >= monthStart)
    );
    if (!a) continue;
    const booked = r2(
      toNum(String(sal.salaryAmount)) +
        toNum(String(sal.incentive)) +
        toNum(String(sal.bonus)) +
        toNum(String(sal.otherAllowance))
    );
    salaryByVehicle.set(a.vehicleId, r2((salaryByVehicle.get(a.vehicleId) ?? 0) + booked));
  }

  // vehicle expenses excluding diesel & toll
  const vehExpByVehicle = new Map<string, number>();
  for (const it of expItems) {
    if (isDieselOrToll(it.voucher.headId)) continue;
    vehExpByVehicle.set(
      it.vehicleId,
      r2((vehExpByVehicle.get(it.vehicleId) ?? 0) + toNum(String(it.amount)))
    );
  }
  // A vehicle loan's cost to the fleet is the interest and charges on each
  // instalment, not the whole EMI: repaying principal settles a liability, it
  // does not consume anything. Counting the principal would show a vehicle
  // losing money simply for paying off its own finance.
  for (const emi of loanEmis) {
    const vehicleId = emi.loan.vehicleId;
    if (!vehicleId) continue;
    const cost = r2(
      toNum(String(emi.interest)) + toNum(String(emi.penalty)) + toNum(String(emi.otherAmt))
    );
    if (cost <= 0) continue;
    vehExpByVehicle.set(vehicleId, r2((vehExpByVehicle.get(vehicleId) ?? 0) + cost));
  }

  const rows: VehiclePnlRow[] = vehicles
    .filter((v) => !searchParams.vehicle || v.id === searchParams.vehicle)
    .filter((v) => !searchParams.ownership || v.ownershipType === searchParams.ownership)
    .map((v) => {
      const vTrips = trips.filter((t) => t.vehicleId === v.id);
      const pnlTrips: PnlTrip[] = vTrips.map((t) => {
        // linked documents win; the stored snapshot is the fallback for legacy
        // sheets saved before the links existed
        const linked = docTotals.get(t.id);
        const freight =
          linked !== undefined
            ? linked
            : r2(toNum(String(t.gTotalFreight)) + toNum(String(t.rTotalFreight)));
        const approved = r2(t.expenses.reduce((s, e) => s + toNum(String(e.amount)), 0));
        const settlement = settlementByTrip.get(t.id) ?? null;
        const driver = t.driverId ? driverById.get(t.driverId) : null;
        const tripEnd = t.returnDate ?? t.tripDate;
        const tripVehExp = expItems
          .filter(
            (it) =>
              it.vehicleId === v.id &&
              !isDieselOrToll(it.voucher.headId) &&
              it.voucher.date >= t.tripDate &&
              it.voucher.date <= tripEnd
          )
          .map((it) => ({
            date: it.voucher.date.toISOString(),
            head: headName.get(it.voucher.headId) ?? "",
            voucherNo: it.voucher.voucherNo,
            amount: toNum(String(it.amount)),
          }));
        const tripAdvances = advances
          .filter((a) => a.tripId === t.id)
          .reduce((s, a) => s + toNum(String(a.amount)), 0);
        const byCat = new Map<string, number>();
        for (const e of t.expenses) {
          byCat.set(e.category, r2((byCat.get(e.category) ?? 0) + toNum(String(e.amount))));
        }
        return {
          id: t.id,
          tripNo: t.tripNo,
          tripDate: t.tripDate.toISOString(),
          driver: driver?.name ?? "",
          from: (t.goingSourceCityId && cityName.get(t.goingSourceCityId)) || "",
          to: (t.goingDestCityId && cityName.get(t.goingDestCityId)) || "",
          freight,
          approved,
          driverBalance: toNum(String(t.driverBalance)),
          profit: r2(freight - approved),
          approvedByCategory: Array.from(byCat.entries()).map(([category, amount]) => ({
            category,
            amount,
          })),
          legDiesel: r2(toNum(String(t.gDiesel)) + toNum(String(t.rDiesel))),
          legDriverAdvance: r2(toNum(String(t.gDriverAdvance)) + toNum(String(t.rDriverAdvance))),
          actualDriverAdvance: r2(tripAdvances),
          ureaQty: toNum(String(t.ureaQty)),
          ureaAmount: toNum(String(t.ureaAmount)),
          ureaExpenseType: t.ureaExpenseType,
          settlement,
          vehicleExpenses: tripVehExp,
        };
      });

      const freight = r2(pnlTrips.reduce((s, t) => s + t.freight, 0));
      const tripExpenses = r2(pnlTrips.reduce((s, t) => s + t.approved, 0));
      const vehicleExpenses = vehExpByVehicle.get(v.id) ?? 0;
      const driverSalary = salaryByVehicle.get(v.id) ?? 0;
      return {
        id: v.id,
        vehicle: v.number,
        ownership: v.ownershipType === "OWNER" ? "Own" : "Relative",
        tripCount: pnlTrips.length,
        freight,
        tripExpenses,
        vehicleExpenses,
        driverSalary,
        net: r2(freight - tripExpenses - vehicleExpenses - driverSalary),
        trips: pnlTrips,
      };
    })
    .filter((r) => r.tripCount > 0 || r.vehicleExpenses > 0 || r.driverSalary > 0);

  return (
    <div className="space-y-4">
      <VehiclePnlClient
        rows={rows}
        vehicleOptions={vehicles.map((v) => ({ value: v.id, label: v.number }))}
        driverOptions={drivers.map((d) => ({ value: d.id, label: d.name }))}
      />
    </div>
  );
}
