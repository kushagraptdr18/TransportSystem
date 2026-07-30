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
