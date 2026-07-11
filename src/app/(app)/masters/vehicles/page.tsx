import { requireSession } from "@/lib/session";
import { authorize } from "@/lib/authz";
import { withTenant } from "@/lib/db";
import { VehiclesClient } from "@/components/masters/vehicles-client";

export default async function VehiclesPage({
  searchParams,
}: {
  searchParams: { q?: string; own?: string };
}) {
  const session = requireSession();
  await authorize(session, "masters", "view");
  const q = searchParams.q?.trim();
  const own = searchParams.own;

  const { rows, owners } = await withTenant(session.tenantId, async (tx) => {
    const rows = await tx.vehicle.findMany({
      where: {
        isActive: true,
        ...(q ? { number: { contains: q, mode: "insensitive" } } : {}),
        ...(own === "OWN" ? { isOwn: true } : own === "MARKET" ? { isOwn: false } : {}),
      },
      include: { owner: true },
      orderBy: { number: "asc" },
    });
    const owners = await tx.party.findMany({
      where: { isActive: true, ledgerGroup: "OWNER_BROKER" },
      orderBy: { name: "asc" },
    });
    return { rows, owners };
  });

  const canDelete = session.role === "ADMIN" || session.role === "OWNER";
  return (
    <VehiclesClient
      rows={rows.map((r) => ({
        id: r.id,
        number: r.number,
        isOwn: r.isOwn,
        ownerId: r.ownerId,
        ownerName: r.owner?.name ?? null,
        ownerNames: r.ownerNames,
        chassisNo: r.chassisNo,
        engineNo: r.engineNo,
        vehicleType: r.vehicleType,
        permitNo: r.permitNo,
        insuranceNo: r.insuranceNo,
      }))}
      ownerOptions={owners.map((p) => ({ value: p.id, label: p.name, meta: p.pan ?? undefined }))}
      canDelete={canDelete}
    />
  );
}
