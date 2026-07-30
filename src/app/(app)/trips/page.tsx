import { requireSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { peekDocNumber } from "@/lib/sequences";
import { toNum } from "@/lib/utils";
import {
  TripSettlementForm,
  type TripSettlementInitial,
} from "@/components/trips/trip-settlement-form";

export const dynamic = "force-dynamic";

export default async function TripEntryPage({
  searchParams,
}: {
  searchParams: { id?: string };
}) {
  const session = requireSession();

  const { vehicles, drivers, driverByVehicle, banks, nextNo, trip, docs } = await withTenant(
    session.tenantId,
    async (tx) => {
      const [vehicleRows, driverRows, openAssignments, banks, nextNo] = await Promise.all([
        tx.vehicle.findMany({ where: { isActive: true }, orderBy: { number: "asc" } }),
        tx.driver.findMany({
          where: { firmId: session.firmId, deletedAt: null, status: "ACTIVE" },
          orderBy: { name: "asc" },
        }),
        tx.driverAssignment.findMany({ where: { toDate: null } }),
        tx.party.findMany({
          where: { isActive: true, ledgerGroup: { in: ["BANK", "CASH"] } },
          orderBy: { name: "asc" },
        }),
        peekDocNumber(tx, { firmId: session.firmId, fyId: session.fyId, docType: "TRIP" }),
      ]);
      const trip = searchParams.id
        ? await tx.trip.findFirst({ where: { id: searchParams.id, deletedAt: null } })
        : null;
      const docs = trip
        ? await tx.tripDoc.findMany({ where: { tripId: trip.id } })
        : [];
      const driverIds = new Set(driverRows.map((d) => d.id));
      return {
        // trip sheets: Own / Relative vehicles only (market = chalan workflow)
        vehicles: vehicleRows
          .filter((v) => v.ownershipType !== "BROKER")
          .map((v) => ({
            value: v.id,
            label: `${v.number}${v.ownershipType === "RELATIVE" ? " (Relative)" : ""}`,
          })),
        drivers: driverRows.map((d) => ({ value: d.id, label: `${d.name} (${d.driverCode})` })),
        driverByVehicle: Object.fromEntries(
          openAssignments
            .filter((a) => driverIds.has(a.driverId))
            .map((a) => [a.vehicleId, a.driverId])
        ) as Record<string, string>,
        banks: banks.map((b) => ({ value: b.id, label: b.name, meta: b.ledgerGroup })),
        nextNo,
        trip,
        docs,
      };
    }
  );

  const initial: TripSettlementInitial | null = trip
    ? {
        id: trip.id,
        tripNo: trip.tripNo,
        fromDate: (trip.fromDate ?? trip.tripDate).toISOString(),
        toDate: (trip.toDate ?? trip.returnDate ?? trip.tripDate).toISOString(),
        vehicleId: trip.vehicleId,
        driverId: trip.driverId,
        calcMethod: trip.calcMethod,
        docs: docs.map((d) => ({
          refType: d.refType as "CHALAN" | "BROKER_SLIP",
          refId: d.refId,
        })),
        tollExpenseType: trip.tollExpenseType,
        ureaRate: toNum(String(trip.ureaRate)),
        ureaExpenseType: trip.ureaExpenseType,
        loadingKm: toNum(String(trip.loadingKm)),
        unloadingKm: toNum(String(trip.unloadingKm)),
        newLoadingKm: toNum(String(trip.newLoadingKm)),
        dieselAvg: toNum(String(trip.dieselAvg)),
        dieselAvg2: toNum(String(trip.dieselAvg2)),
        dieselRate: toNum(String(trip.dieselRate)),
        apprDriverAdvance: toNum(String(trip.apprDriverAdvance)),
        roadBillExp: toNum(String(trip.roadBillExp)),
        foodingDays: toNum(String(trip.foodingDays)),
        foodingRate: toNum(String(trip.foodingRate)),
        rtoExp: toNum(String(trip.rtoExp)),
        fixedTripExp: toNum(String(trip.fixedTripExp)),
      }
    : null;

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-semibold">
        {initial ? `Edit Trip Sheet ${initial.tripNo}` : "Trip Sheet Entry (Trip Settlement)"}
      </h1>
      <p className="text-sm text-muted-foreground">
        Every trip settles separately — Raigarh → Chennai and Chennai → Raigarh are two
        independent trip sheets, even for the same vehicle.
      </p>
      <TripSettlementForm
        vehicles={vehicles}
        drivers={drivers}
        driverByVehicle={driverByVehicle}
        bankOptions={banks}
        nextTripNo={nextNo ?? "1"}
        initial={initial}
      />
    </div>
  );
}
