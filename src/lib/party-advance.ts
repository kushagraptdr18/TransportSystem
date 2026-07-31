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

/** FIFO-consume up to `amount` from a party's open advances; returns consumed. */
export async function consumeAdvances(
  tx: Tx,
  opts: {
    tenantId: string;
    firmId: string;
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
    left = round2(left - take);
    consumed = round2(consumed + take);
    await tx.partyAdvance.update({
      where: { id: adv.id },
      data: { consumedAmount: { increment: take } },
    });
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

/** Open advance balance of a party (by direction). */
export async function partyAdvanceBalance(
  tx: Tx,
  firmId: string,
  partyId: string,
  kind: "RECEIVED" | "PAID" = "RECEIVED"
): Promise<number> {
  const advances = await tx.partyAdvance.findMany({
    where: { firmId, partyId, kind, deletedAt: null },
    select: { amount: true, consumedAmount: true },
  });
  return round2(
    advances.reduce((s, a) => s + Number(a.amount) - Number(a.consumedAmount), 0)
  );
}
