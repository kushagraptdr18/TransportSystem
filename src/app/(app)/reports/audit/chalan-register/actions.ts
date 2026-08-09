"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { authorize } from "@/lib/authz";
import { audit } from "@/lib/audit";

/**
 * Audit Challan Register — write actions.
 *
 * Every value lands in the AuditChalan row verbatim. Nothing here reads or
 * writes Party / Vehicle / City / AccountHead, posts a ledger entry, touches a
 * voucher, or creates a master row: the register is reference data only. The
 * single side effect outside AuditChalan is the AuditLog trail, which records
 * who changed what and never carries a financial amount into the books.
 */

export interface AuditChalanInput {
  id?: string;
  chalanNo: string;
  chalanDate: string; // yyyy-mm-dd
  transportName: string;
  ownerName: string;
  panCard: string;
  loadingFrom: string;
  toLocation: string;
  actualWt: number;
  chargeWt: number;
  freightRate: number;
  freightAmount: number;
  tdsAmount: number;
  advanceBank: number;
  cash: number;
  diesel: number;
  tyre: number;
  uria: number;
  other: number;
  balance: number;
}

export type SaveResult = { ok: true; id: string } | { ok: false; error: string };

const REGISTER_PATH = "/reports/audit/chalan-register";

/** Field-level validation only — never a lookup against master data. */
function validate(input: AuditChalanInput): string | null {
  if (!input.chalanNo.trim()) return "Challan No. is required.";
  if (!input.chalanDate || isNaN(new Date(input.chalanDate + "T00:00:00").getTime())) {
    return "A valid Date is required.";
  }
  return null;
}

function toRow(input: AuditChalanInput) {
  return {
    chalanNo: input.chalanNo.trim(),
    chalanDate: new Date(input.chalanDate + "T00:00:00"),
    // trimmed but otherwise untouched — no case-folding, no master matching
    transportName: input.transportName.trim(),
    ownerName: input.ownerName.trim(),
    panCard: input.panCard.trim(),
    loadingFrom: input.loadingFrom.trim(),
    toLocation: input.toLocation.trim(),
    actualWt: input.actualWt,
    chargeWt: input.chargeWt,
    freightRate: input.freightRate,
    freightAmount: input.freightAmount,
    tdsAmount: input.tdsAmount,
    advanceBank: input.advanceBank,
    cash: input.cash,
    diesel: input.diesel,
    tyre: input.tyre,
    uria: input.uria,
    other: input.other,
    balance: input.balance,
  };
}

export async function saveAuditChalan(input: AuditChalanInput): Promise<SaveResult> {
  const session = requireSession();
  await authorize(session, "auditreg", input.id ? "edit" : "create");

  const err = validate(input);
  if (err) return { ok: false, error: err };

  try {
    const id = await withTenant(session.tenantId, async (tx) => {
      const data = toRow(input);
      if (input.id) {
        const before = await tx.auditChalan.findFirst({
          where: { id: input.id, firmId: session.firmId, deletedAt: null },
        });
        if (!before) throw new Error("Record not found.");
        const after = await tx.auditChalan.update({ where: { id: input.id }, data });
        await audit(tx, session, {
          entity: "AuditChalan",
          entityId: after.id,
          action: "UPDATE",
          before,
          after,
        });
        return after.id;
      }
      const created = await tx.auditChalan.create({
        data: {
          ...data,
          tenantId: session.tenantId,
          firmId: session.firmId,
          fyId: session.fyId,
        },
      });
      await audit(tx, session, {
        entity: "AuditChalan",
        entityId: created.id,
        action: "CREATE",
        after: created,
      });
      return created.id;
    });
    revalidatePath(REGISTER_PATH);
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Save failed." };
  }
}

/**
 * Soft-delete. Removes the row from the Audit Register and nothing else: no
 * real chalan is cancelled, no payment or receipt is reversed, no ledger or
 * balance moves.
 */
export async function deleteAuditChalan(id: string): Promise<{ ok: boolean; error?: string }> {
  const session = requireSession();
  await authorize(session, "auditreg", "delete");
  try {
    await withTenant(session.tenantId, async (tx) => {
      const before = await tx.auditChalan.findFirst({
        where: { id, firmId: session.firmId, deletedAt: null },
      });
      if (!before) throw new Error("Record not found.");
      await tx.auditChalan.update({ where: { id }, data: { deletedAt: new Date() } });
      await audit(tx, session, {
        entity: "AuditChalan",
        entityId: id,
        action: "DELETE",
        before,
      });
    });
    revalidatePath(REGISTER_PATH);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Delete failed." };
  }
}

export async function deleteAuditChalans(
  ids: string[]
): Promise<{ ok: boolean; deleted: number; error?: string }> {
  const session = requireSession();
  await authorize(session, "auditreg", "delete");
  if (ids.length === 0) return { ok: true, deleted: 0 };
  try {
    const deleted = await withTenant(session.tenantId, async (tx) => {
      const res = await tx.auditChalan.updateMany({
        where: { id: { in: ids }, firmId: session.firmId, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      await audit(tx, session, {
        entity: "AuditChalan",
        entityId: ids.join(","),
        action: "DELETE",
        before: { ids },
      });
      return res.count;
    });
    revalidatePath(REGISTER_PATH);
    return { ok: true, deleted };
  } catch (e) {
    return { ok: false, deleted: 0, error: e instanceof Error ? e.message : "Delete failed." };
  }
}
