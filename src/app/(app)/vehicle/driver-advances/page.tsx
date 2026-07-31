import type { Prisma } from "@prisma/client";
import { requireSession } from "@/lib/session";
import { authorize } from "@/lib/authz";
import { withTenant } from "@/lib/db";
import { toNum } from "@/lib/utils";
import {
  DriverAdvanceClient,
  type DriverAdvanceRow,
} from "@/components/vehicle/driver-advance-client";

export const dynamic = "force-dynamic";

export default async function DriverAdvancesPage({
  searchParams,
}: {
  searchParams: {
    driver?: string;
    vehicle?: string;
    status?: string;
    date_from?: string;
    date_to?: string;
  };
}) {
  const session = requireSession();
  await authorize(session, "maintenance", "view");

  const { advances, drivers, vehicles, banks } = await withTenant(session.tenantId, async (tx) => {
    const where: Prisma.DriverAdvanceWhereInput = {
      firmId: session.firmId,
      fyId: session.fyId,
      deletedAt: null,
    };
    if (searchParams.driver) where.driverId = searchParams.driver;
    if (searchParams.vehicle) where.vehicleId = searchParams.vehicle;
    if (searchParams.status === "PENDING" || searchParams.status === "ADJUSTED") {
      where.status = searchParams.status;
    }
    if (searchParams.date_from || searchParams.date_to) {
      where.date = {
        ...(searchParams.date_from ? { gte: new Date(searchParams.date_from + "T00:00:00") } : {}),
        ...(searchParams.date_to ? { lte: new Date(searchParams.date_to + "T23:59:59") } : {}),
      };
    }
    const [advances, drivers, vehicles, banks] = await Promise.all([
      tx.driverAdvance.findMany({ where, orderBy: [{ date: "desc" }, { createdAt: "desc" }] }),
      tx.driver.findMany({ where: { firmId: session.firmId, deletedAt: null }, orderBy: { name: "asc" } }),
      tx.vehicle.findMany({ where: { isActive: true }, orderBy: { number: "asc" } }),
      tx.party.findMany({
        where: { isActive: true, ledgerGroup: { in: ["BANK", "CASH"] } },
        orderBy: { name: "asc" },
      }),
    ]);
    return { advances, drivers, vehicles, banks };
  });

  const driverName = new Map(drivers.map((d) => [d.id, d.name]));
  const vehicleNo = new Map(vehicles.map((v) => [v.id, v.number]));
  const bankName = new Map(banks.map((b) => [b.id, b.name]));

  const rows: DriverAdvanceRow[] = advances.map((a) => ({
    id: a.id,
    date: a.date.toISOString(),
    driverId: a.driverId,
    driver: driverName.get(a.driverId) ?? "",
    vehicleId: a.vehicleId,
    vehicle: a.vehicleId ? vehicleNo.get(a.vehicleId) ?? "" : "",
    tripRef: a.tripRef ?? "",
    amount: toNum(String(a.amount)),
    paymentMode: a.paymentMode,
    bankPartyId: a.bankPartyId,
    bank: a.bankPartyId ? bankName.get(a.bankPartyId) ?? "" : "",
    voucherRef: a.voucherRef ?? "",
    remarks: a.remarks ?? "",
    status: a.status,
    adjustedDate: a.adjustedDate ? a.adjustedDate.toISOString() : null,
  }));

  return (
    <div className="space-y-4 p-4">
      <DriverAdvanceClient
        rows={rows}
        driverOptions={drivers
          .filter((d) => d.status === "ACTIVE")
          .map((d) => ({ value: d.id, label: `${d.name} (${d.driverCode})` }))}
        allDriverOptions={drivers.map((d) => ({ value: d.id, label: d.name }))}
        vehicleOptions={vehicles.map((v) => ({ value: v.id, label: v.number }))}
        bankOptions={banks.map((b) => ({ value: b.id, label: b.name, meta: b.ledgerGroup }))}
        canDelete={session.role === "ADMIN" || session.role === "OWNER"}
      />
    </div>
  );
}
