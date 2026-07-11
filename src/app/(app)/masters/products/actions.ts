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
  groupId: z.string().min(1, "Group is required"),
  name: z.string().trim().min(1, "Name is required"),
  unit: optStr,
  hsnCode: optStr,
  gstPct: z.coerce.number().min(0).max(100).default(0),
  type: optStr,
  className: optStr,
  division: optStr,
});

export async function saveProduct(input: unknown): Promise<ActionResult> {
  const session = requireSession();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return zodError(parsed.error);
  const data = parsed.data;
  await authorize(session, "masters", data.id ? "edit" : "create");
  try {
    const id = await withTenant(session.tenantId, async (tx) => {
      const values = {
        groupId: data.groupId,
        name: data.name.toUpperCase(),
        unit: data.unit,
        hsnCode: data.hsnCode,
        gstPct: data.gstPct,
        type: data.type,
        className: data.className,
        division: data.division,
      };
      if (data.id) {
        const before = await tx.product.findUniqueOrThrow({ where: { id: data.id } });
        const row = await tx.product.update({ where: { id: data.id }, data: values });
        await audit(tx, session, { entity: "Product", entityId: row.id, action: "UPDATE", before, after: row });
        return row.id;
      }
      const row = await tx.product.create({ data: { tenantId: session.tenantId, ...values } });
      await audit(tx, session, { entity: "Product", entityId: row.id, action: "CREATE", after: row });
      return row.id;
    });
    revalidatePath("/masters/products");
    return { ok: true, id };
  } catch (e) {
    return actionError(e);
  }
}

export async function deleteProduct(id: string): Promise<ActionResult> {
  const session = requireSession();
  await authorize(session, "masters", "delete");
  try {
    await withTenant(session.tenantId, async (tx) => {
      const before = await tx.product.findUniqueOrThrow({ where: { id } });
      await tx.product.delete({ where: { id } });
      await audit(tx, session, { entity: "Product", entityId: id, action: "DELETE", before });
    });
    revalidatePath("/masters/products");
    return { ok: true, id };
  } catch (e) {
    return actionError(e);
  }
}
