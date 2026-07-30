"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { authorize } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { ensureAccountHead, postLedger, reverseLedger } from "@/lib/ledger";
import { toNum } from "@/lib/utils";

/**
 * AdBlue (Urea) stock register — LITRES ONLY. Deliberately no accounting:
 * no expense/purchase voucher, no ledger entry, no value stored. The amount
 * is computed only inside a trip sheet (litres × manually entered rate).
 */

const REVALIDATE = "/vehicle/adblue";

const schema = z.object({
  id: z.string().nullish(),
  type: z.enum(["REFILL", "ISSUE"]),
  date: z.string().min(1, "Date is required"),
  supplierName: z.string().nullish(),
  vehicleId: z.string().nullish(),
  destination: z.string().nullish(),
  qty: z.number().min(0.01, "Quantity (litres) is required"),
  amount: z.number().min(0).default(0), // purchase value (refill only, optional)
  bankPartyId: z.string().nullish(), // paid from (refill only)
  refNo: z.string().nullish(),
  remarks: z.string().nullish(),
});

export async function saveAdblueTxn(
  input: unknown
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const session = requireSession();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;
  await authorize(session, "maintenance", d.id ? "edit" : "create");
  if (d.type === "ISSUE" && !d.vehicleId) {
    return { ok: false, error: "Vehicle is required for an issue entry." };
  }

  try {
    return await withTenant(session.tenantId, async (tx) => {
      const values = {
        type: d.type,
        date: new Date(`${d.date}T00:00:00`),
        supplierName: d.type === "REFILL" ? d.supplierName?.trim() || null : null,
        vehicleId: d.vehicleId || null,
        destination: d.type === "ISSUE" ? d.destination?.trim() || null : null,
        qty: d.qty,
        amount: d.type === "REFILL" ? d.amount : 0,
        bankPartyId: d.type === "REFILL" ? d.bankPartyId || null : null,
        refNo: d.refNo?.trim() || null,
        remarks: d.remarks || null,
      };
      let id: string;
      if (d.id) {
        const before = await tx.adblueTxn.findFirstOrThrow({ where: { id: d.id, deletedAt: null } });
        const updated = await tx.adblueTxn.update({ where: { id: d.id }, data: values });
        id = updated.id;
        await audit(tx, session, { entity: "AdblueTxn", entityId: id, action: "UPDATE", before, after: updated });
      } else {
        const created = await tx.adblueTxn.create({
          data: {
            tenantId: session.tenantId,
            firmId: session.firmId,
            fyId: session.fyId,
            createdById: session.userId,
            ...values,
          },
        });
        id = created.id;
        await audit(tx, session, { entity: "AdblueTxn", entityId: id, action: "CREATE", after: created });
      }

      // refill purchase value posts to the Urea Expense Ledger (no vehicle
      // allocation at purchase time); issues never post anything
      await reverseLedger(tx, "ADBLUE", id);
      if (values.type === "REFILL" && values.amount > 0 && values.bankPartyId) {
        const ureaHead = await ensureAccountHead(tx, session, "Urea Expense", "EXPENSE");
        const common = {
          date: values.date,
          refType: "ADBLUE",
          refId: id,
          refNo: values.refNo || "ADBLUE",
          narration: `AdBlue purchase ${values.qty} L${values.supplierName ? " — " + values.supplierName : ""}`,
        };
        await postLedger(tx, session, [
          { ...common, accountHeadId: ureaHead, side: "DEBIT", amount: values.amount },
          { ...common, partyId: values.bankPartyId, side: "CREDIT", amount: values.amount },
        ]);
      }
      revalidatePath(REVALIDATE);
      return { ok: true as const, id };
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Save failed" };
  }
}

export async function deleteAdblueTxn(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = requireSession();
  if (session.role !== "ADMIN" && session.role !== "OWNER") {
    return { ok: false, error: "Only Admin/Owner may delete AdBlue entries" };
  }
  await authorize(session, "maintenance", "delete");
  try {
    await withTenant(session.tenantId, async (tx) => {
      const before = await tx.adblueTxn.findFirstOrThrow({ where: { id, deletedAt: null } });
      await tx.adblueTxn.update({ where: { id }, data: { deletedAt: new Date() } });
      await reverseLedger(tx, "ADBLUE", id);
      await audit(tx, session, { entity: "AdblueTxn", entityId: id, action: "DELETE", before });
    });
    revalidatePath(REVALIDATE);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Delete failed" };
  }
}

// ------------------------------------------------- trip sheet fetch (read-only)

/** Total urea litres ISSUED to a vehicle in a date range (trip sheet fetch). */
export async function fetchAdblueForTrip(input: {
  vehicleId: string;
  dateFrom: string;
  dateTo: string;
}): Promise<{
  totalQty: number;
  rows: { id: string; date: string; destination: string; qty: number; remarks: string }[];
}> {
  const session = requireSession();
  return withTenant(session.tenantId, async (tx) => {
    const rows = await tx.adblueTxn.findMany({
      where: {
        firmId: session.firmId,
        type: "ISSUE",
        vehicleId: input.vehicleId,
        deletedAt: null,
        date: {
          gte: new Date(`${input.dateFrom}T00:00:00`),
          lte: new Date(`${input.dateTo}T23:59:59`),
        },
      },
      orderBy: { date: "asc" },
    });
    const out = rows.map((r) => ({
      id: r.id,
      date: r.date.toISOString(),
      destination: r.destination ?? "",
      qty: toNum(String(r.qty)),
      remarks: r.remarks ?? "",
    }));
    return { totalQty: Math.round(out.reduce((s, r) => s + r.qty, 0) * 100) / 100, rows: out };
  });
}
