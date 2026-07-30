import type { Prisma } from "@prisma/client";
import { requireSession } from "@/lib/session";
import { authorize } from "@/lib/authz";
import { withTenant } from "@/lib/db";
import { toNum } from "@/lib/utils";
import {
  DriverSettlementClient,
  type DriverSettlementRow,
} from "@/components/vehicle/driver-settlement-client";

export const dynamic = "force-dynamic";

export default async function DriverSettlementsPage({
  searchParams,
}: {
  searchParams: {
    driver?: string;
    status?: string;
    date_from?: string;
    date_to?: string;
  };
}) {
  const session = requireSession();
  await authorize(session, "maintenance", "view");

  const { settlements, drivers, vehicles, banks } = await withTenant(
    session.tenantId,
    async (tx) => {
      const where: Prisma.DriverSettlementWhereInput = {
        firmId: session.firmId,
        fyId: session.fyId,
        deletedAt: null,
      };
      if (searchParams.driver) where.driverId = searchParams.driver;
      if (searchParams.status === "PENDING" || searchParams.status === "SETTLED") {
        where.status = searchParams.status;
      }
      if (searchParams.date_from || searchParams.date_to) {
        where.date = {
          ...(searchParams.date_from
            ? { gte: new Date(searchParams.date_from + "T00:00:00") }
            : {}),
          ...(searchParams.date_to ? { lte: new Date(searchParams.date_to + "T23:59:59") } : {}),
        };
      }
      const [settlements, drivers, vehicles, banks] = await Promise.all([
        tx.driverSettlement.findMany({
          where,
          orderBy: [{ date: "asc" }, { createdAt: "asc" }],
        }),
        tx.driver.findMany({
          where: { firmId: session.firmId, deletedAt: null },
          orderBy: { name: "asc" },
        }),
        tx.vehicle.findMany({ where: { isActive: true }, orderBy: { number: "asc" } }),
        tx.party.findMany({
          where: { isActive: true, ledgerGroup: { in: ["BANK", "CASH"] } },
          orderBy: { name: "asc" },
        }),
      ]);
      return { settlements, drivers, vehicles, banks };
    }
  );

  const driverName = new Map(drivers.map((d) => [d.id, d.name]));
  const vehicleNo = new Map(vehicles.map((v) => [v.id, v.number]));

  // previous / running balance per driver in chronological order — settled
  // amounts drop out (they never carry to the next trip)
  const runningByDriver = new Map<string, number>();
  const rows: DriverSettlementRow[] = settlements.map((s) => {
    const amount = toNum(String(s.amount));
    const prev = runningByDriver.get(s.driverId) ?? 0;
    const running = prev + (s.status === "PENDING" ? amount : 0);
    runningByDriver.set(s.driverId, running);
    return {
      id: s.id,
      date: s.date.toISOString(),
      driverId: s.driverId,
      driver: driverName.get(s.driverId) ?? "",
      vehicle: s.vehicleId ? vehicleNo.get(s.vehicleId) ?? "" : "",
      tripRef: s.tripRef ?? "",
      previousBalance: prev,
      amount,
      runningBalance: running,
      status: s.status,
      settledDate: s.settledDate ? s.settledDate.toISOString() : null,
      voucherNo: s.voucherNo ?? "",
      remarks: s.remarks ?? "",
    };
  });
  rows.reverse(); // newest first for display

  return (
    <div className="space-y-4 p-4">
      <DriverSettlementClient
        rows={rows}
        driverOptions={drivers.map((d) => ({ value: d.id, label: `${d.name} (${d.driverCode})` }))}
        vehicleOptions={vehicles.map((v) => ({ value: v.id, label: v.number }))}
        bankOptions={banks.map((b) => ({ value: b.id, label: b.name, meta: b.ledgerGroup }))}
        canDelete={session.role === "ADMIN" || session.role === "OWNER"}
      />
    </div>
  );
}
