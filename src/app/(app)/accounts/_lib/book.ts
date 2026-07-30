import type { LedgerGroup, Prisma } from "@prisma/client";
import { withTenant } from "@/lib/db";
import { formatDate, toNum } from "@/lib/utils";
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
  /**
   * reference-wise tracking: show EVERY entry whose Reference No matches,
   * across all ledgers (original bill, receipts, payments, adjustments...)
   */
  refNo?: string;
  dateFrom?: string;
  dateTo?: string;
}

/**
 * Ledger entries as book rows (debit / credit / running balance).
 * A single selected party seeds the running total with its opening balance;
 * with a date filter, entries before the range are folded into the opening.
 * Income/Expense account heads are ledgers too — select one via headId.
 * Voucher / office-transaction rows are enriched with the voucher number and
 * payment details (bank/cash account, instrument no) without opening them.
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
    const [parties, allParties, heads] = await Promise.all([
      tx.party.findMany({
        where: { ...partyWhere, isActive: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true, ledgerGroup: true, openingBalance: true, openingSide: true },
      }),
      // full name map (incl. bank/cash) for account display + payment details
      tx.party.findMany({ select: { id: true, name: true } }),
      tx.accountHead.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true, kind: true },
      }),
    ]);
    const partyIds = params.partyId ? [params.partyId] : parties.map((p) => p.id);

    const where: Prisma.LedgerEntryWhereInput = {
      firmId: session.firmId,
      fyId: session.fyId,
      ...(params.refNo
        ? // reference-wise: every ledger the reference touched
          { refNo: { contains: params.refNo.trim(), mode: "insensitive" } }
        : params.headId
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
    const nameById = new Map(allParties.map((p) => [p.id, p.name]));
    const headNameById = new Map(heads.map((h) => [h.id, h.name]));

    // enrich voucher / office rows: voucher number + payment details
    const voucherIds = Array.from(
      new Set(entries.filter((e) => e.refType === "VOUCHER").map((e) => e.refId))
    );
    const officeIds = Array.from(
      new Set(entries.filter((e) => e.refType === "OFFICE_TXN").map((e) => e.refId))
    );
    const [vouchers, officeTxns] = await Promise.all([
      voucherIds.length
        ? tx.voucher.findMany({
            where: { id: { in: voucherIds } },
            select: {
              id: true,
              voucherNo: true,
              type: true,
              bankPartyId: true,
              chequeNo: true,
              chequeDate: true,
            },
          })
        : Promise.resolve([]),
      officeIds.length
        ? tx.officeTransaction.findMany({
            where: { id: { in: officeIds } },
            select: { id: true, voucherNo: true, paymentMode: true, bankPartyId: true },
          })
        : Promise.resolve([]),
    ]);
    const voucherById = new Map(vouchers.map((v) => [v.id, v]));
    const officeById = new Map(officeTxns.map((o) => [o.id, o]));

    const trackRunning = !params.refNo && (!!params.partyId || !!params.headId);
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

      let voucherNo = "";
      let payment = "";
      if (e.refType === "VOUCHER") {
        const v = voucherById.get(e.refId);
        if (v) {
          voucherNo = v.voucherNo;
          payment = [
            v.bankPartyId && nameById.get(v.bankPartyId),
            v.chequeNo && `No. ${v.chequeNo}`,
            v.chequeDate && formatDate(v.chequeDate.toISOString()),
          ]
            .filter(Boolean)
            .join(" | ");
        }
      } else if (e.refType === "OFFICE_TXN") {
        const o = officeById.get(e.refId);
        if (o) {
          voucherNo = o.voucherNo;
          payment = [
            o.bankPartyId && nameById.get(o.bankPartyId),
            o.paymentMode ?? "CREDIT",
          ]
            .filter(Boolean)
            .join(" | ");
        }
      }

      return {
        date: e.date.toISOString(),
        party:
          (e.partyId && nameById.get(e.partyId)) ||
          (e.accountHeadId && headNameById.get(e.accountHeadId)) ||
          "",
        refType: e.refType,
        refNo: e.refNo,
        voucherNo,
        payment,
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
  { key: "refNo", header: "Reference No" },
  { key: "voucherNo", header: "Voucher No" },
  { key: "payment", header: "Bank / Instrument" },
  { key: "narration", header: "Narration" },
  { key: "debit", header: "Debit", kind: "money" as const },
  { key: "credit", header: "Credit", kind: "money" as const },
  { key: "balance", header: "Balance" },
];
