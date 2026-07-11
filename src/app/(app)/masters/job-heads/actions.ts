"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/session";
import { authorize } from "@/lib/authz";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { actionError, optStr, zodError, type ActionResult } from "../_lib/util";

const schema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Name is required"),
  gstPct: z.coerce.number().min(0).max(100).default(0),
  hsnCode: optStr,
  description: optStr,
  showReminder: z.boolean().default(false),
});

export async function saveJobHead(input: unknown): Promise<ActionResult> {
  const session = requireSession();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return zodError(parsed.error);
  const data = parsed.data;
  await authorize(session, "masters", data.id ? "edit" : "create");
  try {
    const id = await withTenant(session.tenantId, async (tx) => {
      const values = {
        name: data.name,
        gstPct: data.gstPct,
        hsnCode: data.hsnCode,
        description: data.description,
        showReminder: data.showReminder,
      };
      if (data.id) {
        const before = await tx.jobHead.findUniqueOrThrow({ where: { id: data.id } });
        const row = await tx.jobHead.update({ where: { id: data.id }, data: values });
        await audit(tx, session, { entity: "JobHead", entityId: row.id, action: "UPDATE", before, after: row });
        return row.id;
      }
      const row = await tx.jobHead.create({ data: { tenantId: session.tenantId, ...values } });
      await audit(tx, session, { entity: "JobHead", entityId: row.id, action: "CREATE", after: row });
      return row.id;
    });
    revalidatePath("/masters/job-heads");
    return { ok: true, id };
  } catch (e) {
    return actionError(e);
  }
}

export async function deleteJobHead(id: string): Promise<ActionResult> {
  const session = requireSession();
  await authorize(session, "masters", "delete");
  try {
    await withTenant(session.tenantId, async (tx) => {
      const before = await tx.jobHead.findUniqueOrThrow({ where: { id } });
      await tx.jobHead.delete({ where: { id } });
      await audit(tx, session, { entity: "JobHead", entityId: id, action: "DELETE", before });
    });
    revalidatePath("/masters/job-heads");
    return { ok: true, id };
  } catch (e) {
    return actionError(e);
  }
}
