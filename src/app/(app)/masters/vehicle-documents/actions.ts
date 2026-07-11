"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/session";
import { authorize } from "@/lib/authz";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { actionError, optStr, parseDateInput, zodError, type ActionResult } from "../_lib/util";

const schema = z.object({
  id: z.string().optional(),
  docTypeId: z.string().min(1, "Document type is required"),
  vehicleId: z.string().min(1, "Vehicle is required"),
  docNo: optStr,
  companyName: optStr,
  status: z.enum(["DONE", "PENDING"]).default("DONE"),
  entryDate: z.string().min(1, "Entry date is required"),
  effectiveDate: optStr,
  expiryDate: optStr,
  remarks: optStr,
});

export async function saveVehicleDocument(input: unknown): Promise<ActionResult> {
  const session = requireSession();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return zodError(parsed.error);
  const data = parsed.data;
  await authorize(session, "masters", data.id ? "edit" : "create");
  const entryDate = parseDateInput(data.entryDate);
  if (!entryDate) return { ok: false, error: "Invalid entry date" };
  try {
    const id = await withTenant(session.tenantId, async (tx) => {
      const values = {
        docTypeId: data.docTypeId,
        vehicleId: data.vehicleId,
        docNo: data.docNo,
        companyName: data.companyName,
        status: data.status,
        entryDate,
        effectiveDate: parseDateInput(data.effectiveDate),
        expiryDate: parseDateInput(data.expiryDate),
        remarks: data.remarks,
      };
      if (data.id) {
        const before = await tx.vehicleDocument.findUniqueOrThrow({ where: { id: data.id } });
        const row = await tx.vehicleDocument.update({ where: { id: data.id }, data: values });
        await audit(tx, session, { entity: "VehicleDocument", entityId: row.id, action: "UPDATE", before, after: row });
        return row.id;
      }
      const row = await tx.vehicleDocument.create({ data: { tenantId: session.tenantId, ...values } });
      await audit(tx, session, { entity: "VehicleDocument", entityId: row.id, action: "CREATE", after: row });
      return row.id;
    });
    revalidatePath("/masters/vehicle-documents");
    return { ok: true, id };
  } catch (e) {
    return actionError(e);
  }
}

export async function deleteVehicleDocument(id: string): Promise<ActionResult> {
  const session = requireSession();
  await authorize(session, "masters", "delete");
  try {
    await withTenant(session.tenantId, async (tx) => {
      const before = await tx.vehicleDocument.findUniqueOrThrow({ where: { id } });
      await tx.vehicleDocument.delete({ where: { id } });
      await audit(tx, session, { entity: "VehicleDocument", entityId: id, action: "DELETE", before });
    });
    revalidatePath("/masters/vehicle-documents");
    return { ok: true, id };
  } catch (e) {
    return actionError(e);
  }
}
