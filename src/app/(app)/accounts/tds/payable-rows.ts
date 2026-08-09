import type { Tx } from "@/lib/db";
import { toNum } from "@/lib/utils";
import { round2 } from "@/lib/calc/tds";

/** So a nil deduction reads as a deliberate outcome, not a missing row. */
export const tdsStatus = (amt: number) => (amt > 0.009 ? "DEDUCTED" : "NOT DEDUCTED");

/**
 * One PAYABLE TDS transaction row. `baseAmt` is the amount the TDS was
 * actually computed on, as recorded at entry (chalan/slip amount, or the
 * allocation's bill amount on a payment voucher) — never re-derived from the
 * gross invoice. Rows with no recorded base (journal adjustments, header-only
 * voucher TDS) carry 0 so no figure is ever invented.
 */
export type TdsPayableRow = {
  date: string; // ISO
  module: string;
  section: string;
  party: string;
  pan: string;
  refNo: string;
  invoiceAmount: number | null;
  baseAmt: number;
  tdsPct: number;
  tdsAmt: number;
  net: number | null;
  status: string;
  remarks: string;
};

/**
 * TDS PAYABLE rows — TDS OUR company deducts while MAKING payments.
 * Sources: Chalan (owner payment side), Broker Slip (owner payment side),
 * PAYMENT vouchers, and JOURNAL vouchers that touch the TDS Payable ledger.
 * Receipt vouchers and everything receivable-side NEVER appear here.
 *
 * This is THE row source for the TDS Payable Register and the quarterly
 * report alike — both must call it rather than re-deriving, so they can
 * never disagree.
 *
 * Journal rows are derived live from the LEDGER entries posted against the
 * common "TDS Payable" head — the same entries an edit re-posts and a delete
 * removes — so the register and the ledger can never disagree and no
 * duplicate tracking is needed. A credit raises the liability (TDS deducted
 * via journal); a debit reduces it and shows as a negative amount.
 */
export async function buildTdsPayableRows(
  tx: Tx,
  session: { firmId: string; fyId: string },
  dateWhere?: { gte?: Date; lte?: Date }
): Promise<{
  rows: TdsPayableRow[];
  parties: { id: string; name: string; pan: string | null }[];
  sectionCodes: string[];
}> {
  const scope = { firmId: session.firmId, fyId: session.fyId, deletedAt: null };
  // TDS applies only to hired vehicles. A company-owned vehicle is our own
  // asset — there is no payee to deduct from, so it never belongs here.
  const ownVehicleIds = (
    await tx.vehicle.findMany({
      where: { ownershipType: "OWNER" },
      select: { id: true },
    })
  ).map((v) => v.id);
  const notOwnVehicle = ownVehicleIds.length
    ? { vehicleId: { notIn: ownVehicleIds } }
    : {};

  const [payVouchers, chalans, slips, parties] = await Promise.all([
    // PAYMENT vouchers only — receipts must never appear in TDS Payable
    tx.voucher.findMany({
      where: {
        ...scope,
        type: "PAYMENT",
        ...(dateWhere ? { voucherDate: dateWhere } : {}),
        // a voucher against a company-owned vehicle is out too; one with no
        // vehicle at all cannot be ruled out, so it stays
        ...(ownVehicleIds.length
          ? { OR: [{ vehicleId: null }, { vehicleId: { notIn: ownVehicleIds } }] }
          : {}),
        AND: [
          { OR: [{ tdsAmt: { gt: 0 } }, { allocations: { some: { tdsAmt: { gt: 0 } } } }] },
        ],
      },
      include: { allocations: true },
    }),
    // Every TDS-ELIGIBLE chalan and broker slip, deducted or not. Filtering
    // on tdsAmt > 0 hid the zero-TDS ones, so there was no way to tell a
    // deliberate nil deduction from one that had simply been missed.
    tx.chalan.findMany({
      // cancelled chalans owe nothing, so no TDS arises on them
      where: { ...scope, cancelledAt: null, ...notOwnVehicle, ...(dateWhere ? { chalanDate: dateWhere } : {}) },
    }),
    tx.brokerSlip.findMany({
      where: {
        ...scope,
        ...notOwnVehicle,
        ...(dateWhere ? { slipDate: dateWhere } : {}),
        // only slips that actually have an owner side to deduct against
        OR: [{ ownerId: { not: null } }, { vNetAmt: { gt: 0 } }],
      },
    }),
    tx.party.findMany({ select: { id: true, name: true, pan: true } }),
  ]);
  const partyById = new Map(parties.map((p) => [p.id, p]));

  // section labels come ONLY from the TDS Master's freight-module ticks —
  // chalan, broker slip and hire references. Everything else stays blank
  // (no head-based guessing).
  const tdsSections = await tx.tdsSection.findMany({ where: { deletedAt: null } });
  const moduleSection = new Map<string, string>();
  for (const s of tdsSections) for (const m of s.moduleRefs) moduleSection.set(m, s.code);
  const allocSection = (a: { refType: string }): string => {
    if (a.refType === "FREIGHT_CHALLAN") return moduleSection.get("CHALAN") ?? "";
    if (a.refType === "BROKER_ENTRY") return moduleSection.get("BROKER_SLIP") ?? "";
    if (a.refType === "LORRY_HIRE") return moduleSection.get("HIRE") ?? "";
    return "";
  };

  // journal vouchers that touched the TDS Payable ledger head
  const tdsHeads = await tx.accountHead.findMany({
    where: { name: "TDS Payable" },
    select: { id: true },
  });
  const tdsLedger = tdsHeads.length
    ? await tx.ledgerEntry.findMany({
        where: {
          firmId: session.firmId,
          fyId: session.fyId,
          refType: "VOUCHER",
          accountHeadId: { in: tdsHeads.map((h) => h.id) },
          ...(dateWhere ? { date: dateWhere } : {}),
        },
      })
    : [];
  const journals = tdsLedger.length
    ? await tx.voucher.findMany({
        where: {
          id: { in: Array.from(new Set(tdsLedger.map((e) => e.refId))) },
          type: "JOURNAL",
          deletedAt: null,
        },
      })
    : [];
  const journalById = new Map(journals.map((v) => [v.id, v]));

  const out: TdsPayableRow[] = [];
  for (const e of tdsLedger) {
    const v = journalById.get(e.refId);
    if (!v) continue; // payment/receipt vouchers already have their own rows
    const p =
      (v.partyId && partyById.get(v.partyId)) ||
      (v.bankPartyId && partyById.get(v.bankPartyId)) ||
      undefined;
    // credit = liability raised (deducted); debit = paid off / reversed
    const signedAmt = e.side === "CREDIT" ? toNum(String(e.amount)) : -toNum(String(e.amount));
    out.push({
      date: e.date.toISOString(),
      module: "JOURNAL VOUCHER",
      section: "",
      party: p?.name ?? "",
      pan: p?.pan ?? "",
      refNo: v.voucherNo,
      invoiceAmount: toNum(String(v.amount)),
      // a journal adjusts the TDS ledger directly; no base was recorded, and
      // inventing one from the journal value would overstate the base totals
      baseAmt: 0,
      tdsPct: 0,
      tdsAmt: signedAmt,
      net: toNum(String(v.netAmount)),
      status: tdsStatus(Math.abs(signedAmt)),
      remarks: e.narration ?? v.remarks ?? "",
    });
  }
  for (const v of payVouchers) {
    const p = v.partyId ? partyById.get(v.partyId) : undefined;
    const allocTds = v.allocations.filter((a) => toNum(String(a.tdsAmt)) > 0);
    if (allocTds.length) {
      for (const a of allocTds) {
        const pct = toNum(String(a.tdsPct));
        const tds = toNum(String(a.tdsAmt));
        const billAmt = toNum(String(a.billAmt));
        out.push({
          date: v.voucherDate.toISOString(),
          module: "PAYMENT VOUCHER",
          section: allocSection(a),
          party: p?.name ?? "",
          pan: p?.pan ?? "",
          // for a chalan / slip the two are the same number; only a voucher
          // settling a bill has a distinct reference, so name both there
          refNo: a.refNo && a.refNo !== v.voucherNo ? `${a.refNo} (${v.voucherNo})` : v.voucherNo,
          // voucher rows carry only the TDS figure — bill/net stay blank
          invoiceAmount: null,
          // the bill amount recorded on the allocation is what the entry
          // screen computed the TDS from; when it was not captured, the
          // recorded pct recovers it rather than guessing from the invoice
          baseAmt: billAmt > 0.009 ? billAmt : pct > 0 ? round2((tds * 100) / pct) : 0,
          tdsPct: pct,
          tdsAmt: tds,
          net: null,
          status: tdsStatus(tds),
          remarks: a.remarks ?? v.remarks ?? "",
        });
      }
    } else if (toNum(String(v.tdsAmt)) > 0) {
      out.push({
        date: v.voucherDate.toISOString(),
        module: "PAYMENT VOUCHER",
        section: "",
        party: p?.name ?? "",
        pan: p?.pan ?? "",
        refNo: v.voucherNo,
        invoiceAmount: null,
        // header-only TDS records no rate and no bill — base stays unknown
        baseAmt: 0,
        tdsPct: 0,
        tdsAmt: toNum(String(v.tdsAmt)),
        net: null,
        status: tdsStatus(toNum(String(v.tdsAmt))),
        remarks: v.remarks ?? "",
      });
    }
  }
  for (const c of chalans) {
    const p = partyById.get(c.brokerId);
    out.push({
      date: c.chalanDate.toISOString(),
      module: "CHALLAN (OWNER)",
      section: moduleSection.get("CHALAN") ?? "",
      party: p?.name ?? "",
      pan: p?.pan ?? "",
      refNo: c.chalanNo,
      invoiceAmount: toNum(String(c.totalChalanAmt)),
      // the chalan's TDS is computed on its total chalan amount
      baseAmt: toNum(String(c.totalChalanAmt)),
      tdsPct: toNum(String(c.tdsPct)),
      tdsAmt: toNum(String(c.tdsAmt)),
      net: toNum(String(c.grandTotal)),
      status: tdsStatus(toNum(String(c.tdsAmt))),
      remarks: c.remarks ?? "",
    });
  }
  for (const s of slips) {
    const p = s.ownerId ? partyById.get(s.ownerId) : undefined;
    out.push({
      date: s.slipDate.toISOString(),
      module: "BROKER SLIP (OWNER)",
      section: moduleSection.get("BROKER_SLIP") ?? "",
      party: p?.name ?? s.ownerName ?? "",
      pan: p?.pan ?? "",
      refNo: s.slipNo,
      invoiceAmount: toNum(String(s.vChalanAmt)),
      // the owner-side TDS is computed on the owner-side chalan amount
      baseAmt: toNum(String(s.vChalanAmt)),
      tdsPct: toNum(String(s.vTdsPct)),
      tdsAmt: toNum(String(s.vTdsAmt)),
      net: toNum(String(s.vNetAmt)),
      status: tdsStatus(toNum(String(s.vTdsAmt))),
      remarks: s.vRemarks ?? "",
    });
  }
  return {
    rows: out.sort((a, b) => a.date.localeCompare(b.date)),
    parties,
    sectionCodes: tdsSections.map((s) => s.code).sort(),
  };
}
