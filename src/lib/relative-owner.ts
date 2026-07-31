import type { Tx } from "./db";

/**
 * Resolve the RELATIVE owner behind a driver transaction. Uses the explicit
 * vehicle when the document has one; otherwise the driver's assignment in
 * force at the transaction date. Returns null for own / market vehicles, so
 * company-fleet accounting stays completely unchanged.
 */
export async function resolveRelativeOwner(
  tx: Tx,
  opts: { vehicleId?: string | null; driverId?: string | null; at?: Date | null }
): Promise<{ ownerId: string; vehicleNo: string } | null> {
  let vehicleId = opts.vehicleId ?? null;
  if (!vehicleId && opts.driverId) {
    const at = opts.at ?? new Date();
    const a = await tx.driverAssignment.findFirst({
      where: {
        driverId: opts.driverId,
        fromDate: { lte: at },
        OR: [{ toDate: null }, { toDate: { gte: at } }],
      },
      orderBy: { fromDate: "desc" },
    });
    vehicleId = a?.vehicleId ?? null;
  }
  if (!vehicleId) return null;
  const v = await tx.vehicle.findFirst({ where: { id: vehicleId } });
  if (v?.ownershipType === "RELATIVE" && v.ownerId) {
    return { ownerId: v.ownerId, vehicleNo: v.number };
  }
  return null;
}
