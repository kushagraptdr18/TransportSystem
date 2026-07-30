import type { Prisma } from "@prisma/client";
import { requireSession } from "@/lib/session";
import { authorize } from "@/lib/authz";
import { withTenant } from "@/lib/db";
import { DriverClient, type DriverRow } from "@/components/vehicle/driver-client";

export const dynamic = "force-dynamic";

export default async function DriversPage({
  searchParams,
}: {
  searchParams: { q?: string; vehicle?: string; status?: string };
}) {
  const session = requireSession();
  await authorize(session, "maintenance", "view");

  const { drivers, vehicles } = await withTenant(session.tenantId, async (tx) => {
    const where: Prisma.DriverWhereInput = { firmId: session.firmId, deletedAt: null };
    if (searchParams.q) {
      where.OR = [
        { name: { contains: searchParams.q, mode: "insensitive" } },
        { driverCode: { contains: searchParams.q, mode: "insensitive" } },
        { mobile: { contains: searchParams.q } },
      ];
    }
    if (searchParams.status === "ACTIVE" || searchParams.status === "INACTIVE") {
      where.status = searchParams.status;
    }
    if (searchParams.vehicle) {
      where.assignments = { some: { vehicleId: searchParams.vehicle } };
    }
    const [drivers, vehicles] = await Promise.all([
      tx.driver.findMany({
        where,
        include: {
          documents: true,
          assignments: { orderBy: { fromDate: "asc" } },
        },
        orderBy: { createdAt: "desc" },
      }),
      tx.vehicle.findMany({ where: { isActive: true }, orderBy: { number: "asc" } }),
    ]);
    return { drivers, vehicles };
  });

  const vehicleNo = new Map(vehicles.map((v) => [v.id, v.number]));

  const rows: DriverRow[] = drivers.map((d) => {
    const open = d.assignments.find((a) => !a.toDate);
    return {
      id: d.id,
      driverCode: d.driverCode,
      name: d.name,
      mobile: d.mobile ?? "",
      emergencyContact: d.emergencyContact ?? "",
      address: d.address ?? "",
      joinDate: d.joinDate ? d.joinDate.toISOString() : null,
      exitDate: d.exitDate ? d.exitDate.toISOString() : null,
      exitReason: d.exitReason ?? "",
      status: d.status,
      remarks: d.remarks ?? "",
      currentVehicle: open ? vehicleNo.get(open.vehicleId) ?? "" : "",
      licence: { path: d.licencePath, name: d.licenceName },
      aadhaar: { path: d.aadhaarPath, name: d.aadhaarName },
      pan: { path: d.panPath, name: d.panName },
      photo: { path: d.photoPath, name: d.photoName },
      medical: { path: d.medicalPath, name: d.medicalName },
      police: { path: d.policePath, name: d.policeName },
      otherDocs: d.documents.map((o) => ({ title: o.title, path: o.filePath, name: o.fileName })),
      assignments: d.assignments.map((a) => ({
        vehicle: vehicleNo.get(a.vehicleId) ?? "",
        fromDate: a.fromDate.toISOString(),
        toDate: a.toDate ? a.toDate.toISOString() : null,
        reason: a.reason ?? "",
        remarks: a.remarks ?? "",
      })),
    };
  });

  return (
    <div className="space-y-4 p-4">
      <DriverClient
        rows={rows}
        vehicleOptions={vehicles.map((v) => ({ value: v.id, label: v.number }))}
      />
    </div>
  );
}
