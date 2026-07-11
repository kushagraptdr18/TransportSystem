"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { RateBasis } from "@prisma/client";
import { requireSession } from "@/lib/session";
import { authorize } from "@/lib/authz";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { actionError, zodError, type ActionResult } from "../_lib/util";

const basis = z.nativeEnum(RateBasis);

const schema = z.object({
  id: z.string().optional(),
  partyId: z.string().min(1, "Party is required"),
  productId: z.string().nullable().optional(),
  sourceCityId: z.string().min(1, "Source city is required"),
  destCityId: z.string().min(1, "Destination city is required"),
  rate: z.coerce.number().default(0),
  rateBasis: basis.default("CHARGE_WT"),
  hamali: z.coerce.number().default(0),
  hamaliBasis: basis.default("FIXED"),
  preBhada: z.coerce.number().default(0),
  preBhadaBasis: basis.default("FIXED"),
  dCharge: z.coerce.number().default(0),
  dChargeBasis: basis.default("FIXED"),
  stationery: z.coerce.number().default(0),
  stationeryBasis: basis.default("FIXED"),
  crossing: z.coerce.number().default(0),
  crossingBasis: basis.default("FIXED"),
});

export async function saveRate(input: unknown): Promise<ActionResult> {
  const session = requireSession();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return zodError(parsed.error);
  const data = parsed.data;
  await authorize(session, "masters", data.id ? "edit" : "create");
  try {
    const id = await withTenant(session.tenantId, async (tx) => {
      const { id: rowId, ...values } = data;
      const payload = { ...values, productId: values.productId || null };
      if (rowId) {
        const before = await tx.rateMaster.findUniqueOrThrow({ where: { id: rowId } });
        const row = await tx.rateMaster.update({ where: { id: rowId }, data: payload });
        await audit(tx, session, { entity: "RateMaster", entityId: row.id, action: "UPDATE", before, after: row });
        return row.id;
      }
      const row = await tx.rateMaster.create({ data: { tenantId: session.tenantId, ...payload } });
      await audit(tx, session, { entity: "RateMaster", entityId: row.id, action: "CREATE", after: row });
      return row.id;
    });
    revalidatePath("/masters/rates");
    return { ok: true, id };
  } catch (e) {
    return actionError(e);
  }
}

export async function deleteRate(id: string): Promise<ActionResult> {
  const session = requireSession();
  await authorize(session, "masters", "delete");
  try {
    await withTenant(session.tenantId, async (tx) => {
      const before = await tx.rateMaster.findUniqueOrThrow({ where: { id } });
      await tx.rateMaster.delete({ where: { id } });
      await audit(tx, session, { entity: "RateMaster", entityId: id, action: "DELETE", before });
    });
    revalidatePath("/masters/rates");
    return { ok: true, id };
  } catch (e) {
    return actionError(e);
  }
}
