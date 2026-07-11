import { requireSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { peekDocNumber } from "@/lib/sequences";
import { TripForm, type TripFormValues, type VehicleOpt } from "@/components/trips/trip-form";

export const dynamic = "force-dynamic";

export default async function TripEntryPage({
  searchParams,
}: {
  searchParams: { id?: string };
}) {
  const session = requireSession();

  const { vehicles, parties, transporters, cities, nextNo, trip } = await withTenant(
    session.tenantId,
    async (tx) => {
      const [vehicleRows, partyRows, transporterRows, cityRows, nextNo] = await Promise.all([
        tx.vehicle.findMany({ where: { isActive: true }, orderBy: { number: "asc" } }),
        tx.party.findMany({
          where: { isActive: true, ledgerGroup: "CONSIGNEE_CONSIGNOR" },
          orderBy: { name: "asc" },
        }),
        tx.party.findMany({
          where: { isActive: true, ledgerGroup: "OWNER_BROKER" },
          orderBy: { name: "asc" },
        }),
        tx.city.findMany({ include: { state: true }, orderBy: { name: "asc" } }),
        peekDocNumber(tx, { firmId: session.firmId, fyId: session.fyId, docType: "TRIP" }),
      ]);
      const trip = searchParams.id
        ? await tx.trip.findFirst({
            where: { id: searchParams.id, deletedAt: null },
            include: { expenses: true },
          })
        : null;
      return {
        vehicles: vehicleRows.map((v): VehicleOpt => ({
          value: v.id,
          label: v.number,
          vehicleType: v.vehicleType,
        })),
        parties: partyRows.map((p) => ({ value: p.id, label: p.name })),
        transporters: transporterRows.map((p) => ({ value: p.id, label: p.name })),
        cities: cityRows.map((c) => ({ value: c.id, label: c.name, meta: c.state.name })),
        nextNo,
        trip,
      };
    }
  );

  const initial: TripFormValues | null = trip
    ? {
        id: trip.id,
        tripNo: trip.tripNo,
        tripDate: trip.tripDate.toISOString(),
        returnDate: trip.returnDate?.toISOString() ?? null,
        vehicleId: trip.vehicleId,
        vehicleType: trip.vehicleType ?? "",
        goingPartyId: trip.goingPartyId,
        goingSourceCityId: trip.goingSourceCityId,
        goingDestCityId: trip.goingDestCityId,
        gFreight: Number(trip.gFreight),
        gHamali: Number(trip.gHamali),
        gOthers: Number(trip.gOthers),
        gDiesel: Number(trip.gDiesel),
        gDriverAdvance: Number(trip.gDriverAdvance),
        gPartyAdvance: Number(trip.gPartyAdvance),
        gOther: Number(trip.gOther),
        gBankName: trip.gBankName ?? "",
        gRemarks: trip.gRemarks ?? "",
        returnPartyId: trip.returnPartyId,
        returnSourceCityId: trip.returnSourceCityId,
        returnDestCityId: trip.returnDestCityId,
        rFreight: Number(trip.rFreight),
        rHamali: Number(trip.rHamali),
        rOthers: Number(trip.rOthers),
        rDiesel: Number(trip.rDiesel),
        rDriverAdvance: Number(trip.rDriverAdvance),
        rPartyAdvance: Number(trip.rPartyAdvance),
        rDetention: Number(trip.rDetention),
        rBankName: trip.rBankName ?? "",
        rRemarks: trip.rRemarks ?? "",
        expenses: trip.expenses.map((e) => ({
          category: e.category,
          amount: Number(e.amount),
          remarks: e.remarks ?? "",
          date: e.date?.toISOString() ?? null,
        })),
      }
    : null;

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-semibold">
        {initial ? `Edit Trip ${initial.tripNo}` : "Trip Sheet Entry"}
      </h1>
      <TripForm
        vehicles={vehicles}
        parties={parties}
        transporters={transporters}
        cities={cities}
        nextTripNo={nextNo ?? "1"}
        initial={initial}
      />
    </div>
  );
}
