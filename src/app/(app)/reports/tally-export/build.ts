import type { Tx } from "@/lib/db";
import { toNum } from "@/lib/utils";
import { round2 } from "@/lib/calc/tds";
import { tallyDate, voucherHash, type TallyLedgerMaster, type TallyVoucher } from "@/lib/tally";
import { makeTallyLookup, type TallyLookup } from "@/lib/tally-map";

/**
 * Chalan → Tally vouchers, in the user's exact entry style:
 *   PURCHASE  — component-wise Dr lines (freight/detention/ODC/fine/other,
 *               DECL vs TDS transporting ledger picked from the broker's TDS
 *               mode), one Cr to the broker [New Ref: chalan no]
 *   JOURNAL   — TDS alone
 *   JOURNAL   — Commission + Mamool together
 *   JOURNAL   — Courier alone; LD and Shortage each alone
 *   JOURNALS  — head advances: Dr broker / Cr the advance's mapped head
 *   RECEIPTS  — bank/cash advances and the balance payment (their style books
 *               bank payments as Receipt vouchers)
 *   ADVANCE_ADJ rows post nothing (the advance voucher already did).
 *
 * OWNERSHIP FILTER (user's hard rule): only BROKER and RELATIVE vehicles'
 * chalans export — an OWN vehicle's chalan never goes to Tally.
 */

export interface ChalanVoucherDoc {
  chalanId: string;
  chalanNo: string;
  dateIso: string;
  broker: string;
  vehicle: string;
  ownership: string;
  grandTotal: number;
  vouchers: TallyVoucher[];
}

interface Session {
  firmId: string;
  fyId: string;
}

export async function buildChalanVouchers(
  tx: Tx,
  session: Session,
  opts: { dateFrom: Date | null; dateTo: Date | null }
): Promise<{ docs: ChalanVoucherDoc[]; masters: TallyLedgerMaster[] }> {
  // the period matches ANY activity on the chalan — the chalan itself, an
  // advance, or the balance payment. A July chalan whose balance was paid in
  // August must surface in August's export, or its receipt never reaches
  // Tally (the export register keeps re-listed chalans duplicate-safe).
  const range =
    opts.dateFrom || opts.dateTo
      ? {
          ...(opts.dateFrom ? { gte: opts.dateFrom } : {}),
          ...(opts.dateTo ? { lte: opts.dateTo } : {}),
        }
      : null;
  const [chalans, parties, heads, mapRows] = await Promise.all([
    tx.chalan.findMany({
      where: {
        firmId: session.firmId,
        fyId: session.fyId,
        deletedAt: null,
        cancelledAt: null,
        isFinal: true, // drafts are not accounting yet
        ...(range
          ? {
              OR: [
                { chalanDate: range },
                { balPaymentDate: range },
                { advances: { some: { date: range } } },
              ],
            }
          : {}),
      },
      include: { advances: true },
      orderBy: [{ chalanDate: "asc" }, { chalanNo: "asc" }],
    }),
    tx.party.findMany({
      select: {
        id: true,
        name: true,
        tallyName: true,
        tdsMode: true,
        pan: true,
        mobile: true,
        address1: true,
        address2: true,
      },
    }),
    tx.accountHead.findMany({ select: { id: true, name: true } }),
    tx.tallyLedgerMap.findMany({ where: { firmId: session.firmId } }),
  ]);
  const vehicles = await tx.vehicle.findMany({
    select: { id: true, number: true, ownershipType: true },
  });

  const partyById = new Map(parties.map((p) => [p.id, p]));
  const headById = new Map(heads.map((h) => [h.id, h.name]));
  const vehicleById = new Map(vehicles.map((v) => [v.id, v]));
  const look: TallyLookup = makeTallyLookup(mapRows);
  const C = (key: string, fallback: string) => look("CHALAN", key, fallback);

  const docs: ChalanVoucherDoc[] = [];
  const masterIds = new Set<string>();

  for (const c of chalans) {
    const vehicle = vehicleById.get(c.vehicleId);
    // hard rule: OWN vehicles' chalans never go to Tally (no payable to self)
    if (!vehicle || vehicle.ownershipType === "OWNER") continue;
    const broker = partyById.get(c.brokerId);
    if (!broker) continue;
    const brokerLedger = broker.tallyName?.trim() || broker.name;
    masterIds.add(broker.id);

    const vouchers: TallyVoucher[] = [];
    const chDate = tallyDate(c.chalanDate);
    const refNo = c.chalanNo;
    const tag = `chalan ${c.chalanNo} — ${vehicle.number}`;

    // ---- PURCHASE: earnings component-wise, each on its own mapped ledger
    const freight = toNum(c.freight);
    const isDecl = broker.tdsMode === "DECLARATION";
    const components: [string, number][] = [
      [
        isDecl
          ? C("freight_decl", "TRANSPORTING EXP (DECLARATION)")
          : C("freight_tds", "TRANSPORTING EXP (TDS)"),
        freight,
      ],
      [C("detention", "DETENTION CHARGES"), toNum(c.detention)],
      [C("odc", "ODC CHARGES"), toNum(c.odcAmt)],
      [C("fine_slip", "FINE SLIP CHARGES"), toNum(c.fineSlip)],
      [C("other", "OTHER CHALAN CHARGES"), toNum(c.otherAmt)],
    ];
    const earnTotal = round2(components.reduce((s, [, a]) => s + a, 0));
    if (earnTotal > 0) {
      vouchers.push({
        key: `CHALAN:${c.id}:MAIN`,
        type: "Purchase",
        date: chDate,
        reference: refNo,
        narration: `Chalan ${c.chalanNo} — ${vehicle.number}${c.remarks ? ` — ${c.remarks}` : ""}`,
        lines: [
          ...components
            .filter(([, a]) => a > 0)
            .map(([ledger, a]): TallyVoucher["lines"][number] => ({
              ledger,
              amount: round2(a),
              side: "DR",
            })),
          {
            ledger: brokerLedger,
            amount: earnTotal,
            side: "CR",
            bills: [{ name: refNo, type: "New Ref", amount: earnTotal }],
          },
        ],
      });
    }

    // ---- deduction journals, grouped the user's way
    const journal = (
      keySuffix: string,
      total: number,
      credits: [string, number][],
      what: string
    ) => {
      if (total <= 0) return;
      vouchers.push({
        key: `CHALAN:${c.id}:${keySuffix}`,
        type: "Journal",
        date: chDate,
        narration: `${what} — ${tag}`,
        lines: [
          {
            ledger: brokerLedger,
            amount: round2(total),
            side: "DR",
            bills: [{ name: refNo, type: "Agst Ref", amount: round2(total) }],
          },
          ...credits
            .filter(([, a]) => a > 0)
            .map(([ledger, a]): TallyVoucher["lines"][number] => ({
              ledger,
              amount: round2(a),
              side: "CR",
            })),
        ],
      });
    };
    const tdsAmt = toNum(c.tdsAmt);
    journal("TDS", tdsAmt, [[C("tds", "TDS ON TRANSPORT 194C"), tdsAmt]], "TDS");
    const comm = toNum(c.commissionAmt);
    const mamool = toNum(c.mamool);
    journal(
      "COMM",
      round2(comm + mamool),
      [
        [C("commission", "COMMISSION INCOME"), comm],
        [C("mamool", "MAMOOL INCOME"), mamool],
      ],
      "Commission / Mamool"
    );
    const courier = toNum(c.courierCharge);
    journal("COURIER", courier, [[C("courier", "COURIER CHARGES"), courier]], "Courier");
    const ld = toNum(c.ldCharge);
    journal("LD", ld, [[C("ld", "LD CHARGE RECOVERED"), ld]], "LD charge");
    const shortage = toNum(c.shortageAmt);
    journal("SHORT", shortage, [[C("shortage", "SHORTAGE RECOVERY"), shortage]], "Shortage");

    // ---- advances: bank/cash → Receipt (their style); head → Journal
    for (const a of c.advances) {
      const amt = toNum(a.amount);
      if (amt <= 0) continue;
      if (a.type === "ADVANCE_ADJ") continue; // reference link only — no entry
      const aDate = a.date ? tallyDate(a.date) : chDate;
      const dieselBits =
        a.dieselQty && toNum(a.dieselQty) > 0
          ? ` ${toNum(a.dieselQty)} L${a.dieselRate ? ` @ ${toNum(a.dieselRate)}` : ""}`
          : "";
      const narration = `${a.type.replace(/_/g, " ")} advance${dieselBits}${a.supplierName ? ` — ${a.supplierName}` : ""} — ${tag}${a.remarks ? ` — ${a.remarks}` : ""}`;
      const brokerLine: TallyVoucher["lines"][number] = {
        ledger: brokerLedger,
        amount: amt,
        side: "DR",
        bills: [{ name: refNo, type: "Agst Ref", amount: amt }],
      };
      if (a.type === "BANK") {
        const bank = a.bankPartyId ? partyById.get(a.bankPartyId) : null;
        const bankLedger = bank
          ? look("BANKCASH", bank.id, bank.tallyName?.trim() || bank.name)
          : a.bankName?.trim() || "BANK";
        vouchers.push({
          key: `CHALAN:${c.id}:ADV:${a.id}`,
          type: "Receipt",
          date: aDate,
          narration,
          lines: [brokerLine, { ledger: bankLedger, amount: amt, side: "CR" }],
        });
      } else if (a.type === "CASH") {
        vouchers.push({
          key: `CHALAN:${c.id}:ADV:${a.id}`,
          type: "Receipt",
          date: aDate,
          narration,
          lines: [brokerLine, { ledger: C("cash", "CASH"), amount: amt, side: "CR" }],
        });
      } else {
        // expense given on the broker's behalf — credits the chosen head so
        // the head nets off (the purchase from the supplier booked the debit)
        const headLedger = a.headId
          ? look("HEAD", a.headId, (headById.get(a.headId) ?? "OTHER EXPENSE").toUpperCase())
          : `${a.type.charAt(0)}${a.type.slice(1).toLowerCase().replace(/_/g, " ")} Advance (Chalan)`.toUpperCase();
        vouchers.push({
          key: `CHALAN:${c.id}:ADV:${a.id}`,
          type: "Journal",
          date: aDate,
          narration,
          lines: [brokerLine, { ledger: headLedger, amount: amt, side: "CR" }],
        });
      }
    }

    // ---- balance payment (only when marked PAID on the chalan itself)
    if (c.paymentStatus === "PAID") {
      const paid = toNum(c.balPaidAmount);
      const ro = toNum(c.balRoundOff);
      const short = toNum(c.balShortage);
      const settle = round2(paid + ro + short);
      if (settle > 0.009 || (paid > 0.009 && settle > 0)) {
        const lines: TallyVoucher["lines"] = [
          {
            ledger: brokerLedger,
            amount: settle,
            side: "DR",
            bills: [{ name: refNo, type: "Agst Ref", amount: settle }],
          },
        ];
        if (paid > 0.009) {
          const payHead = c.balPaymentHeadId ? partyById.get(c.balPaymentHeadId) : null;
          const payLedger = payHead
            ? look("BANKCASH", payHead.id, payHead.tallyName?.trim() || payHead.name)
            : C("cash", "CASH");
          lines.push({ ledger: payLedger, amount: paid, side: "CR" });
        }
        if (short > 0.009) {
          lines.push({ ledger: C("shortage", "SHORTAGE RECOVERY"), amount: short, side: "CR" });
        }
        if (ro > 0.009) {
          lines.push({ ledger: C("round_off", "ROUND OFF"), amount: ro, side: "CR" });
        } else if (ro < -0.009) {
          // paid a little extra — round off is a debit, broker leg already nets it
          lines.push({ ledger: C("round_off", "ROUND OFF"), amount: Math.abs(ro), side: "DR" });
        }
        vouchers.push({
          key: `CHALAN:${c.id}:BAL`,
          type: "Receipt",
          date: c.balPaymentDate ? tallyDate(c.balPaymentDate) : chDate,
          narration: `Balance payment — ${tag}${c.balRemarks ? ` — ${c.balRemarks}` : ""}`,
          lines,
        });
      }
    }

    if (vouchers.length === 0) continue;
    docs.push({
      chalanId: c.id,
      chalanNo: c.chalanNo,
      dateIso: c.chalanDate.toISOString(),
      broker: broker.name,
      vehicle: vehicle.number,
      ownership: vehicle.ownershipType,
      grandTotal: toNum(c.grandTotal),
      vouchers,
    });
  }

  const masters: TallyLedgerMaster[] = Array.from(masterIds).map((id) => {
    const p = partyById.get(id)!;
    return {
      name: p.tallyName?.trim() || p.name,
      parent: "Sundry Creditors",
      address: [p.address1, p.address2].filter(Boolean).join(", ") || undefined,
      pan: p.pan ?? undefined,
      mobile: p.mobile ?? undefined,
    };
  });

  return { docs, masters };
}

/** Status of one generated voucher against the export register. */
export type VoucherStatus = "NEW" | "EXPORTED" | "CHANGED";

export function voucherStatuses(
  docs: ChalanVoucherDoc[],
  registry: Map<string, string> // key -> hash
): Map<string, VoucherStatus> {
  const out = new Map<string, VoucherStatus>();
  for (const d of docs) {
    for (const v of d.vouchers) {
      const prev = registry.get(v.key);
      out.set(v.key, prev === undefined ? "NEW" : prev === voucherHash(v) ? "EXPORTED" : "CHANGED");
    }
  }
  return out;
}
