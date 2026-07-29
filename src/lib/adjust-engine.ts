import { Tx } from "./db";
import { Session } from "./session";
import { round2 } from "./calc/tds";
import type { LedgerPostEntry } from "./ledger";

/**
 * Central Reference-Based Adjustment Engine — shared by Receipt, Payment and
 * Journal vouchers. One validation + posting logic for every deduction /
 * adjustment: each line automatically posts to its own adjustment ledger head
 * (auto-created in the Account Head master) with the reference recorded, so
 * adjusted amounts never remain outstanding and history is never edited —
 * corrections are always NEW vouchers linked to the original reference.
 */

export const ADJUSTMENT_TYPES = [
  "TDS",
  "SHORTAGE",
  "DAMAGE",
  "PENALTY",
  "RATE_DIFFERENCE",
  "CLAIM",
  "DISCOUNT",
  "ADVANCE_ADJUSTMENT",
  "SECURITY_DEPOSIT",
  "DEBIT_NOTE",
  "CREDIT_NOTE",
  "LOAN_ADJUSTMENT",
  "BROKER_ADJUSTMENT",
  "SUPPLIER_ADJUSTMENT",
  "STAFF_ADJUSTMENT",
  "VEHICLE_ADJUSTMENT",
  "EXPENSE_ADJUSTMENT",
  "OTHER",
] as const;
export type AdjustmentType = (typeof ADJUSTMENT_TYPES)[number];

export const REFERENCE_TYPES = [
  "BILL",
  "INVOICE",
  "LR",
  "CHALLAN",
  "ADVANCE",
  "LOAN",
  "BROKER",
  "SUPPLIER",
  "STAFF",
  "VEHICLE",
  "EXPENSE",
  "DEBIT_NOTE",
  "CREDIT_NOTE",
  "JOURNAL_VOUCHER",
  "ADJUSTMENT_VOUCHER",
  "OTHER",
] as const;
export type ReferenceType = (typeof REFERENCE_TYPES)[number];

export const adjustmentLabel = (t: string) =>
  t
    .split("_")
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");

export interface AdjustmentLine {
  adjustmentType: string;
  referenceType: string;
  referenceNo: string;
  referenceDate?: string | null; // ISO
  amount: number;
  remarks?: string | null;
}

export const adjustmentsTotal = (lines: AdjustmentLine[]): number =>
  round2(lines.reduce((s, l) => s + (l.amount || 0), 0));

/**
 * Ensure a ledger head exists for an adjustment type (auto-created once in the
 * Account Head master — new types added there work without any code change).
 */
export async function ensureAdjustmentHead(
  tx: Tx,
  tenantId: string,
  adjustmentType: string
): Promise<string> {
  const name = adjustmentLabel(adjustmentType).toUpperCase();
  const head = await tx.accountHead.upsert({
    where: { tenantId_name: { tenantId, name } },
    create: { tenantId, name, kind: "ADJUSTMENT" },
    update: {},
  });
  return head.id;
}

/**
 * Build the balanced ledger entries for a voucher's adjustment lines.
 *
 * Direction follows the money: on a PAYMENT the party is debited GROSS while
 * each deduction is CREDITED to its adjustment head (net goes out of bank);
 * on a RECEIPT the party is credited GROSS while each deduction is DEBITED to
 * its head (net comes into bank). JOURNAL follows the receipt orientation of
 * its credit side. Every entry carries the adjustment's own reference in the
 * narration for the audit trail.
 */
export function adjustmentLedgerEntries(args: {
  voucherType: "RECEIPT" | "PAYMENT" | "CONTRA" | "JOURNAL";
  common: { date: Date; refType: string; refId: string; refNo: string };
  lines: { line: AdjustmentLine; accountHeadId: string }[];
}): LedgerPostEntry[] {
  // side opposite to the party's gross entry (same side as the bank/cash leg)
  const side = args.voucherType === "PAYMENT" || args.voucherType === "JOURNAL" ? "CREDIT" : "DEBIT";
  return args.lines
    .filter(({ line }) => (line.amount || 0) > 0)
    .map(({ line, accountHeadId }) => ({
      ...args.common,
      accountHeadId,
      side,
      amount: round2(line.amount),
      narration: `${adjustmentLabel(line.adjustmentType)} against ${adjustmentLabel(line.referenceType)} ${line.referenceNo}${line.remarks ? " — " + line.remarks : ""}`,
    }));
}

/** Persist adjustment lines and post their ledger entries. Returns the total. */
export async function applyAdjustments(
  tx: Tx,
  session: Session & { firmId: string; fyId: string },
  args: {
    voucherId: string;
    voucherNo: string;
    voucherType: "RECEIPT" | "PAYMENT" | "CONTRA" | "JOURNAL";
    voucherDate: Date;
    lines: AdjustmentLine[];
  }
): Promise<{ total: number; entries: LedgerPostEntry[] }> {
  const lines = args.lines.filter((l) => (l.amount || 0) > 0);
  // replace (edits re-post; deletes cascade with the voucher)
  await tx.voucherAdjustment.deleteMany({ where: { voucherId: args.voucherId } });
  const withHeads: { line: AdjustmentLine; accountHeadId: string }[] = [];
  for (const line of lines) {
    const accountHeadId = await ensureAdjustmentHead(tx, session.tenantId, line.adjustmentType);
    withHeads.push({ line, accountHeadId });
    await tx.voucherAdjustment.create({
      data: {
        tenantId: session.tenantId,
        voucherId: args.voucherId,
        adjustmentType: line.adjustmentType,
        referenceType: line.referenceType,
        referenceNo: line.referenceNo,
        referenceDate: line.referenceDate ? new Date(line.referenceDate + "T00:00:00") : null,
        amount: round2(line.amount),
        remarks: line.remarks || null,
        accountHeadId,
      },
    });
  }
  const entries = adjustmentLedgerEntries({
    voucherType: args.voucherType,
    common: {
      date: args.voucherDate,
      refType: "VOUCHER",
      refId: args.voucherId,
      refNo: args.voucherNo,
    },
    lines: withHeads,
  });
  return { total: adjustmentsTotal(lines), entries };
}
