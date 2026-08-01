import type { Tx } from "./db";
import type { Session } from "./session";
import { round2 } from "./calc/tds";
import { ensureAccountHead, postLedger, reverseLedger, type LedgerPostEntry } from "./ledger";

/**
 * The shortage register — one place for every shortage in the system.
 *
 * A shortage is a document: it is RAISED against whoever is answerable and
 * carries its own outstanding, and every recovery links back to it. Before
 * this, shortage was a loose number on a chalan / broker slip / salary that was
 * netted off at save time, so "how much is still unrecovered" was unanswerable.
 *
 * ONE ledger head backs all of it: charged debits it (the company wears the
 * loss), recovered credits it, so the head's balance IS the net unrecovered
 * shortage across every module.
 */
export const SHORTAGE_HEAD = "Shortage";

/** Ledger refType for register postings. */
const SHORTAGE_REF = "SHORTAGE";

export type ShortageModule =
  | "CHALAN"
  | "BROKER_SLIP"
  | "DRIVER"
  | "VOUCHER"
  | "BILLING"
  | "MANUAL";
export type ShortagePartyKind = "DRIVER" | "OWNER" | "BROKER" | "PARTY";
export type RecoverySource = "DRIVER" | "OWNER" | "BROKER" | "PARTY" | "BANK";

async function shortageHeadId(tx: Tx, session: Session) {
  // EXPENSE: an unrecovered shortage is a cost the company carries
  return ensureAccountHead(tx, session, SHORTAGE_HEAD, "EXPENSE");
}

/**
 * Raise a shortage against a party or driver. Idempotent per source document:
 * re-saving the document replaces its entries rather than stacking new ones,
 * but recoveries already booked against them are preserved.
 */
export async function raiseShortage(
  tx: Tx,
  session: Session & { firmId: string; fyId: string },
  opts: {
    date: Date;
    module: ShortageModule;
    refId: string;
    refNo: string;
    partyKind: ShortagePartyKind;
    partyId?: string | null;
    driverId?: string | null;
    amount: number;
    remarks?: string | null;
  }
): Promise<string | null> {
  const amount = round2(opts.amount);
  if (amount <= 0.009) return null;

  // reuse the row this document raised before, so an edit adjusts rather than
  // duplicates — and so its recoveries stay attached
  const existing = await tx.shortageEntry.findFirst({
    where: {
      firmId: session.firmId,
      module: opts.module,
      refId: opts.refId,
      partyId: opts.partyId ?? null,
      driverId: opts.driverId ?? null,
      deletedAt: null,
    },
  });

  const data = {
    date: opts.date,
    module: opts.module,
    refId: opts.refId,
    refNo: opts.refNo,
    partyId: opts.partyId ?? null,
    driverId: opts.driverId ?? null,
    partyKind: opts.partyKind,
    amount,
    remarks: opts.remarks ?? null,
  };

  const id = existing
    ? (await tx.shortageEntry.update({ where: { id: existing.id }, data })).id
    : (
        await tx.shortageEntry.create({
          data: {
            tenantId: session.tenantId,
            firmId: session.firmId,
            fyId: session.fyId,
            createdById: session.userId,
            ...data,
          },
        })
      ).id;

  // the charge itself: shortage head debited, the answerable ledger credited
  await reverseLedger(tx, SHORTAGE_REF, id);
  const headId = await shortageHeadId(tx, session);
  const entries: LedgerPostEntry[] = [
    {
      date: opts.date,
      refType: SHORTAGE_REF,
      refId: id,
      refNo: opts.refNo,
      accountHeadId: headId,
      side: "DEBIT",
      amount,
      narration: `Shortage created — ${opts.module.replace(/_/g, " ").toLowerCase()} ${opts.refNo}`,
    },
  ];
  await postLedger(tx, session, entries);
  return id;
}

/**
 * Record a recovery and attach it to open shortages of the same party, oldest
 * first. Anything left over raises a self-settled entry, so a module that nets
 * a shortage at save time (chalan, broker slip) still lands in the register
 * with a complete audit trail and nothing is silently lost.
 */
export async function recoverShortage(
  tx: Tx,
  session: Session & { firmId: string; fyId: string },
  opts: {
    date: Date;
    module: ShortageModule;
    refId: string;
    refNo: string;
    source: RecoverySource;
    partyId?: string | null;
    driverId?: string | null;
    partyKind: ShortagePartyKind;
    amount: number;
    remarks?: string | null;
    /** restrict matching to one shortage entry instead of FIFO */
    shortageId?: string | null;
  }
): Promise<number> {
  const amount = round2(opts.amount);
  if (amount <= 0.009) return 0;

  // this document's previous recoveries are released first, so an edit never
  // double-counts against the same shortage
  await releaseShortageRecoveries(tx, opts.module, opts.refId);

  // Match this party's own open shortages first, then fall back to any open
  // shortage in the firm — a shortage raised on one document is routinely
  // recovered from a different party (driver, then owner, then broker), which
  // is the whole point of one register.
  const open = opts.shortageId
    ? await tx.shortageEntry.findMany({ where: { id: opts.shortageId, deletedAt: null } })
    : await (async () => {
        const mine = await tx.shortageEntry.findMany({
          where: {
            firmId: session.firmId,
            deletedAt: null,
            ...(opts.driverId
              ? { driverId: opts.driverId }
              : opts.partyId
                ? { partyId: opts.partyId }
                : {}),
          },
          orderBy: { date: "asc" },
        });
        const others = await tx.shortageEntry.findMany({
          where: {
            firmId: session.firmId,
            deletedAt: null,
            id: { notIn: mine.map((m) => m.id) },
          },
          orderBy: { date: "asc" },
        });
        return [...mine, ...others];
      })();

  let left = amount;
  for (const s of open) {
    if (left <= 0.009) break;
    const pending = round2(Number(s.amount) - Number(s.recoveredAmount));
    if (pending <= 0.009) continue;
    const take = round2(Math.min(pending, left));
    left = round2(left - take);
    await tx.shortageEntry.update({
      where: { id: s.id },
      data: { recoveredAmount: { increment: take } },
    });
    await tx.shortageRecovery.create({
      data: {
        tenantId: session.tenantId,
        shortageId: s.id,
        date: opts.date,
        module: opts.module,
        refId: opts.refId,
        refNo: opts.refNo,
        source: opts.source,
        amount: take,
        remarks: opts.remarks ?? null,
      },
    });
  }

  // nothing open to match: the document is raising and recovering in one step
  if (left > 0.009) {
    const raisedId = await raiseShortage(tx, session, {
      date: opts.date,
      module: opts.module,
      refId: opts.refId,
      refNo: opts.refNo,
      partyKind: opts.partyKind,
      partyId: opts.partyId,
      driverId: opts.driverId,
      amount: left,
      remarks: opts.remarks,
    });
    if (raisedId) {
      await tx.shortageEntry.update({
        where: { id: raisedId },
        data: { recoveredAmount: { increment: left } },
      });
      await tx.shortageRecovery.create({
        data: {
          tenantId: session.tenantId,
          shortageId: raisedId,
          date: opts.date,
          module: opts.module,
          refId: opts.refId,
          refNo: opts.refNo,
          source: opts.source,
          amount: left,
          remarks: opts.remarks ?? null,
        },
      });
    }
  }

  // the recovery leg: shortage head credited, whoever paid it debited by the
  // calling module's own posting (the module owns the party side)
  await reverseLedger(tx, `${SHORTAGE_REF}_REC`, opts.refId);
  const headId = await shortageHeadId(tx, session);
  await postLedger(tx, session, [
    {
      date: opts.date,
      refType: `${SHORTAGE_REF}_REC`,
      refId: opts.refId,
      refNo: opts.refNo,
      accountHeadId: headId,
      side: "CREDIT",
      amount,
      narration: `Shortage recovered from ${opts.source.toLowerCase()} — ${opts.module
        .replace(/_/g, " ")
        .toLowerCase()} ${opts.refNo}`,
    },
  ]);
  return amount;
}

/** Undo every recovery a document booked (used before re-recording, and on delete). */
export async function releaseShortageRecoveries(
  tx: Tx,
  module: ShortageModule,
  refId: string
): Promise<void> {
  const rows = await tx.shortageRecovery.findMany({ where: { module, refId } });
  for (const r of rows) {
    await tx.shortageEntry.update({
      where: { id: r.shortageId },
      data: { recoveredAmount: { decrement: r.amount } },
    });
  }
  if (rows.length) await tx.shortageRecovery.deleteMany({ where: { module, refId } });
}

/** Full teardown for a deleted source document: its raises AND its recoveries. */
export async function releaseShortage(
  tx: Tx,
  module: ShortageModule,
  refId: string
): Promise<void> {
  await releaseShortageRecoveries(tx, module, refId);
  await reverseLedger(tx, `${SHORTAGE_REF}_REC`, refId);
  const raised = await tx.shortageEntry.findMany({ where: { module, refId, deletedAt: null } });
  for (const s of raised) {
    await reverseLedger(tx, SHORTAGE_REF, s.id);
    await tx.shortageEntry.update({ where: { id: s.id }, data: { deletedAt: new Date() } });
  }
}

export function shortageStatus(amount: number, recovered: number): string {
  const pending = round2(amount - recovered);
  if (pending <= 0.009) return "RECOVERED";
  return recovered > 0.009 ? "PARTLY RECOVERED" : "OPEN";
}
