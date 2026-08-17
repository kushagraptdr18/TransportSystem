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
 * ACTUAL-method trip sheets write their auto-fetched vehicle-register expenses
 * back as one MISC trip-expense row carrying this remark (trip-settlement-form).
 * The register sweep below already counts those same rupees from the
 * VehicleExpenseItem rows themselves, so the marked trip row is excluded here —
 * the register stays authoritative and nothing counts twice.
 */
const AUTO_REGISTER_EXPENSE_REMARK = "Other operating expenses (auto)";

/** "YYYY-MM" bucket for the monthly trend — local time, matching the filters. */
function monthKey(d: Date | string): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
}

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
 *
 * EMI Expenses is its own row: the FULL instalment (principal + interest +
 * penalty + charges) paid in the period counts as the financing cost of
 * operating the vehicle. This is profitability analysis only — the ledger
 * still posts principal against the loan liability, and a relative vehicle's
 * instalment still transfers to the owner's ledger as before.
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
        // the date the instalment was PAID. The loan itself is long-lived, so
        // it is keyed by firm + VEHICLE loan type only: filtering on the loan's
        // origin FY dropped every instalment of a loan taken in an earlier year
        tx.loanEmi.findMany({
          where: {
            deletedAt: null,
            ...(dateFrom || dateTo
              ? { payDate: { ...(dateFrom ? { gte: dateFrom } : {}), ...(dateTo ? { lte: dateTo } : {}) } }
              : {}),
            loan: {
              firmId: session.firmId,
              deletedAt: null,
              loanType: "VEHICLE",
            },
          },
          include: { loan: true },
        }),
      ]);
    // live trip income from the linked chalans / broker slips
    const docTotals = await tripGrandTotals(tx, trips.map((t) => t.id));
    // finance company names for the EMI drill-down
    const parties = await tx.party.findMany({ select: { id: true, name: true } });
    return {
      parties,
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
    parties,
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

  // per-vehicle monthly nets feed the trend sparkline and the monthly chart
  const bumpMonthly = (map: Map<string, Map<string, number>>, vid: string, m: string, amt: number) => {
    const inner = map.get(vid) ?? new Map<string, number>();
    inner.set(m, r2((inner.get(m) ?? 0) + amt));
    map.set(vid, inner);
  };
  const salaryMonthly = new Map<string, Map<string, number>>();
  const vehExpMonthly = new Map<string, Map<string, number>>();
  const emiMonthly = new Map<string, Map<string, number>>();

  // booked driver salary attributed to a vehicle via the assignment history
  const salaryByVehicle = new Map<string, number>();
  const salaryDetailsByVehicle = new Map<string, { month: string; driver: string; amount: number }[]>();
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
    bumpMonthly(salaryMonthly, a.vehicleId, sal.month, booked);
    const list = salaryDetailsByVehicle.get(a.vehicleId) ?? [];
    list.push({ month: sal.month, driver: driverById.get(sal.driverId)?.name ?? "", amount: booked });
    salaryDetailsByVehicle.set(a.vehicleId, list);
  }

  // vehicle expenses excluding diesel & toll
  const vehExpByVehicle = new Map<string, number>();
  const vehExpDetailsByVehicle = new Map<
    string,
    { date: string; head: string; voucherNo: string; amount: number }[]
  >();
  for (const it of expItems) {
    if (isDieselOrToll(it.voucher.headId)) continue;
    const amt = toNum(String(it.amount));
    vehExpByVehicle.set(it.vehicleId, r2((vehExpByVehicle.get(it.vehicleId) ?? 0) + amt));
    bumpMonthly(vehExpMonthly, it.vehicleId, monthKey(it.allocDate), amt);
    const list = vehExpDetailsByVehicle.get(it.vehicleId) ?? [];
    list.push({
      date: it.allocDate.toISOString(),
      head: headName.get(it.voucher.headId) ?? "",
      voucherNo: it.voucher.voucherNo,
      amount: amt,
    });
    vehExpDetailsByVehicle.set(it.vehicleId, list);
  }
  // EMI Expenses — its own P&L row. For profitability analysis the FULL
  // instalment (principal + interest + penalty + charges) is the financing
  // cost of running the vehicle in the period it was paid; the ledger keeps
  // treating principal as a liability repayment. Sourced only from the
  // Finance & Loan module — never entered here.
  const partyName = new Map(parties.map((p) => [p.id, p.name]));
  const emiByVehicle = new Map<string, number>();
  const emiDetailsByVehicle = new Map<
    string,
    {
      payDate: string;
      loanId: string;
      loanNo: string;
      financeCompany: string;
      principal: number;
      interest: number;
      penalty: number;
      total: number;
      voucherNo: string;
    }[]
  >();
  for (const emi of loanEmis) {
    const vehicleId = emi.loan.vehicleId;
    if (!vehicleId) continue;
    const principal = toNum(String(emi.principal));
    const interest = toNum(String(emi.interest));
    const penalty = r2(toNum(String(emi.penalty)) + toNum(String(emi.otherAmt)));
    const total = r2(principal + interest + penalty);
    if (total <= 0) continue;
    emiByVehicle.set(vehicleId, r2((emiByVehicle.get(vehicleId) ?? 0) + total));
    bumpMonthly(emiMonthly, vehicleId, monthKey(emi.payDate), total);
    const list = emiDetailsByVehicle.get(vehicleId) ?? [];
    list.push({
      payDate: emi.payDate.toISOString(),
      loanId: emi.loanId,
      loanNo: emi.loan.loanNo,
      financeCompany: partyName.get(emi.loan.partyId) ?? "",
      principal,
      interest,
      penalty,
      total,
      voucherNo: emi.voucherNo ?? "",
    });
    emiDetailsByVehicle.set(vehicleId, list);
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
        // the marked row duplicates the register sweep — see the constant above
        const ownExpenses = t.expenses.filter(
          (e) => e.remarks !== AUTO_REGISTER_EXPENSE_REMARK
        );
        const approved = r2(ownExpenses.reduce((s, e) => s + toNum(String(e.amount)), 0));
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
        for (const e of ownExpenses) {
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
      const emi = emiByVehicle.get(v.id) ?? 0;
      const net = r2(freight - tripExpenses - vehicleExpenses - driverSalary - emi);

      // month-wise net — trips land in their trip month, register expenses /
      // salary / EMI in their own months; feeds the sparkline + monthly chart
      const monthly = new Map<string, number>();
      const bump = (m: string, amt: number) => monthly.set(m, r2((monthly.get(m) ?? 0) + amt));
      for (const t of pnlTrips) bump(monthKey(t.tripDate), r2(t.freight - t.approved));
      vehExpMonthly.get(v.id)?.forEach((amt, m) => bump(m, -amt));
      salaryMonthly.get(v.id)?.forEach((amt, m) => bump(m, -amt));
      emiMonthly.get(v.id)?.forEach((amt, m) => bump(m, -amt));
      const monthlyNet = Array.from(monthly.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, m]) => ({ month, net: m }));

      return {
        id: v.id,
        vehicle: v.number,
        ownership: v.ownershipType === "OWNER" ? "Own" : "Relative",
        tripCount: pnlTrips.length,
        freight,
        tripExpenses,
        vehicleExpenses,
        driverSalary,
        emi,
        emis: emiDetailsByVehicle.get(v.id) ?? [],
        net,
        margin: freight > 0 ? r2((net / freight) * 100) : 0,
        monthlyNet,
        vehExpDetails: (vehExpDetailsByVehicle.get(v.id) ?? []).sort((a, b) =>
          a.date.localeCompare(b.date)
        ),
        salaryDetails: (salaryDetailsByVehicle.get(v.id) ?? []).sort((a, b) =>
          a.month.localeCompare(b.month)
        ),
        trips: pnlTrips,
      };
    })
    .filter((r) => r.tripCount > 0 || r.vehicleExpenses > 0 || r.driverSalary > 0 || r.emi > 0);

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
