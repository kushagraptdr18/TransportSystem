"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/session";
import { authorize } from "@/lib/authz";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { actionError, zodError, type ActionResult } from "../_lib/util";

const schema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Name is required"),
  value: z.coerce.number().default(1),
});

export async function saveUnit(input: unknown): Promise<ActionResult> {
  const session = requireSession();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return zodError(parsed.error);
  const data = parsed.data;
  await authorize(session, "masters", data.id ? "edit" : "create");
  try {
    const id = await withTenant(session.tenantId, async (tx) => {
      const values = { name: data.name.toUpperCase(), value: data.value };
      if (data.id) {
        const before = await tx.unit.findUniqueOrThrow({ where: { id: data.id } });
        const row = await tx.unit.update({ where: { id: data.id }, data: values });
        await audit(tx, session, { entity: "Unit", entityId: row.id, action: "UPDATE", before, after: row });
        return row.id;
      }
      const row = await tx.unit.create({ data: { tenantId: session.tenantId, ...values } });
      await audit(tx, session, { entity: "Unit", entityId: row.id, action: "CREATE", after: row });
      return row.id;
    });
    revalidatePath("/masters/units");
    return { ok: true, id };
  } catch (e) {
    return actionError(e);
  }
}

export async function deleteUnit(id: string): Promise<ActionResult> {
  const session = requireSession();
  await authorize(session, "masters", "delete");
  try {
    await withTenant(session.tenantId, async (tx) => {
      const before = await tx.unit.findUniqueOrThrow({ where: { id } });
      await tx.unit.delete({ where: { id } });
      await audit(tx, session, { entity: "Unit", entityId: id, action: "DELETE", before });
    });
    revalidatePath("/masters/units");
    return { ok: true, id };
  } catch (e) {
    return actionError(e);
  }
}
