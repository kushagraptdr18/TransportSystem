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
    select: { refId: true, amount: true, tdsAmt: true, deduction: true },
  });
  const map = new Map<string, number>();
  for (const a of allocations) {
    const settled = Number(a.amount) + Number(a.tdsAmt) + Number(a.deduction);
    map.set(a.refId, round2((map.get(a.refId) ?? 0) + settled));
  }
  return map;
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
