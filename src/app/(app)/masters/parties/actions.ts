"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { LedgerGroup } from "@prisma/client";
import { requireSession } from "@/lib/session";
import { authorize } from "@/lib/authz";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { actionError, optStr, zodError, type ActionResult } from "../_lib/util";

const schema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Name is required"),
  ledgerGroup: z.nativeEnum(LedgerGroup),
  alias: optStr,
  address1: optStr,
  address2: optStr,
  stateId: optStr,
  cityId: optStr,
  gstin: optStr,
  pan: optStr,
  mobile: optStr,
  phone: optStr,
  email: optStr,
  ownerName: optStr,
  vendorCode: optStr,
  openingBalance: z.coerce.number().default(0),
  openingSide: z.enum(["DEBIT", "CREDIT"]).default("DEBIT"),
  tdsMode: z.enum(["TDS_APPLICABLE", "DECLARATION"]).nullable().optional(),
  bankName: optStr,
  bankAccount: optStr,
  bankIfsc: optStr,
  isActive: z.boolean().default(true),
});

export async function saveParty(input: unknown): Promise<ActionResult> {
  const session = requireSession();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return zodError(parsed.error);
  const data = parsed.data;
  await authorize(session, "masters", data.id ? "edit" : "create");
  try {
    const id = await withTenant(session.tenantId, async (tx) => {
      const values = {
        name: data.name.toUpperCase(),
        ledgerGroup: data.ledgerGroup,
        alias: data.alias,
        address1: data.address1,
        address2: data.address2,
        stateId: data.stateId,
        cityId: data.cityId,
        gstin: data.gstin ? data.gstin.toUpperCase() : null,
        pan: data.pan ? data.pan.toUpperCase() : null,
        mobile: data.mobile,
        phone: data.phone,
        email: data.email,
        ownerName: data.ownerName,
        vendorCode: data.vendorCode,
        openingBalance: data.openingBalance,
        openingSide: data.openingSide,
        tdsMode: data.ledgerGroup === "OWNER_BROKER" ? data.tdsMode ?? "TDS_APPLICABLE" : null,
        bankName: data.bankName,
        bankAccount: data.bankAccount,
        bankIfsc: data.bankIfsc ? data.bankIfsc.toUpperCase() : null,
        isActive: data.isActive,
      };
      if (data.id) {
        const before = await tx.party.findUniqueOrThrow({ where: { id: data.id } });
        const row = await tx.party.update({ where: { id: data.id }, data: values });
        await audit(tx, session, { entity: "Party", entityId: row.id, action: "UPDATE", before, after: row });
        return row.id;
      }
      const row = await tx.party.create({ data: { tenantId: session.tenantId, ...values } });
      await audit(tx, session, { entity: "Party", entityId: row.id, action: "CREATE", after: row });
      return row.id;
    });
    revalidatePath("/masters/parties");
    return { ok: true, id };
  } catch (e) {
    return actionError(e);
  }
}

export async function deleteParty(id: string): Promise<ActionResult> {
  const session = requireSession();
  await authorize(session, "masters", "delete");
  try {
    await withTenant(session.tenantId, async (tx) => {
      const before = await tx.party.findUniqueOrThrow({ where: { id } });
      // parties are referenced everywhere — deactivate instead of hard delete
      await tx.party.update({ where: { id }, data: { isActive: false } });
      await audit(tx, session, { entity: "Party", entityId: id, action: "DELETE", before });
    });
    revalidatePath("/masters/parties");
    return { ok: true, id };
  } catch (e) {
    return actionError(e);
  }
}
