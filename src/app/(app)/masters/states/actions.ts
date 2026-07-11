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
  gstCode: z.string().trim().optional().default(""),
});

export async function saveState(input: unknown): Promise<ActionResult> {
  const session = requireSession();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return zodError(parsed.error);
  const data = parsed.data;
  await authorize(session, "masters", data.id ? "edit" : "create");
  try {
    const id = await withTenant(session.tenantId, async (tx) => {
      const values = { name: data.name.toUpperCase(), gstCode: data.gstCode };
      if (data.id) {
        const before = await tx.state.findUniqueOrThrow({ where: { id: data.id } });
        const row = await tx.state.update({ where: { id: data.id }, data: values });
        await audit(tx, session, { entity: "State", entityId: row.id, action: "UPDATE", before, after: row });
        return row.id;
      }
      const row = await tx.state.create({ data: { tenantId: session.tenantId, ...values } });
      await audit(tx, session, { entity: "State", entityId: row.id, action: "CREATE", after: row });
      return row.id;
    });
    revalidatePath("/masters/states");
    return { ok: true, id };
  } catch (e) {
    return actionError(e);
  }
}

export async function deleteState(id: string): Promise<ActionResult> {
  const session = requireSession();
  await authorize(session, "masters", "delete");
  try {
    await withTenant(session.tenantId, async (tx) => {
      const before = await tx.state.findUniqueOrThrow({ where: { id } });
      await tx.state.delete({ where: { id } });
      await audit(tx, session, { entity: "State", entityId: id, action: "DELETE", before });
    });
    revalidatePath("/masters/states");
    return { ok: true, id };
  } catch (e) {
    return actionError(e);
  }
}
