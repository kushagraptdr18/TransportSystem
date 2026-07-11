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
  description: optStr,
  showReminder: z.boolean().default(true),
});

export async function saveDocumentType(input: unknown): Promise<ActionResult> {
  const session = requireSession();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return zodError(parsed.error);
  const data = parsed.data;
  await authorize(session, "masters", data.id ? "edit" : "create");
  try {
    const id = await withTenant(session.tenantId, async (tx) => {
      const values = { name: data.name, description: data.description, showReminder: data.showReminder };
      if (data.id) {
        const before = await tx.documentType.findUniqueOrThrow({ where: { id: data.id } });
        const row = await tx.documentType.update({ where: { id: data.id }, data: values });
        await audit(tx, session, { entity: "DocumentType", entityId: row.id, action: "UPDATE", before, after: row });
        return row.id;
      }
      const row = await tx.documentType.create({ data: { tenantId: session.tenantId, ...values } });
      await audit(tx, session, { entity: "DocumentType", entityId: row.id, action: "CREATE", after: row });
      return row.id;
    });
    revalidatePath("/masters/document-master");
    return { ok: true, id };
  } catch (e) {
    return actionError(e);
  }
}

export async function deleteDocumentType(id: string): Promise<ActionResult> {
  const session = requireSession();
  await authorize(session, "masters", "delete");
  try {
    await withTenant(session.tenantId, async (tx) => {
      const before = await tx.documentType.findUniqueOrThrow({ where: { id } });
      await tx.documentType.delete({ where: { id } });
      await audit(tx, session, { entity: "DocumentType", entityId: id, action: "DELETE", before });
    });
    revalidatePath("/masters/document-master");
    return { ok: true, id };
  } catch (e) {
    return actionError(e);
  }
}
