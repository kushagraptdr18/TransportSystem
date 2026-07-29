import type { LedgerGroup, Prisma } from "@prisma/client";
import { withTenant } from "@/lib/db";
import { toNum } from "@/lib/utils";
import type { Session } from "@/lib/session";
import type { ReportRow } from "@/components/accounts/simple-report";

export interface BookParams {
  session: Session & { firmId: string; fyId: string };
  /** restrict to parties of these ledger groups (cash book / bank book) */
  groups?: LedgerGroup[];
  /** explicit party (ledger summary) */
  partyId?: string;
  /** explicit income/expense account head (ledger summary) */
  headId?: string;
  dateFrom?: string;
  dateTo?: string;
}

/**
 * Ledger entries as book rows (debit / credit / running balance).
 * A single selected party seeds the running total with its opening balance;
 * with a date filter, entries before the range are folded into the opening.
 * Income/Expense account heads are ledgers too — select one via headId.
 */
export async function ledgerBookRows(params: BookParams): Promise<{
  rows: ReportRow[];
  parties: { id: string; name: string; ledgerGroup: LedgerGroup }[];
  heads: { id: string; name: string; kind: string }[];
}> {
  const { session } = params;
  return withTenant(session.tenantId, async (tx) => {
    // Bank & Cash live in their own books (cash-book / bank-book) — keep them out
    // of the party ledger unless a book explicitly asks for those groups.
    const partyWhere: Prisma.PartyWhereInput = params.groups
      ? { ledgerGroup: { in: params.groups } }
      : { ledgerGroup: { notIn: ["BANK", "CASH"] } };
    const [parties, heads] = await Promise.all([
      tx.party.findMany({
        where: { ...partyWhere, isActive: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true, ledgerGroup: true, openingBalance: true, openingSide: true },
      }),
      tx.accountHead.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true, kind: true },
      }),
    ]);
    const partyIds = params.partyId ? [params.partyId] : parties.map((p) => p.id);

    const where: Prisma.LedgerEntryWhereInput = {
      firmId: session.firmId,
      fyId: session.fyId,
      ...(params.headId
        ? { accountHeadId: params.headId }
        : params.partyId || params.groups
          ? { partyId: { in: partyIds } }
          : // full ledger: keep unlinked entries, drop bank/cash-party entries
            { OR: [{ partyId: { in: partyIds } }, { partyId: null }] }),
    };
    if (params.dateFrom || params.dateTo) {
      where.date = {
        ...(params.dateFrom ? { gte: new Date(params.dateFrom + "T00:00:00") } : {}),
        ...(params.dateTo ? { lte: new Date(params.dateTo + "T23:59:59") } : {}),
      };
    }
    const entries = await tx.ledgerEntry.findMany({
      where,
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      take: 2000,
    });
    const nameById = new Map(parties.map((p) => [p.id, p.name]));
    const headNameById = new Map(heads.map((h) => [h.id, h.name]));

    const trackRunning = !!params.partyId || !!params.headId;
    let running = 0;
    if (params.partyId) {
      const p = parties.find((x) => x.id === params.partyId);
      if (p) {
        const opening = toNum(String(p.openingBalance));
        running = p.openingSide === "DEBIT" ? opening : -opening;
      }
    }
    // entries before the date filter belong in the opening balance
    if (trackRunning && params.dateFrom) {
      const prior = await tx.ledgerEntry.groupBy({
        by: ["side"],
        where: {
          firmId: session.firmId,
          fyId: session.fyId,
          ...(params.headId ? { accountHeadId: params.headId } : { partyId: params.partyId }),
          date: { lt: new Date(params.dateFrom + "T00:00:00") },
        },
        _sum: { amount: true },
      });
      for (const p of prior) {
        const sum = toNum(String(p._sum.amount ?? 0));
        running += p.side === "DEBIT" ? sum : -sum;
      }
    }

    const rows: ReportRow[] = entries.map((e) => {
      const amt = toNum(String(e.amount));
      const debit = e.side === "DEBIT" ? amt : 0;
      const credit = e.side === "CREDIT" ? amt : 0;
      if (trackRunning) running += debit - credit;
      return {
        date: e.date.toISOString(),
        party:
          (e.partyId && nameById.get(e.partyId)) ||
          (e.accountHeadId && headNameById.get(e.accountHeadId)) ||
          "",
        refType: e.refType,
        refNo: e.refNo,
        narration: e.narration ?? "",
        debit,
        credit,
        balance: trackRunning
          ? `${Math.abs(Math.round(running * 100) / 100).toLocaleString("en-IN")} ${running >= 0 ? "Dr" : "Cr"}`
          : "",
      };
    });
    return { rows, parties, heads };
  });
}

export const BOOK_COLUMNS = [
  { key: "date", header: "Date", kind: "date" as const },
  { key: "party", header: "Account" },
  { key: "refType", header: "Ref Type" },
  { key: "refNo", header: "Ref No" },
  { key: "narration", header: "Narration" },
  { key: "debit", header: "Debit", kind: "money" as const },
  { key: "credit", header: "Credit", kind: "money" as const },
  { key: "balance", header: "Balance" },
];
