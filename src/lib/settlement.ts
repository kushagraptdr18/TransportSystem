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
 * Everything a Payment Voucher can settle — freight documents, office bills and
 * salaries alike.
 */
export const ALL_PAYABLE_REF_TYPES: ModuleLink[] = [
  ...PAYABLE_REF_TYPES,
  "OFFICE_EXPENSE",
  "STAFF_PAYROLL",
  "VEHICLE_EXPENSE",
  "ADBLUE_PURCHASE",
  // a driver's trip balance is payable when the company owes him and receivable
  // when he owes the company, so it belongs to both lists — the sign on the
  // settlement row says which way this one goes
  "DRIVER_SETTLEMENT",
];
/** Everything a Receipt Voucher can settle. */
export const ALL_RECEIVABLE_REF_TYPES: ModuleLink[] = [
  ...BILL_REF_TYPES,
  "OFFICE_INCOME",
  // an advance is money the staff member owes back
  "STAFF_ADVANCE",
  "DRIVER_SETTLEMENT",
];

/**
 * A reference and everything that has happened to it. One shape for every
 * module, so a register, a voucher grid and a source document all read the same
 * figures rather than each deriving its own.
 */
export interface RefPosition {
  /** the document's value before anything was settled */
  original: number;
  /** settled from the source document's own screen, where it has one */
  ownSettled: number;
  paid: number;
  tds: number;
  deduction: number;
  otherAmt: number;
  roundOff: number;
  /** ownSettled + every voucher allocation, deductions included */
  settled: number;
  outstanding: number;
  status: SettlementStatus;
}

/**
 * Live position of any set of references, whatever the module.
 *
 * `ownSettled` covers documents that can also be settled where they were
 * entered — a salary marked paid on the payroll screen, a chalan paid from its
 * balance-payment block. Documents with no such path pass 0 and the allocations
 * are the whole story. Either way the caller must use this rather than a stored
 * balance column, which goes stale the moment a voucher is entered elsewhere.
 */
export async function refPositions(
  tx: Tx,
  opts: {
    firmId: string;
    fyId: string;
    refType: ModuleLink;
    docs: { id: string; original: number; ownSettled?: number }[];
    excludeVoucherId?: string | null;
  }
): Promise<Map<string, RefPosition>> {
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

  const zero = () => ({ paid: 0, tds: 0, deduction: 0, otherAmt: 0, roundOff: 0 });
  const byRef = new Map<string, ReturnType<typeof zero>>();
  for (const a of allocations) {
    const acc = byRef.get(a.refId) ?? zero();
    acc.paid = round2(acc.paid + Number(a.amount));
    acc.tds = round2(acc.tds + Number(a.tdsAmt));
    acc.deduction = round2(acc.deduction + Number(a.deduction));
    acc.otherAmt = round2(acc.otherAmt + Number(a.otherAmt));
    acc.roundOff = round2(acc.roundOff + Number(a.roundOff));
    byRef.set(a.refId, acc);
  }

  const out = new Map<string, RefPosition>();
  for (const d of opts.docs) {
    const v = byRef.get(d.id) ?? zero();
    const ownSettled = round2(d.ownSettled ?? 0);
    // every approved deduction settles the reference exactly like money moved —
    // an amount knocked off as TDS must never stay outstanding
    const settled = round2(
      ownSettled + v.paid + v.tds + v.deduction + v.otherAmt + v.roundOff
    );
    const outstanding = round2(d.original - settled);
    out.set(d.id, {
      original: d.original,
      ownSettled,
      ...v,
      settled,
      outstanding,
      status: settlementStatus(d.original, outstanding),
    });
  }
  return out;
}

/**
 * Amount settled per refId from live vouchers of this firm + FY.
 * Approved deductions (TDS / deduction) settle a document just like money
 * moved — an adjusted amount must never remain outstanding.
 *
 * Pass `fyId: null` to sum allocations across ALL financial years. Needed when
 * the pending documents themselves carry no FY filter (driver +/- settlement
 * rows): scoping the allocations to the session FY while the rows span years
 * made a row settled last year look unpaid this year — and payable twice.
 */
export async function settledByRef(
  tx: Tx,
  opts: { firmId: string; fyId: string | null; refTypes: ModuleLink[]; refIds?: string[] }
): Promise<Map<string, number>> {
  const allocations = await tx.voucherAllocation.findMany({
    where: {
      refType: { in: opts.refTypes },
      ...(opts.refIds ? { refId: { in: opts.refIds } } : {}),
      voucher: {
        deletedAt: null,
        firmId: opts.firmId,
        ...(opts.fyId ? { fyId: opts.fyId } : {}),
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

/**
 * Live remainder of a SIGNED document (driver +/- settlement) after voucher
 * allocations settled part of it. A positive row (company owes the driver)
 * shrinks toward 0 as payments allocate against it; a negative row (driver
 * owes the company) shrinks toward 0 as receipts do. It never crosses zero —
 * a voucher can settle a balance, not flip its direction.
 */
export function signedRemainder(amount: number, voucherSettled: number): number {
  return amount >= 0
    ? Math.max(0, round2(amount - voucherSettled))
    : Math.min(0, round2(amount + voucherSettled));
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
