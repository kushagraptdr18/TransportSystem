"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/session";
import { authorize } from "@/lib/authz";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { actionError, optStr, zodError, type ActionResult } from "../_lib/util";

const schema = z
  .object({
    id: z.string().optional(),
    number: z.string().trim().min(1, "Vehicle number is required"),
    isOwn: z.boolean().default(false),
    ownerId: z.string().optional().nullable(),
    ownerNames: optStr,
    chassisNo: optStr,
    engineNo: optStr,
    vehicleType: optStr,
    permitNo: optStr,
    insuranceNo: optStr,
  })
  .refine((d) => d.isOwn || Boolean(d.ownerId), {
    message: "Broker is required for broker vehicles",
    path: ["ownerId"],
  });

export async function saveVehicle(input: unknown): Promise<ActionResult> {
  const session = requireSession();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return zodError(parsed.error);
  const data = parsed.data;
  await authorize(session, "masters", data.id ? "edit" : "create");
  try {
    const id = await withTenant(session.tenantId, async (tx) => {
      const values = {
        number: data.number.toUpperCase().replace(/\s+/g, ""),
        isOwn: data.isOwn,
        ownerId: data.isOwn ? null : data.ownerId ?? null,
        ownerNames: data.isOwn ? data.ownerNames : null,
        chassisNo: data.chassisNo,
        engineNo: data.engineNo,
        vehicleType: data.vehicleType,
        permitNo: data.permitNo,
        insuranceNo: data.insuranceNo,
      };
      if (data.id) {
        const before = await tx.vehicle.findUniqueOrThrow({ where: { id: data.id } });
        const row = await tx.vehicle.update({ where: { id: data.id }, data: values });
        await audit(tx, session, { entity: "Vehicle", entityId: row.id, action: "UPDATE", before, after: row });
        return row.id;
      }
      const row = await tx.vehicle.create({ data: { tenantId: session.tenantId, ...values } });
      await audit(tx, session, { entity: "Vehicle", entityId: row.id, action: "CREATE", after: row });
      return row.id;
    });
    revalidatePath("/masters/vehicles");
    return { ok: true, id };
  } catch (e) {
    return actionError(e);
  }
}

/** Soft delete: mark inactive (vehicle may be referenced by documents). */
export async function deleteVehicle(id: string): Promise<ActionResult> {
  const session = requireSession();
  await authorize(session, "masters", "delete");
  try {
    await withTenant(session.tenantId, async (tx) => {
      const before = await tx.vehicle.findUniqueOrThrow({ where: { id } });
      const after = await tx.vehicle.update({ where: { id }, data: { isActive: false } });
      await audit(tx, session, { entity: "Vehicle", entityId: id, action: "DELETE", before, after });
    });
    revalidatePath("/masters/vehicles");
    return { ok: true, id };
  } catch (e) {
    return actionError(e);
  }
}
