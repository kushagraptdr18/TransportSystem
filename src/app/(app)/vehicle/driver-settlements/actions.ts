"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { authorize } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { postLedger } from "@/lib/ledger";
import { nextDocNumber } from "@/lib/sequences";
import { toNum } from "@/lib/utils";

/**
 * Driver +/- Settlement Register. Rows arrive automatically from completed
 * trip sheets (one per trip) or can be entered manually. Settling a positive
 * balance auto-creates a PAYMENT voucher (company pays driver); a negative
 * balance auto-creates a RECEIPT voucher (driver pays company). Settled
 * amounts never carry to the next trip.
 */

const REVALIDATE = "/vehicle/driver-settlements";

const manualSchema = z.object({
  date: z.string().min(1, "Date is required"),
  driverId: z.string().min(1, "Driver is required"),
  vehicleId: z.string().nullish(),
  tripRef: z.string().nullish(),
  amount: z.number().refine((v) => v !== 0, "Amount cannot be zero"),
  remarks: z.string().nullish(),
});

export async function saveDriverSettlement(
  input: unknown
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const session = requireSession();
  const parsed = manualSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;
  await authorize(session, "maintenance", "create");
  try {
    return await withTenant(session.tenantId, async (tx) => {
      const created = await tx.driverSettlement.create({
        data: {
          tenantId: session.tenantId,
          firmId: session.firmId,
          fyId: session.fyId,
          date: new Date(`${d.date}T00:00:00`),
          driverId: d.driverId,
          vehicleId: d.vehicleId || null,
          tripRef: d.tripRef?.trim() || null,
          amount: d.amount,
          remarks: d.remarks || null,
        },
      });
      await audit(tx, session, {
        entity: "DriverSettlement",
        entityId: created.id,
        action: "CREATE",
        after: created,
      });
      revalidatePath(REVALIDATE);
      return { ok: true as const, id: created.id };
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Save failed" };
  }
}

// ---------------------------------------------------------------- settle

const settleSchema = z.object({
  id: z.string().min(1),
  date: z.string().min(1, "Date is required"),
  paymentMode: z.enum(["CASH", "BANK"]).default("CASH"),
  bankPartyId: z.string().min(1, "Cash / Bank account is required"),
  remarks: z.string().nullish(),
});

export async function settleDriverSettlement(
  input: unknown
): Promise<{ ok: true; voucherNo: string } | { ok: false; error: string }> {
  const session = requireSession();
  const parsed = settleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;
  await authorize(session, "vouchers", "create");

  try {
    return await withTenant(session.tenantId, async (tx) => {
      const s = await tx.driverSettlement.findFirst({
        where: { id: d.id, firmId: session.firmId, deletedAt: null },
      });
      if (!s) return { ok: false as const, error: "Settlement not found" };
      if (s.status === "SETTLED") return { ok: false as const, error: "Already settled." };
      const amount = toNum(String(s.amount));
      if (amount === 0) return { ok: false as const, error: "Zero balance — nothing to settle." };

      const driver = await tx.driver.findFirst({ where: { id: s.driverId } });
      if (!driver?.partyId) {
        return { ok: false as const, error: "Driver has no linked ledger party." };
      }

      const pay = amount > 0; // company pays driver
      const abs = Math.abs(amount);
      const date = new Date(`${d.date}T00:00:00`);
      const voucherNo = await nextDocNumber(tx, {
        tenantId: session.tenantId,
        firmId: session.firmId,
        fyId: session.fyId,
        docType: pay ? "VOUCHER_PAYMENT" : "VOUCHER_RECEIPT",
      });

      const narration = `Driver ${pay ? "settlement paid to" : "settlement received from"} ${driver.name}${s.tripRef ? ` (trip ${s.tripRef})` : ""}${d.remarks ? " — " + d.remarks : ""}`;
      const voucher = await tx.voucher.create({
        data: {
          tenantId: session.tenantId,
          firmId: session.firmId,
          fyId: session.fyId,
          voucherNo,
          voucherDate: date,
          type: pay ? "PAYMENT" : "RECEIPT",
          entryType: d.paymentMode,
          moduleLink: "OTHERS",
          partyId: driver.partyId,
          bankPartyId: d.bankPartyId,
          amount: abs,
          netAmount: abs,
          remarks: narration,
          createdById: session.userId,
        },
      });

      const common = {
        date,
        refType: "VOUCHER",
        refId: voucher.id,
        refNo: s.tripRef || voucherNo,
        narration,
      };
      await postLedger(tx, session, [
        {
          ...common,
          partyId: d.bankPartyId,
          side: pay ? "CREDIT" : "DEBIT",
          amount: abs,
        },
        {
          ...common,
          partyId: driver.partyId,
          side: pay ? "DEBIT" : "CREDIT",
          amount: abs,
        },
      ]);

      const after = await tx.driverSettlement.update({
        where: { id: s.id },
        data: {
          status: "SETTLED",
          settledDate: date,
          voucherId: voucher.id,
          voucherNo,
        },
      });
      await audit(tx, session, {
        entity: "DriverSettlement",
        entityId: s.id,
        action: "UPDATE",
        before: s,
        after,
      });
      revalidatePath(REVALIDATE);
      revalidatePath("/accounts/vouchers/register");
      return { ok: true as const, voucherNo };
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Settlement failed" };
  }
}

export async function deleteDriverSettlement(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = requireSession();
  if (session.role !== "ADMIN" && session.role !== "OWNER") {
    return { ok: false, error: "Only Admin/Owner may delete settlement rows" };
  }
  await authorize(session, "maintenance", "delete");
  try {
    await withTenant(session.tenantId, async (tx) => {
      const before = await tx.driverSettlement.findFirstOrThrow({ where: { id, deletedAt: null } });
      if (before.status === "SETTLED") throw new Error("Settled rows cannot be deleted.");
      await tx.driverSettlement.update({ where: { id }, data: { deletedAt: new Date() } });
      await audit(tx, session, { entity: "DriverSettlement", entityId: id, action: "DELETE", before });
    });
    revalidatePath(REVALIDATE);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Delete failed" };
  }
}

// ------------------------------------------------- running balance settlement

const runningSettleSchema = z.object({
  driverId: z.string().min(1),
  date: z.string().min(1, "Date is required"),
  paymentMode: z.enum(["CASH", "BANK"]).default("CASH"),
  bankPartyId: z.string().min(1, "Cash / Bank account is required"),
  remarks: z.string().nullish(),
});

/**
 * Settle a driver's ENTIRE outstanding running balance in one shot — only the
 * latest entry offers Pay/Receive, and it always settles the net of all
 * pending entries. One voucher is created for the net amount; every pending
 * row is marked SETTLED so nothing carries forward.
 */
export async function settleDriverRunningBalance(
  input: unknown
): Promise<{ ok: true; voucherNo: string; amount: number } | { ok: false; error: string }> {
  const session = requireSession();
  const parsed = runningSettleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;
  await authorize(session, "vouchers", "create");

  try {
    return await withTenant(session.tenantId, async (tx) => {
      const pending = await tx.driverSettlement.findMany({
        where: { firmId: session.firmId, driverId: d.driverId, status: "PENDING", deletedAt: null },
        orderBy: { date: "asc" },
      });
      if (!pending.length) return { ok: false as const, error: "No pending balance to settle." };
      const net =
        Math.round(pending.reduce((s, r) => s + toNum(String(r.amount)), 0) * 100) / 100;
      if (net === 0) {
        // pluses and minuses cancel out — close all rows without money movement
        await tx.driverSettlement.updateMany({
          where: { id: { in: pending.map((p) => p.id) } },
          data: { status: "SETTLED", settledDate: new Date(`${d.date}T00:00:00`), voucherNo: "NET-0" },
        });
        revalidatePath(REVALIDATE);
        return { ok: true as const, voucherNo: "NET-0", amount: 0 };
      }

      const driver = await tx.driver.findFirst({ where: { id: d.driverId } });
      if (!driver?.partyId) return { ok: false as const, error: "Driver has no linked ledger party." };

      const pay = net > 0; // company pays driver
      const abs = Math.abs(net);
      const date = new Date(`${d.date}T00:00:00`);
      const voucherNo = await nextDocNumber(tx, {
        tenantId: session.tenantId,
        firmId: session.firmId,
        fyId: session.fyId,
        docType: pay ? "VOUCHER_PAYMENT" : "VOUCHER_RECEIPT",
      });
      const refNos = Array.from(new Set(pending.map((p) => p.tripRef).filter(Boolean))) as string[];
      const narration = `Driver running balance ${pay ? "paid to" : "received from"} ${driver.name} (${pending.length} entr${pending.length === 1 ? "y" : "ies"})${d.remarks ? " — " + d.remarks : ""}`;
      const voucher = await tx.voucher.create({
        data: {
          tenantId: session.tenantId,
          firmId: session.firmId,
          fyId: session.fyId,
          voucherNo,
          voucherDate: date,
          type: pay ? "PAYMENT" : "RECEIPT",
          entryType: d.paymentMode,
          moduleLink: "OTHERS",
          partyId: driver.partyId,
          bankPartyId: d.bankPartyId,
          amount: abs,
          netAmount: abs,
          remarks: narration,
          createdById: session.userId,
        },
      });
      const common = {
        date,
        refType: "VOUCHER",
        refId: voucher.id,
        // reference-number-based adjustment: carries every trip ref settled
        refNo: refNos.length ? refNos.join(", ") : voucherNo,
        narration,
      };
      await postLedger(tx, session, [
        { ...common, partyId: d.bankPartyId, side: pay ? "CREDIT" : "DEBIT", amount: abs },
        { ...common, partyId: driver.partyId, side: pay ? "DEBIT" : "CREDIT", amount: abs },
      ]);
      await tx.driverSettlement.updateMany({
        where: { id: { in: pending.map((p) => p.id) } },
        data: { status: "SETTLED", settledDate: date, voucherId: voucher.id, voucherNo },
      });
      await audit(tx, session, {
        entity: "DriverSettlement",
        entityId: d.driverId,
        action: "UPDATE",
        after: { runningSettle: { net, voucherNo, entries: pending.length } },
      });
      revalidatePath(REVALIDATE);
      revalidatePath("/accounts/vouchers/register");
      return { ok: true as const, voucherNo, amount: net };
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Settlement failed" };
  }
}
