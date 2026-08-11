import type { Tx } from "./db";
import { round2 } from "./calc/tds";

/**
 * Party advance consumption helpers. Advances are created automatically by
 * receipt vouchers (unallocated remainder / over-payment); bills consume them
 * FIFO via PartyAdvanceUse links so edits and deletes can restore cleanly.
 */

/** Release everything a document consumed (used before re-consume / delete). */
export async function restoreAdvanceUses(tx: Tx, refType: string, refId: string): Promise<void> {
  const uses = await tx.partyAdvanceUse.findMany({ where: { refType, refId } });
  for (const u of uses) {
    await tx.partyAdvance.update({
      where: { id: u.advanceId },
      data: { consumedAmount: { decrement: u.amount } },
    });
  }
  if (uses.length) await tx.partyAdvanceUse.deleteMany({ where: { refType, refId } });
}

/**
 * Guarded, concurrency-safe consumption: the increment applies only while the
 * advance still has that much open — two simultaneous documents racing for the
 * same balance cannot push consumedAmount past amount (the SQL condition is
 * evaluated atomically on the row). Returns false when the balance was gone.
 */
async function consumeAtomically(tx: Tx, advanceId: string, take: number): Promise<boolean> {
  const updated = await tx.$executeRaw`
    UPDATE "PartyAdvance"
    SET "consumedAmount" = "consumedAmount" + ${take}
    WHERE "id" = ${advanceId}
      AND "deletedAt" IS NULL
      AND "consumedAmount" + ${take} <= "amount" + 0.009`;
  return updated > 0;
}

/** FIFO-consume up to `amount` from a party's open advances; returns consumed. */
export async function consumeAdvances(
  tx: Tx,
  opts: {
    tenantId: string;
    firmId: string;
    /** advances never cross a financial year without an explicit carry-forward */
    fyId?: string;
    partyId: string;
    amount: number;
    refType: string;
    refId: string;
    refNo: string;
    /** RECEIVED = consumable by receivable bills; PAID = by payable docs */
    kind?: "RECEIVED" | "PAID";
  }
): Promise<number> {
  if (opts.amount <= 0) return 0;
  const advances = await tx.partyAdvance.findMany({
    where: {
      firmId: opts.firmId,
      ...(opts.fyId ? { fyId: opts.fyId } : {}),
      partyId: opts.partyId,
      kind: opts.kind ?? "RECEIVED",
      deletedAt: null,
    },
    orderBy: { date: "asc" },
  });
  let left = opts.amount;
  let consumed = 0;
  for (const adv of advances) {
    if (left <= 0.009) break;
    const open = round2(Number(adv.amount) - Number(adv.consumedAmount));
    if (open <= 0) continue;
    const take = round2(Math.min(open, left));
    // a concurrent transaction may have eaten this balance between the read
    // and now — the guarded update simply skips to the next advance then
    if (!(await consumeAtomically(tx, adv.id, take))) continue;
    left = round2(left - take);
    consumed = round2(consumed + take);
    await tx.partyAdvanceUse.create({
      data: {
        tenantId: opts.tenantId,
        advanceId: adv.id,
        refType: opts.refType,
        refId: opts.refId,
        refNo: opts.refNo,
        amount: take,
      },
    });
  }
  return consumed;
}

export type OpenAdvance = {
  id: string;
  voucherId: string | null;
  voucherNo: string;
  date: string;
  kind: string;
  amount: number;
  consumed: number;
  available: number;
  remarks: string | null;
};

/**
 * Advances of a party with live balances, for manual voucher-wise adjustment.
 * `includeRefType`/`includeRefId` add back what THAT document already consumed,
 * so editing a saved document shows what it may still claim rather than a
 * balance its own earlier save has already eaten.
 */
export async function listOpenAdvances(
  tx: Tx,
  opts: {
    firmId: string;
    /** advances never cross a financial year without an explicit carry-forward */
    fyId?: string;
    partyId: string;
    kinds?: string[];
    /** e.g. CHALAN_CANCEL advances have their own recovery flow */
    excludeSources?: string[];
    includeRefType?: string | string[];
    includeRefId?: string;
  }
): Promise<OpenAdvance[]> {
  const advances = await tx.partyAdvance.findMany({
    where: {
      firmId: opts.firmId,
      ...(opts.fyId ? { fyId: opts.fyId } : {}),
      partyId: opts.partyId,
      deletedAt: null,
      ...(opts.kinds ? { kind: { in: opts.kinds } } : {}),
      ...(opts.excludeSources ? { source: { notIn: opts.excludeSources } } : {}),
    },
    orderBy: { date: "asc" },
    include: { uses: true },
  });
  const refTypes = opts.includeRefType
    ? Array.isArray(opts.includeRefType)
      ? opts.includeRefType
      : [opts.includeRefType]
    : [];
  return advances
    .map((a) => {
      const consumed = round2(Number(a.consumedAmount));
      const mine = opts.includeRefId
        ? round2(
            a.uses
              .filter((u) => u.refId === opts.includeRefId && refTypes.includes(u.refType))
              .reduce((s, u) => s + Number(u.amount), 0)
          )
        : 0;
      return {
        id: a.id,
        voucherId: a.voucherId,
        voucherNo: a.voucherNo ?? "—",
        date: a.date.toISOString().slice(0, 10),
        kind: a.kind,
        amount: round2(Number(a.amount)),
        consumed,
        available: round2(Number(a.amount) - consumed + mine),
        remarks: a.remarks,
      };
    })
    .filter((a) => a.available > 0.009);
}

/**
 * Manual, caller-specified allocation across advances. Releases whatever this
 * document consumed before, then re-applies the given lines, validating each
 * against the advance's live open balance inside the same transaction.
 */
export async function applyManualAdvanceUses(
  tx: Tx,
  opts: {
    tenantId: string;
    firmId: string;
    /** advances never cross a financial year without an explicit carry-forward */
    fyId?: string;
    partyId: string;
    refType: string;
    refId: string;
    refNo: string;
    date?: Date;
    /** restrict which advance directions this document may consume */
    kinds?: string[];
    lines: { advanceId: string; amount: number }[];
  }
): Promise<{ advanceId: string; voucherNo: string; amount: number }[]> {
  await restoreAdvanceUses(tx, opts.refType, opts.refId);
  const out: { advanceId: string; voucherNo: string; amount: number }[] = [];
  // merge duplicate lines so the same voucher can't be listed twice
  const merged = new Map<string, number>();
  for (const l of opts.lines) {
    const amt = round2(l.amount);
    if (amt <= 0.009) continue;
    if (amt < 0) throw new Error("Adjustment amount cannot be negative");
    merged.set(l.advanceId, round2((merged.get(l.advanceId) ?? 0) + amt));
  }
  for (const [advanceId, amount] of Array.from(merged.entries())) {
    const adv = await tx.partyAdvance.findFirst({
      where: {
        id: advanceId,
        firmId: opts.firmId,
        ...(opts.fyId ? { fyId: opts.fyId } : {}),
        partyId: opts.partyId,
        deletedAt: null,
      },
    });
    if (!adv) throw new Error("Advance voucher not found for this party in this financial year");
    if (opts.kinds && !opts.kinds.includes(adv.kind)) {
      throw new Error(
        `Voucher ${adv.voucherNo ?? advanceId} is an advance ${adv.kind.toLowerCase()} and cannot be adjusted here`
      );
    }
    const open = round2(Number(adv.amount) - Number(adv.consumedAmount));
    if (amount > open + 0.009) {
      throw new Error(
        `Adjustment ${amount} exceeds available balance ${open} of voucher ${adv.voucherNo ?? advanceId}`
      );
    }
    // guarded increment: a concurrent voucher racing for the same balance
    // makes this fail instead of over-consuming
    if (!(await consumeAtomically(tx, advanceId, amount))) {
      throw new Error(
        `Advance ${adv.voucherNo ?? advanceId} no longer has ${amount} available — it was just consumed elsewhere. Refresh and retry.`
      );
    }
    await tx.partyAdvanceUse.create({
      data: {
        tenantId: opts.tenantId,
        advanceId,
        refType: opts.refType,
        refId: opts.refId,
        refNo: opts.refNo,
        amount,
        ...(opts.date ? { date: opts.date } : {}),
      },
    });
    out.push({ advanceId, voucherNo: adv.voucherNo ?? "—", amount });
  }
  return out;
}

/** Open advance balance of a party (by direction). */
export async function partyAdvanceBalance(
  tx: Tx,
  firmId: string,
  partyId: string,
  kind: "RECEIVED" | "PAID" = "RECEIVED",
  fyId?: string
): Promise<number> {
  const advances = await tx.partyAdvance.findMany({
    where: { firmId, partyId, kind, deletedAt: null, ...(fyId ? { fyId } : {}) },
    select: { amount: true, consumedAmount: true },
  });
  return round2(
    advances.reduce((s, a) => s + Number(a.amount) - Number(a.consumedAmount), 0)
  );
}
