import { Tx } from "./db";
import { Session } from "./session";
import { EntrySide } from "@prisma/client";
import { resolveHead } from "./account-heads";

export interface LedgerPostEntry {
  date: Date;
  partyId?: string | null;
  vehicleId?: string | null;
  accountHeadId?: string | null;
  side: EntrySide;
  amount: number;
  refType: string; // LR | CHALAN | INVOICE | VOUCHER | BROKER_SLIP | ...
  refId: string;
  refNo: string;
  narration?: string | null;
  /** override the session's firm/FY — e.g. re-posting a document that lives
   *  in another financial year must not re-stamp it into the session's */
  firmId?: string;
  fyId?: string;
}

/**
 * Post double-entry ledger rows for a document. Each entry becomes one
 * LedgerEntry with tenantId/firmId/fyId taken from the session. Callers are
 * responsible for supplying balanced debit/credit sides.
 */
export async function postLedger(
  tx: Tx,
  session: Session & { firmId: string; fyId: string },
  entries: LedgerPostEntry[]
): Promise<void> {
  const rows = entries
    .filter((e) => e.amount > 0)
    .map((e) => ({
      tenantId: session.tenantId,
      firmId: e.firmId ?? session.firmId,
      fyId: e.fyId ?? session.fyId,
      date: e.date,
      partyId: e.partyId ?? null,
      vehicleId: e.vehicleId ?? null,
      accountHeadId: e.accountHeadId ?? null,
      side: e.side,
      amount: e.amount,
      refType: e.refType,
      refId: e.refId,
      refNo: e.refNo,
      narration: e.narration ?? null,
    }));
  if (rows.length) await tx.ledgerEntry.createMany({ data: rows });
}

/**
 * Remove all ledger entries posted for a document (used before re-posting on
 * edit, and on delete).
 */
export async function reverseLedger(tx: Tx, refType: string, refId: string): Promise<void> {
  await tx.ledgerEntry.deleteMany({ where: { refType, refId } });
}

/**
 * Find-or-create an AccountHead by name so modules can post to a stable
 * income/expense ledger without requiring the user to set it up first.
 *
 * Names that belong to a common head (Detention, Commission, Round Off, ...)
 * are resolved to that one head first, so a module asking for "Detention
 * Charges" and one asking for "Detention Income" land in the SAME ledger and
 * the head's balance is the net position. See `src/lib/account-heads.ts`.
 */
export async function ensureAccountHead(
  tx: Tx,
  session: Session,
  name: string,
  kind: "INCOME" | "EXPENSE"
): Promise<string> {
  const head = resolveHead(name, kind);
  const existing = await tx.accountHead.findFirst({
    where: { tenantId: session.tenantId, name: head.name },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await tx.accountHead.create({
    data: { tenantId: session.tenantId, name: head.name, kind: head.kind },
  });
  return created.id;
}
