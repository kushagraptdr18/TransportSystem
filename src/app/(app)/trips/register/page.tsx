import type { Prisma } from "@prisma/client";
import { requireSession } from "@/lib/session";
import { authorize } from "@/lib/authz";
import { withTenant } from "@/lib/db";
import { toNum } from "@/lib/utils";
import {
  TripRegisterClient,
  type TripRegisterRow,
} from "@/components/trips/trip-register-client";

export const dynamic = "force-dynamic";

export default async function TripRegisterPage({
  searchParams,
}: {
  searchParams: {
    q?: string;
    vehicle?: string;
    driver?: string;
    date_from?: string;
    date_to?: string;
  };
}) {
  const session = requireSession();
  await authorize(session, "trips", "view");

  const { trips, vehicles, drivers, cities, settlements } = await withTenant(
    session.tenantId,
    async (tx) => {
      const where: Prisma.TripWhereInput = {
        firmId: session.firmId,
        fyId: session.fyId,
        deletedAt: null,
      };
      if (searchParams.q) where.tripNo = { contains: searchParams.q, mode: "insensitive" };
      if (searchParams.vehicle) where.vehicleId = searchParams.vehicle;
      if (searchParams.driver) where.driverId = searchParams.driver;
      if (searchParams.date_from || searchParams.date_to) {
        where.tripDate = {
          ...(searchParams.date_from
            ? { gte: new Date(searchParams.date_from + "T00:00:00") }
            : {}),
          ...(searchParams.date_to ? { lte: new Date(searchParams.date_to + "T23:59:59") } : {}),
        };
      }
      const [trips, vehicles, drivers, cities, settlements] = await Promise.all([
        tx.trip.findMany({ where, orderBy: [{ tripDate: "desc" }, { createdAt: "desc" }] }),
        tx.vehicle.findMany({ orderBy: { number: "asc" } }),
        tx.driver.findMany({ where: { firmId: session.firmId, deletedAt: null } }),
        tx.city.findMany(),
        tx.driverSettlement.findMany({
          where: { firmId: session.firmId, deletedAt: null, tripId: { not: null } },
        }),
      ]);
      return { trips, vehicles, drivers, cities, settlements };
    }
  );

  const vehicleNo = new Map(vehicles.map((v) => [v.id, v.number]));
  const driverName = new Map(drivers.map((d) => [d.id, d.name]));
  const cityName = new Map(cities.map((c) => [c.id, c.name]));
  const settlementByTrip = new Map(settlements.map((s) => [s.tripId as string, s]));

  const rows: TripRegisterRow[] = trips.map((t) => {
    const s = settlementByTrip.get(t.id);
    return {
      id: t.id,
      tripNo: t.tripNo,
      date: t.tripDate.toISOString(),
      vehicle: vehicleNo.get(t.vehicleId) ?? "",
      driver: t.driverId ? driverName.get(t.driverId) ?? "" : "",
      from: (t.goingSourceCityId && cityName.get(t.goingSourceCityId)) || "",
      to: (t.goingDestCityId && cityName.get(t.goingDestCityId)) || "",
      freight: toNum(String(t.gTotalFreight)) + toNum(String(t.rTotalFreight)),
      approved: toNum(String(t.approvedTotal)),
      driverBalance: toNum(String(t.driverBalance)),
      vehicleCost: toNum(String(t.grandTotal)),
      status: s ? (s.status === "SETTLED" ? "SETTLED" : "PENDING") : "NO BALANCE",
    };
  });

  return (
    <div className="space-y-4 p-4">
      <TripRegisterClient
        rows={rows}
        vehicleOptions={vehicles.map((v) => ({ value: v.id, label: v.number }))}
        driverOptions={drivers.map((d) => ({ value: d.id, label: d.name }))}
        canDelete={session.role === "ADMIN" || session.role === "OWNER"}
      />
    </div>
  );
}
