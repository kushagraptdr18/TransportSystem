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
  dateFrom?: string;
  dateTo?: string;
}

/**
 * Ledger entries as book rows (debit / credit / running balance).
 * Opening balance of the party (if a single party is selected) seeds the running total.
 */
export async function ledgerBookRows(params: BookParams): Promise<{
  rows: ReportRow[];
  parties: { id: string; name: string; ledgerGroup: LedgerGroup }[];
}> {
  const { session } = params;
  return withTenant(session.tenantId, async (tx) => {
    const partyWhere: Prisma.PartyWhereInput = params.groups
      ? { ledgerGroup: { in: params.groups } }
      : {};
    const parties = await tx.party.findMany({
      where: { ...partyWhere, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, ledgerGroup: true, openingBalance: true, openingSide: true },
    });
    const partyIds = params.partyId
      ? [params.partyId]
      : params.groups
        ? parties.map((p) => p.id)
        : undefined;

    const where: Prisma.LedgerEntryWhereInput = {
      firmId: session.firmId,
      fyId: session.fyId,
      ...(partyIds ? { partyId: { in: partyIds } } : {}),
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

    let running = 0;
    if (params.partyId) {
      const p = parties.find((x) => x.id === params.partyId);
      if (p) {
        const opening = toNum(String(p.openingBalance));
        running = p.openingSide === "DEBIT" ? opening : -opening;
      }
    }
    const trackRunning = !!params.partyId;

    const rows: ReportRow[] = entries.map((e) => {
      const amt = toNum(String(e.amount));
      const debit = e.side === "DEBIT" ? amt : 0;
      const credit = e.side === "CREDIT" ? amt : 0;
      if (trackRunning) running += debit - credit;
      return {
        date: e.date.toISOString(),
        party: (e.partyId && nameById.get(e.partyId)) || "",
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
    return { rows, parties };
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
