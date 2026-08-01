import type { ModuleLink } from "@prisma/client";
import type { Tx } from "./db";
import { round2 } from "./calc/tds";

/**
 * Live settlement of documents from voucher allocations.
 *
 * Bill totals are NOT stored as they are settled — `Invoice.balance` is frozen
 * at bill-creation time (grandTotal - advance). The truth is the sum of live
 * `VoucherAllocation` rows, so every "is this paid?" question must be answered
 * here rather than from a stored column that goes stale the moment a receipt
 * is entered. Same contract as the Outstanding / Payables registers.
 */

export type SettlementStatus = "PAID" | "PARTLY PAID" | "UNPAID";

/** Reference types that settle a customer bill. */
export const BILL_REF_TYPES: ModuleLink[] = ["BILLING", "GST_BILLING"];
/** Reference types that settle an owner/broker document. */
export const PAYABLE_REF_TYPES: ModuleLink[] = ["BROKER_ENTRY", "FREIGHT_CHALLAN", "LORRY_HIRE"];

/**
 * Amount settled per refId from live vouchers of this firm + FY.
 * Approved deductions (TDS / deduction) settle a document just like money
 * moved — an adjusted amount must never remain outstanding.
 */
export async function settledByRef(
  tx: Tx,
  opts: { firmId: string; fyId: string; refTypes: ModuleLink[]; refIds?: string[] }
): Promise<Map<string, number>> {
  const allocations = await tx.voucherAllocation.findMany({
    where: {
      refType: { in: opts.refTypes },
      ...(opts.refIds ? { refId: { in: opts.refIds } } : {}),
      voucher: { deletedAt: null, firmId: opts.firmId, fyId: opts.fyId },
    },
    select: {
      refId: true,
      amount: true,
      tdsAmt: true,
      deduction: true,
      otherAmt: true,
      roundOff: true,
    },
  });
  const map = new Map<string, number>();
  for (const a of allocations) {
    const settled =
      Number(a.amount) +
      Number(a.tdsAmt) +
      Number(a.deduction) +
      Number(a.otherAmt) +
      Number(a.roundOff);
    map.set(a.refId, round2((map.get(a.refId) ?? 0) + settled));
  }
  return map;
}

/**
 * Payable documents (chalan / broker-slip owner side) can be settled two ways:
 * from the document's own balance-payment screen, or by allocating a Payment
 * Voucher against it. Each path was blind to the other, so a document paid one
 * way still showed fully outstanding in the other. Both are summed here, and
 * every consumer must use this rather than the document's stored balance.
 */
export interface PayableDoc {
  id: string;
  /** payable before any settlement */
  balance: number;
  /** settled from the document's own balance-payment screen */
  ownPaid: number;
  ownShortage: number;
  ownRoundOff: number;
  /** advance vouchers adjusted against it there */
  ownAdvanceAdjusted?: number;
}

export interface PayablePosition {
  balance: number;
  ownSettled: number;
  voucherSettled: number;
  /** voucher-side breakdown, so the document can show the same figures */
  voucherPaid: number;
  voucherTds: number;
  voucherShortage: number;
  voucherOther: number;
  voucherRoundOff: number;
  settled: number;
  outstanding: number;
  status: SettlementStatus;
}

export async function payableSettlement(
  tx: Tx,
  opts: {
    firmId: string;
    fyId: string;
    refType: ModuleLink;
    docs: PayableDoc[];
    excludeVoucherId?: string | null;
  }
): Promise<Map<string, PayablePosition>> {
  const ids = opts.docs.map((d) => d.id);
  const allocations = ids.length
    ? await tx.voucherAllocation.findMany({
        where: {
          refType: opts.refType,
          refId: { in: ids },
          voucher: {
            deletedAt: null,
            firmId: opts.firmId,
            fyId: opts.fyId,
            ...(opts.excludeVoucherId ? { id: { not: opts.excludeVoucherId } } : {}),
          },
        },
        select: {
          refId: true,
          amount: true,
          tdsAmt: true,
          deduction: true,
          otherAmt: true,
          roundOff: true,
        },
      })
    : [];
  const zero = () => ({ paid: 0, tds: 0, shortage: 0, other: 0, roundOff: 0 });
  const byRef = new Map<string, ReturnType<typeof zero>>();
  for (const a of allocations) {
    const acc = byRef.get(a.refId) ?? zero();
    // money paid plus every approved deduction settles the payable
    acc.paid = round2(acc.paid + Number(a.amount));
    acc.tds = round2(acc.tds + Number(a.tdsAmt));
    acc.shortage = round2(acc.shortage + Number(a.deduction));
    acc.other = round2(acc.other + Number(a.otherAmt));
    acc.roundOff = round2(acc.roundOff + Number(a.roundOff));
    byRef.set(a.refId, acc);
  }
  const out = new Map<string, PayablePosition>();
  for (const d of opts.docs) {
    const ownSettled = round2(
      d.ownPaid + d.ownShortage + d.ownRoundOff + (d.ownAdvanceAdjusted ?? 0)
    );
    const v = byRef.get(d.id) ?? zero();
    const voucherSettled = round2(v.paid + v.tds + v.shortage + v.other + v.roundOff);
    const settled = round2(ownSettled + voucherSettled);
    const outstanding = round2(d.balance - settled);
    out.set(d.id, {
      balance: d.balance,
      ownSettled,
      voucherSettled,
      voucherPaid: v.paid,
      voucherTds: v.tds,
      voucherShortage: v.shortage,
      voucherOther: v.other,
      voucherRoundOff: v.roundOff,
      settled,
      outstanding,
      status: settlementStatus(d.balance, outstanding),
    });
  }
  return out;
}

export function settlementStatus(total: number, outstanding: number): SettlementStatus {
  if (outstanding <= 0.009) return "PAID";
  return outstanding < total - 0.009 ? "PARTLY PAID" : "UNPAID";
}

/**
 * Live payment position of customer bills, keyed by invoice id.
 * `advance` on the invoice counts as received alongside the allocations.
 */
export async function invoiceSettlement(
  tx: Tx,
  opts: { firmId: string; fyId: string; invoices: { id: string; netTotal: unknown; advance: unknown }[] }
): Promise<Map<string, { net: number; received: number; outstanding: number; status: SettlementStatus }>> {
  const ids = opts.invoices.map((i) => i.id);
  const settled = ids.length
    ? await settledByRef(tx, {
        firmId: opts.firmId,
        fyId: opts.fyId,
        refTypes: BILL_REF_TYPES,
        refIds: ids,
      })
    : new Map<string, number>();
  const out = new Map<
    string,
    { net: number; received: number; outstanding: number; status: SettlementStatus }
  >();
  for (const i of opts.invoices) {
    const net = round2(Number(i.netTotal));
    const received = round2((settled.get(i.id) ?? 0) + Number(i.advance));
    const outstanding = round2(net - received);
    out.set(i.id, { net, received, outstanding, status: settlementStatus(net, outstanding) });
  }
  return out;
}
