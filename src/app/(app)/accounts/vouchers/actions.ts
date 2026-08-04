"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma, DocNumberType, VoucherType, ModuleLink } from "@prisma/client";
import { requireSession } from "@/lib/session";
import { withTenant, Tx } from "@/lib/db";
import { authorize } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { syncSequenceTo } from "@/lib/sequences";
import { postLedger, reverseLedger, LedgerPostEntry } from "@/lib/ledger";
import { round2 } from "@/lib/calc/tds";
import { adjustmentsTotal, applyAdjustments, ensureAdjustmentHead } from "@/lib/adjust-engine";
import { tdsHead } from "@/lib/account-heads";
import {
  payableSettlement,
  refPositions,
  ALL_PAYABLE_REF_TYPES,
  ALL_RECEIVABLE_REF_TYPES,
} from "@/lib/settlement";
import { raiseShortage, recoverShortage, releaseShortage } from "@/lib/shortage";
import {
  applyManualAdvanceUses,
  listOpenAdvances,
  restoreAdvanceUses,
  type OpenAdvance,
} from "@/lib/party-advance";

const DOC_TYPE_BY_VOUCHER: Record<VoucherType, DocNumberType> = {
  RECEIPT: "VOUCHER_RECEIPT",
  PAYMENT: "VOUCHER_PAYMENT",
  CONTRA: "VOUCHER_CONTRA",
  JOURNAL: "VOUCHER_JOURNAL",
};

const adjustmentSchema = z.object({
  adjustmentType: z.string().min(1),
  referenceType: z.string().min(1),
  referenceNo: z.string().min(1, "Reference number is required for every adjustment"),
  referenceDate: z.string().nullish(),
  amount: z.number().min(0).default(0),
  remarks: z.string().nullish(),
});

// manual adjustment of a previously received/paid advance against this
// voucher's reference allocations
const advanceUseSchema = z.object({
  advanceId: z.string().min(1),
  amount: z.number().min(0).default(0),
});

const allocationSchema = z.object({
  refId: z.string().min(1),
  refNo: z.string().min(1),
  /** per-row module — set when the grid runs in "All modules" mode */
  refType: z
    .enum([
      "BILLING",
      "GST_BILLING",
      "FREIGHT_CHALLAN",
      "BROKER_ENTRY",
      "LORRY_HIRE",
      "CASH_MEMO",
      "OFFICE_EXPENSE",
      "OFFICE_INCOME",
      "STAFF_PAYROLL",
      "VEHICLE_EXPENSE",
      "STAFF_ADVANCE",
      "DRIVER_SETTLEMENT",
      "ADBLUE_PURCHASE",
    ])
    .nullish(),
  billAmt: z.number().min(0).default(0),
  tdsPct: z.number().min(0).default(0),
  tdsAmt: z.number().min(0).default(0),
  deduction: z.number().min(0).default(0),
  otherAmt: z.number().min(0).default(0),
  /** round-off may be negative — a little extra paid rather than knocked off */
  roundOff: z.number().default(0),
  amount: z.number().min(0).default(0),
  remarks: z.string().nullish(),
});

const voucherSchema = z.object({
  id: z.string().nullish(),
  type: z.enum(["RECEIPT", "PAYMENT", "CONTRA", "JOURNAL"]),
  voucherNo: z.string().trim().min(1, "Voucher number is required"),
  voucherDate: z.string().min(1, "Date is required"), // ISO yyyy-mm-dd
  entryType: z.enum(["CASH", "BANK", "CARD", "CONTRA"]).default("CASH"),
  moduleLink: z
    .enum([
      "BILLING",
      "LORRY_HIRE",
      "BROKER_ENTRY",
      "FREIGHT_CHALLAN",
      "CASH_MEMO",
      "GST_BILLING",
      "LR_ENTRY",
      "OFFICE_EXPENSE",
      "OFFICE_INCOME",
      "STAFF_PAYROLL",
      "VEHICLE_EXPENSE",
      "STAFF_ADVANCE",
      "DRIVER_SETTLEMENT",
      "ADBLUE_PURCHASE",
      "OTHERS",
    ])
    .default("OTHERS"),
  partyId: z.string().nullish(),
  vehicleId: z.string().nullish(),
  accountHeadId: z.string().nullish(),
  ledgerPosting: z.enum(["PARTY", "VEHICLE", "BOTH"]).default("PARTY"),
  // journals may credit a ledger head instead of a party/bank account, so one
  // of the two is required rather than bankPartyId always
  bankPartyId: z.string().nullish(),
  creditHeadId: z.string().nullish(),
  chequeNo: z.string().nullish(),
  chequeDate: z.string().nullish(),
  // 0 is allowed only for a pure advance-adjustment receipt/payment — enforced
  // below, since journals/contras always move value
  amount: z.number().min(0),
  tdsAmt: z.number().min(0).default(0),
  deduction: z.number().min(0).default(0),
  otherAmt: z.number().min(0).default(0),
  remarks: z.string().nullish(),
  allocations: z.array(allocationSchema).default([]),
  // central adjustment engine lines (shared by receipt / payment / journal)
  adjustments: z.array(adjustmentSchema).default([]),
  // open party advances adjusted against this voucher's allocations
  advanceAdjustments: z.array(advanceUseSchema).default([]),
});

export type SaveVoucherResult = { ok: true; id: string } | { ok: false; error: string };

function toDate(s: string): Date {
  return new Date(s.includes("T") ? s : `${s}T00:00:00`);
}

export async function saveVoucher(input: unknown): Promise<SaveVoucherResult> {
  const session = requireSession();
  const parsed = voucherSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;
  await authorize(session, "vouchers", data.id ? "edit" : "create");

  if (data.type !== "CONTRA" && !data.partyId && !data.accountHeadId) {
    return { ok: false, error: "Party or Account Head is required" };
  }
  if (data.type === "CONTRA" && !data.partyId) {
    return { ok: false, error: "Counter Bank/Cash account is required for contra" };
  }
  // A journal adjusts any two ledgers: either side may be a party, a bank/cash
  // account or an income/expense head, so each side only has to be SOMETHING.
  if (data.type === "JOURNAL" && !data.partyId && !data.accountHeadId) {
    return { ok: false, error: "Debit ledger is required for a journal voucher" };
  }
  if (data.type === "JOURNAL" && !data.bankPartyId && !data.creditHeadId) {
    return { ok: false, error: "Credit ledger is required for a journal voucher" };
  }
  if (data.type !== "JOURNAL" && !data.bankPartyId) {
    return { ok: false, error: "Bank/Cash account is required" };
  }
  if (
    data.type === "JOURNAL" &&
    ((data.partyId && data.partyId === data.bankPartyId) ||
      (data.accountHeadId && data.accountHeadId === data.creditHeadId))
  ) {
    return { ok: false, error: "Debit and credit ledgers must be different" };
  }
  if (data.type === "CONTRA" && data.adjustments.length > 0) {
    return { ok: false, error: "Adjustments are not applicable on contra vouchers" };
  }

  // never trust client totals — adjustments reduce the net like deductions
  const adjTotal = adjustmentsTotal(data.adjustments);
  const netAmount = round2(
    data.amount - data.tdsAmt - data.deduction + data.otherAmt - adjTotal
  );
  const isMoneyType = data.type === "RECEIPT" || data.type === "PAYMENT";
  const advanceKind = data.type === "RECEIPT" ? "RECEIVED" : "PAID";
  const advUseTotal = round2(
    data.advanceAdjustments.reduce((s, a) => s + a.amount, 0)
  );
  if (advUseTotal > 0.009 && (!isMoneyType || !data.partyId || data.accountHeadId)) {
    return {
      ok: false,
      error: "Advance adjustment is only available on receipt/payment vouchers against a party",
    };
  }
  const pureAdvanceAdjust = isMoneyType && advUseTotal > 0.009;
  if (data.amount <= 0 && !pureAdvanceAdjust) {
    return { ok: false, error: "Amount is required" };
  }
  if (netAmount < 0) {
    return { ok: false, error: "Deductions + adjustments exceed the voucher amount" };
  }
  if (netAmount <= 0 && data.type !== "JOURNAL" && !pureAdvanceAdjust) {
    return { ok: false, error: "Net amount must be positive" };
  }

  try {
    const id = await withTenant(session.tenantId, async (tx) => {
      const voucherDate = toDate(data.voucherDate);
      const base = {
        voucherNo: data.voucherNo,
        voucherDate,
        type: data.type as VoucherType,
        entryType: data.entryType,
        moduleLink: data.moduleLink as ModuleLink,
        partyId: data.partyId || null,
        vehicleId: data.vehicleId || null,
        accountHeadId: data.accountHeadId || null,
        ledgerPosting: data.ledgerPosting,
        bankPartyId: data.bankPartyId || null,
        creditHeadId: data.creditHeadId || null,
        chequeNo: data.chequeNo || null,
        chequeDate: data.chequeDate ? toDate(data.chequeDate) : null,
        amount: data.amount,
        tdsAmt: data.tdsAmt,
        deduction: data.deduction,
        otherAmt: data.otherAmt,
        netAmount,
        remarks: data.remarks || null,
      };
      const allocations = data.allocations.map((a) => ({
        tenantId: session.tenantId,
        refType: (a.refType ?? data.moduleLink) as ModuleLink,
        refId: a.refId,
        refNo: a.refNo,
        billAmt: a.billAmt,
        tdsPct: a.tdsPct,
        tdsAmt: a.tdsAmt,
        deduction: a.deduction,
        otherAmt: a.otherAmt,
        roundOff: a.roundOff,
        amount: a.amount,
        remarks: a.remarks || null,
      }));

      // ---- validation: never over-settle, never allocate beyond the money
      // moved (net amount = header amount − TDS − deductions)
      const allocatedSum = round2(data.allocations.reduce((s, a) => s + a.amount, 0));
      if (allocatedSum > round2(netAmount + advUseTotal) + 0.01) {
        throw new Error(
          `Allocated ${allocatedSum} exceeds the received/paid amount ${netAmount}` +
            (advUseTotal > 0 ? ` plus advance adjusted ${advUseTotal}.` : ".")
        );
      }
      // an adjusted advance exists only to settle references — it cannot turn
      // into unallocated money (that would silently convert one advance into
      // another and desync the reference trail)
      if (advUseTotal > allocatedSum + 0.01) {
        throw new Error(
          `Advance adjusted ${advUseTotal} exceeds the ${allocatedSum} allocated to references — allocate the adjusted amount against pending references.`
        );
      }
      {
        const byType = new Map<ModuleLink, typeof data.allocations>();
        for (const a of data.allocations) {
          const t = (a.refType ?? data.moduleLink) as ModuleLink;
          byType.set(t, [...(byType.get(t) ?? []), a]);
        }
        for (const [refType, rows] of Array.from(byType.entries())) {
          const refIds = rows.map((r) => r.refId);
          const already = await allocatedByRef(tx, refType, refIds, data.id);
          // gross document value per ref, per module
          const gross = new Map<string, number>();
          if (refType === "BILLING" || refType === "GST_BILLING") {
            const invs = await tx.invoice.findMany({ where: { id: { in: refIds } } });
            invs.forEach((i) => gross.set(i.id, round2(Number(i.grandTotal) - Number(i.advance))));
          } else if (refType === "FREIGHT_CHALLAN") {
            // net off what the chalan's own balance-payment screen already
            // settled, else the voucher could pay the same balance twice
            const cs = await tx.chalan.findMany({ where: { id: { in: refIds } } });
            cs.forEach((c) =>
              gross.set(
                c.id,
                round2(
                  Number(c.balance) -
                    Number(c.balPaidAmount) -
                    Number(c.balShortage) -
                    Number(c.balRoundOff) -
                    Number(c.balAdvanceAdjusted)
                )
              )
            );
          } else if (refType === "BROKER_ENTRY") {
            const ss = await tx.brokerSlip.findMany({ where: { id: { in: refIds } } });
            ss.forEach((s) =>
              gross.set(
                s.id,
                round2(
                  Number(s.vBalance) -
                    Number(s.vPaidAmount) -
                    Number(s.vShortage) -
                    Number(s.vRoundOff)
                )
              )
            );
          } else if (refType === "LORRY_HIRE") {
            const hs = await tx.hireSlip.findMany({ where: { id: { in: refIds } } });
            hs.forEach((h) => gross.set(h.id, Number(h.balance)));
          } else if (refType === "CASH_MEMO") {
            const ds = await tx.delivery.findMany({ where: { id: { in: refIds } } });
            ds.forEach((d2) => gross.set(d2.id, Number(d2.total)));
          } else if (refType === "OFFICE_EXPENSE" || refType === "OFFICE_INCOME") {
            const ots = await tx.officeTransaction.findMany({ where: { id: { in: refIds } } });
            ots.forEach((o) =>
              // an entry already paid at source has nothing left to settle, so
              // its ceiling is zero rather than its amount
              gross.set(o.id, o.paymentMode ? 0 : Number(o.amount))
            );
          } else if (refType === "STAFF_PAYROLL") {
            const sal = await tx.staffSalary.findMany({ where: { id: { in: refIds } } });
            sal.forEach((s) =>
              gross.set(s.id, round2(Number(s.netSalary) - Number(s.paidAmount)))
            );
          } else if (refType === "VEHICLE_EXPENSE") {
            const vex = await tx.vehicleExpenseVoucher.findMany({ where: { id: { in: refIds } } });
            // paid at entry = the money already moved; nothing left to settle
            vex.forEach((v) => gross.set(v.id, v.paymentMode ? 0 : Number(v.amount)));
          } else if (refType === "STAFF_ADVANCE") {
            const advs = await tx.staffAdvance.findMany({ where: { id: { in: refIds } } });
            const recovered = await tx.staffSalary.groupBy({
              by: ["advanceId"],
              where: { advanceId: { in: refIds }, deletedAt: null },
              _sum: { advanceRecovery: true },
            });
            const byAdvance = new Map(
              recovered.map((r) => [r.advanceId ?? "", Number(r._sum.advanceRecovery ?? 0)])
            );
            // what payroll already recovered cannot be received again in cash
            advs.forEach((a) =>
              gross.set(a.id, round2(Number(a.amount) - (byAdvance.get(a.id) ?? 0)))
            );
          } else if (refType === "ADBLUE_PURCHASE") {
            const refills = await tx.adblueTxn.findMany({ where: { id: { in: refIds } } });
            // unbilled stock owes nothing yet, and a refill paid at entry is done
            refills.forEach((r) =>
              gross.set(r.id, r.billNo && !r.paymentMode ? Number(r.amount) : 0)
            );
          } else if (refType === "DRIVER_SETTLEMENT") {
            const sets = await tx.driverSettlement.findMany({ where: { id: { in: refIds } } });
            // settling from the driver-settlement screen creates its own voucher
            // and marks the row SETTLED — it must not be payable twice
            sets.forEach((s) =>
              gross.set(s.id, s.status === "SETTLED" ? 0 : Math.abs(Number(s.amount)))
            );
          }
          for (const r of rows) {
            const pending = round2((gross.get(r.refId) ?? Infinity) - (already.get(r.refId) ?? 0));
            const settle = round2(r.amount + r.tdsAmt + r.deduction + r.otherAmt + r.roundOff);
            if (settle > pending + 0.01) {
              throw new Error(
                `Ref ${r.refNo}: adjustment ${settle} exceeds the pending amount ${pending}. Duplicate or over-settlement is not allowed.`
              );
            }
          }
        }
      }

      let savedId: string;
      if (data.id) {
        const before = await tx.voucher.findUniqueOrThrow({
          where: { id: data.id },
          include: { allocations: true },
        });
        if (before.deletedAt) throw new Error("Voucher has been deleted");
        await tx.voucherAllocation.deleteMany({ where: { voucherId: data.id } });
        const updated = await tx.voucher.update({
          where: { id: data.id },
          data: { ...base, allocations: { create: allocations } },
          include: { allocations: true },
        });
        savedId = updated.id;
        await reverseLedger(tx, "VOUCHER", savedId);
        await audit(tx, session, {
          entity: "Voucher",
          entityId: savedId,
          action: "UPDATE",
          before,
          after: updated,
        });
      } else {
        const created = await tx.voucher.create({
          data: {
            tenantId: session.tenantId,
            firmId: session.firmId,
            fyId: session.fyId,
            createdById: session.userId,
            ...base,
            allocations: { create: allocations },
          },
          include: { allocations: true },
        });
        savedId = created.id;
        await audit(tx, session, {
          entity: "Voucher",
          entityId: savedId,
          action: "CREATE",
          after: created,
        });
      }

      // ---- ledger posting (central adjustment engine) ----
      const narration =
        data.remarks || `${data.type} voucher ${data.voucherNo} (${data.moduleLink})`;
      // Reference No carries the ORIGINAL document reference (bill / invoice /
      // chalan / slip no from the allocations) so the whole lifecycle of a
      // document can be traced by one reference; the voucher number stays
      // available via refId -> voucher lookup (shown as its own column).
      const allocRefNos = Array.from(new Set(data.allocations.map((a) => a.refNo).filter(Boolean)));
      const docRefNo = allocRefNos.length ? allocRefNos.join(", ") : data.voucherNo;
      const common = {
        date: voucherDate,
        refType: "VOUCHER",
        refId: savedId,
        refNo: docRefNo,
        narration,
      };
      const entries: LedgerPostEntry[] = [];
      // bank/cash (or journal credit account) side: Receipt -> money in (DEBIT
      // bank), Payment -> money out (CREDIT bank). Journal -> CREDIT the
      // counter account (no cash/bank movement semantics). Contra -> DEBIT
      // destination bank, CREDIT source party.
      const bankSide = data.type === "PAYMENT" || data.type === "JOURNAL" ? "CREDIT" : "DEBIT";
      const counterSide = bankSide === "CREDIT" ? "DEBIT" : "CREDIT";
      // a journal may credit a ledger head instead of a bank/cash party
      entries.push({
        ...common,
        partyId: data.creditHeadId ? null : data.bankPartyId,
        accountHeadId: data.creditHeadId || null,
        side: bankSide,
        amount: netAmount,
      });

      const postParty = data.ledgerPosting === "PARTY" || data.ledgerPosting === "BOTH";
      const postVehicle = data.ledgerPosting === "VEHICLE" || data.ledgerPosting === "BOTH";
      if (data.type === "CONTRA") {
        entries.push({ ...common, partyId: data.partyId, side: counterSide, amount: netAmount });
      } else {
        // the party is settled for the GROSS amount — deductions and
        // adjustments are posted to their own heads so nothing stays
        // outstanding against the party
        if (postParty && (data.partyId || data.accountHeadId)) {
          entries.push({
            ...common,
            partyId: data.partyId || null,
            accountHeadId: data.partyId ? null : data.accountHeadId,
            side: counterSide,
            amount: data.amount,
          });
        }
        if (postVehicle && data.vehicleId) {
          entries.push({
            ...common,
            vehicleId: data.vehicleId,
            side: counterSide,
            amount: data.amount,
          });
        }
        // Header deductions post to the COMMON ledger head for each concept —
        // TDS to the statutory payable/receivable ledger (never a "TDS
        // Adjustment" head), a deduction to the one Shortage ledger the chalan
        // and broker slip also use.
        const legacy: [string, number, "bank" | "counter"][] = [
          [tdsHead(data.type), data.tdsAmt, "bank"],
          ["Shortage", data.deduction, "bank"],
          ["Other Charges", data.otherAmt, "counter"],
        ];
        for (const [name, amt, dir] of legacy) {
          if (amt > 0) {
            const headId = await ensureAdjustmentHead(tx, session.tenantId, name, data.type);
            entries.push({
              ...common,
              accountHeadId: headId,
              side: dir === "bank" ? bankSide : counterSide,
              amount: round2(amt),
              narration: `${name} on ${data.type.toLowerCase()} voucher ${data.voucherNo}`,
            });
          }
        }
        // Per-allocation round-off settles the reference but was never posted,
        // so the party ledger disagreed with the outstanding register by exactly
        // the rounding. It posts here to the one common Round Off ledger:
        // knocked off the payable/receivable => Round Off income, added to it
        // (a negative round-off) => Round Off expense, same head either way.
        const allocRoundOff = round2(data.allocations.reduce((s, a) => s + a.roundOff, 0));
        if (Math.abs(allocRoundOff) > 0.009 && (data.partyId || data.accountHeadId)) {
          const headId = await ensureAdjustmentHead(tx, session.tenantId, "Round Off", data.type);
          const amount = Math.abs(allocRoundOff);
          const partySide = allocRoundOff > 0 ? counterSide : bankSide;
          const headSide = allocRoundOff > 0 ? bankSide : counterSide;
          entries.push(
            {
              ...common,
              partyId: data.partyId || null,
              accountHeadId: data.partyId ? null : data.accountHeadId,
              side: partySide,
              amount,
              narration: `Round off on ${data.type.toLowerCase()} voucher ${data.voucherNo}`,
            },
            {
              ...common,
              accountHeadId: headId,
              side: headSide,
              amount,
              narration: `Round off on ${data.type.toLowerCase()} voucher ${data.voucherNo}`,
            }
          );
        }
      }

      // reference-based adjustment lines — persisted + posted by the engine
      const { entries: adjEntries } = await applyAdjustments(tx, session, {
        voucherId: savedId,
        voucherNo: data.voucherNo,
        voucherType: data.type,
        voucherDate,
        lines: data.type === "CONTRA" ? [] : data.adjustments,
      });
      entries.push(...adjEntries);

      // a pure advance-adjustment voucher moves no money, so zero-value legs
      // (bank/party) are dropped rather than posted
      await postLedger(tx, session, entries.filter((e) => e.amount > 0.009));

      // Per-reference shortage on a voucher allocation. A PAYMENT deducts it
      // from what we hand over, so it is RECOVERED; a RECEIPT means the party
      // paid us less, so the company bears it — an EXPENSE. Those are the only
      // two voucher cases that touch the shortage ledger.
      // The money leg is already posted above via the header deduction, so the
      // register only records the document side.
      await releaseShortage(tx, "VOUCHER", savedId);
      const allocShortage = round2(
        data.allocations.reduce((s, a) => s + a.deduction, 0)
      );
      if (allocShortage > 0.009 && data.partyId && (data.type === "PAYMENT" || data.type === "RECEIPT")) {
        const refNos = Array.from(new Set(data.allocations.filter((a) => a.deduction > 0).map((a) => a.refNo)));
        const shortageArgs = {
          date: voucherDate,
          module: "VOUCHER" as const,
          refId: savedId,
          refNo: refNos.join(", ") || data.voucherNo,
          partyId: data.partyId,
          partyKind: "PARTY" as const,
          amount: allocShortage,
          remarks: `${data.type === "PAYMENT" ? "Deducted on" : "Short received against"} voucher ${data.voucherNo}`,
        };
        if (data.type === "PAYMENT") {
          await recoverShortage(tx, session, { ...shortageArgs, source: "PARTY" });
        } else {
          await raiseShortage(tx, session, shortageArgs);
        }
      }

      await syncSequenceTo(tx, {
        tenantId: session.tenantId,
        firmId: session.firmId,
        fyId: session.fyId,
        docType: DOC_TYPE_BY_VOUCHER[data.type as VoucherType],
        savedNumber: data.voucherNo,
      });

      // ---- manual advance adjustment (previously received/paid advances
      // consumed against this voucher's reference allocations) ----
      // Release whatever this voucher consumed before (edit path), then apply
      // the requested lines — each validated against the advance's live open
      // balance, party and direction inside the same transaction.
      await restoreAdvanceUses(tx, "VOUCHER", savedId);
      if (advUseTotal > 0.009 && data.partyId) {
        const own = await tx.partyAdvance.findFirst({
          where: {
            voucherId: savedId,
            id: { in: data.advanceAdjustments.map((l) => l.advanceId) },
          },
        });
        if (own) throw new Error("A voucher cannot adjust the advance it created itself.");
        await applyManualAdvanceUses(tx, {
          tenantId: session.tenantId,
          firmId: session.firmId,
          partyId: data.partyId,
          refType: "VOUCHER",
          refId: savedId,
          // carry the settled document references, so the Advance Register's
          // "Used Against" reads "SBRL/001" rather than a bare voucher number
          refNo: docRefNo,
          date: voucherDate,
          kinds: [advanceKind],
          lines: data.advanceAdjustments,
        });
      }

      // ---- automatic party advance (receive-as-advance / over-payment /
      // advance-payment / over-payment on payables) ----
      // Any unallocated remainder of a party receipt OR payment becomes an
      // advance balance for that party — no second voucher is ever needed.
      if ((data.type === "RECEIPT" || data.type === "PAYMENT") && data.partyId && !data.accountHeadId) {
        // advance = money moved that no reference consumed; allocations funded
        // by adjusted advances are not this voucher's money
        const unallocated = round2(netAmount + advUseTotal - allocatedSum);
        const existingAdv = await tx.partyAdvance.findFirst({
          where: { voucherId: savedId, deletedAt: null },
        });
        if (unallocated > 0.009) {
          if (existingAdv) {
            if (Number(existingAdv.consumedAmount) > unallocated + 0.01) {
              throw new Error(
                `Advance from this voucher is already consumed (${existingAdv.consumedAmount}) — cannot reduce it below that.`
              );
            }
            await tx.partyAdvance.update({
              where: { id: existingAdv.id },
              data: {
                partyId: data.partyId,
                kind: advanceKind,
                date: voucherDate,
                voucherNo: data.voucherNo,
                amount: unallocated,
                remarks: data.remarks || null,
              },
            });
          } else {
            await tx.partyAdvance.create({
              data: {
                tenantId: session.tenantId,
                firmId: session.firmId,
                fyId: session.fyId,
                partyId: data.partyId,
                kind: advanceKind,
                date: voucherDate,
                voucherId: savedId,
                voucherNo: data.voucherNo,
                amount: unallocated,
                remarks: data.remarks || null,
              },
            });
          }
        } else if (existingAdv) {
          if (Number(existingAdv.consumedAmount) > 0.009) {
            throw new Error(
              "This voucher's advance has already been consumed by a bill — it cannot be fully allocated now."
            );
          }
          await tx.partyAdvance.update({
            where: { id: existingAdv.id },
            data: { deletedAt: new Date() },
          });
        }
      }

      return savedId;
    });

    revalidatePath("/accounts/vouchers");
    revalidatePath("/accounts/vouchers/register");
    return { ok: true, id };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, error: "Voucher number already exists" };
    }
    return { ok: false, error: err instanceof Error ? err.message : "Failed to save voucher" };
  }
}

export async function deleteVoucher(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = requireSession();
  if (session.role !== "ADMIN" && session.role !== "OWNER") {
    return { ok: false, error: "Only Admin/Owner may delete vouchers" };
  }
  await authorize(session, "vouchers", "delete");
  try {
    await withTenant(session.tenantId, async (tx) => {
      const before = await tx.voucher.findUniqueOrThrow({ where: { id } });
      const adv = await tx.partyAdvance.findFirst({ where: { voucherId: id, deletedAt: null } });
      if (adv && Number(adv.consumedAmount) > 0.009) {
        throw new Error(
          "The advance created by this voucher is already consumed by a bill — remove that adjustment first."
        );
      }
      if (adv) {
        await tx.partyAdvance.update({ where: { id: adv.id }, data: { deletedAt: new Date() } });
      }
      await tx.voucher.update({ where: { id }, data: { deletedAt: new Date() } });
      // give back whatever OTHER advances this voucher had adjusted
      await restoreAdvanceUses(tx, "VOUCHER", id);
      await reverseLedger(tx, "VOUCHER", id);
      await releaseShortage(tx, "VOUCHER", id);
      await audit(tx, session, { entity: "Voucher", entityId: id, action: "DELETE", before });
    });
    revalidatePath("/accounts/vouchers");
    revalidatePath("/accounts/vouchers/register");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to delete voucher" };
  }
}

// ---------- allocation candidates ----------

export interface AllocationCandidate {
  refId: string;
  refNo: string;
  date: string; // ISO
  billAmt: number;
  outstanding: number;
  tdsPct: number;
  /** source module (needed when the grid runs in "All modules" mode) */
  module: ModuleLink;
}

/**
 * Amount already settled against a set of refs (excluding a voucher being
 * edited). Every approved deduction settles the document just like money, so
 * TDS, shortage, other and round-off count alongside the cash.
 */
async function allocatedByRef(
  tx: Tx,
  refType: ModuleLink,
  refIds: string[],
  excludeVoucherId?: string | null
): Promise<Map<string, number>> {
  if (!refIds.length) return new Map();
  const rows = await tx.voucherAllocation.groupBy({
    by: ["refId"],
    where: {
      refType,
      refId: { in: refIds },
      voucher: { deletedAt: null, ...(excludeVoucherId ? { id: { not: excludeVoucherId } } : {}) },
    },
    _sum: { amount: true, tdsAmt: true, deduction: true, otherAmt: true, roundOff: true },
  });
  return new Map(
    rows.map((r) => [
      r.refId,
      round2(
        Number(r._sum.amount ?? 0) +
          Number(r._sum.tdsAmt ?? 0) +
          Number(r._sum.deduction ?? 0) +
          Number(r._sum.otherAmt ?? 0) +
          Number(r._sum.roundOff ?? 0)
      ),
    ])
  );
}

/**
 * List open documents for the allocation grid, per moduleLink:
 *  - BILLING / GST_BILLING: party invoices with unallocated balance
 *  - FREIGHT_CHALLAN: broker's final chalans with outstanding balance
 *  - BROKER_ENTRY: broker slips with vehicle-side balance
 *  - LORRY_HIRE: hire slips with balance
 *  - CASH_MEMO: deliveries
 */
export async function getAllocationCandidates(input: {
  moduleLink: ModuleLink | "ALL";
  partyId?: string | null;
  voucherId?: string | null;
  /** restricts "ALL" to the modules that voucher direction can settle —
   *  a Receipt must never offer payables and vice versa */
  voucherType?: "RECEIPT" | "PAYMENT" | null;
}): Promise<AllocationCandidate[]> {
  const session = requireSession();
  const { partyId, voucherId } = input;
  const links: ModuleLink[] =
    input.moduleLink === "ALL"
      ? input.voucherType === "RECEIPT"
        ? [...ALL_RECEIVABLE_REF_TYPES, "CASH_MEMO"]
        : input.voucherType === "PAYMENT"
          ? [...ALL_PAYABLE_REF_TYPES]
          : [
              "BILLING",
              "GST_BILLING",
              "FREIGHT_CHALLAN",
              "BROKER_ENTRY",
              "LORRY_HIRE",
              "CASH_MEMO",
              "OFFICE_EXPENSE",
              "OFFICE_INCOME",
              "STAFF_PAYROLL",
              "VEHICLE_EXPENSE",
              "STAFF_ADVANCE",
              "DRIVER_SETTLEMENT",
              "ADBLUE_PURCHASE",
            ]
      : [input.moduleLink];

  return withTenant(session.tenantId, async (tx) => {
    const scope = { firmId: session.firmId, fyId: session.fyId, deletedAt: null as null };
    const out: AllocationCandidate[] = [];
    for (const moduleLink of links) {

    if (moduleLink === "BILLING" || moduleLink === "GST_BILLING") {
      const invoices = await tx.invoice.findMany({
        where: {
          ...scope,
          ...(partyId ? { partyId } : {}),
          ...(moduleLink === "GST_BILLING" ? { kind: "GST" } : { kind: { not: "GST" } }),
        },
        orderBy: { invoiceDate: "asc" },
      });
      const paid = await allocatedByRef(tx, moduleLink, invoices.map((i) => i.id), voucherId);
      for (const inv of invoices) {
        const bill = Number(inv.grandTotal);
        const outstanding = round2(bill - Number(inv.advance) - (paid.get(inv.id) ?? 0));
        if (outstanding > 0)
          out.push({
            refId: inv.id,
            refNo: inv.invoiceNo,
            date: inv.invoiceDate.toISOString(),
            billAmt: bill,
            outstanding,
            tdsPct: Number(inv.tdsPct),
            module: moduleLink,
          });
      }
    } else if (moduleLink === "FREIGHT_CHALLAN") {
      const chalans = await tx.chalan.findMany({
        where: { ...scope, isFinal: true, ...(partyId ? { brokerId: partyId } : {}) },
        orderBy: { chalanDate: "asc" },
      });
      // a chalan settled on its own balance-payment screen must not reappear
      // here as fully outstanding — both settlement paths are counted
      const pos = await payableSettlement(tx, {
        firmId: session.firmId,
        fyId: session.fyId,
        refType: moduleLink,
        excludeVoucherId: voucherId,
        docs: chalans.map((c) => ({
          id: c.id,
          balance: Number(c.balance),
          ownPaid: Number(c.balPaidAmount),
          ownShortage: Number(c.balShortage),
          ownRoundOff: Number(c.balRoundOff),
          ownAdvanceAdjusted: Number(c.balAdvanceAdjusted),
        })),
      });
      for (const c of chalans) {
        const outstanding = pos.get(c.id)?.outstanding ?? 0;
        if (outstanding > 0)
          out.push({
            refId: c.id,
            refNo: c.chalanNo,
            date: c.chalanDate.toISOString(),
            billAmt: Number(c.grandTotal),
            outstanding,
            tdsPct: Number(c.tdsPct),
            module: moduleLink,
          });
      }
    } else if (moduleLink === "BROKER_ENTRY") {
      const slips = await tx.brokerSlip.findMany({
        where: {
          ...scope,
          ...(partyId ? { OR: [{ transporterId: partyId }, { ownerId: partyId }] } : {}),
        },
        orderBy: { slipDate: "asc" },
      });
      // same for the owner side of a broker slip
      const pos = await payableSettlement(tx, {
        firmId: session.firmId,
        fyId: session.fyId,
        refType: moduleLink,
        excludeVoucherId: voucherId,
        docs: slips.map((s) => ({
          id: s.id,
          balance: Number(s.vBalance),
          ownPaid: Number(s.vPaidAmount),
          ownShortage: Number(s.vShortage),
          ownRoundOff: Number(s.vRoundOff),
        })),
      });
      for (const s of slips) {
        const outstanding = pos.get(s.id)?.outstanding ?? 0;
        if (outstanding > 0)
          out.push({
            refId: s.id,
            refNo: s.slipNo,
            date: s.slipDate.toISOString(),
            billAmt: Number(s.vNetAmt),
            outstanding,
            tdsPct: Number(s.vTdsPct),
            module: moduleLink,
          });
      }
    } else if (moduleLink === "LORRY_HIRE") {
      const slips = await tx.hireSlip.findMany({
        where: { ...scope },
        orderBy: { slipDate: "asc" },
      });
      const paid = await allocatedByRef(tx, moduleLink, slips.map((s) => s.id), voucherId);
      for (const s of slips) {
        const outstanding = round2(Number(s.balance) - (paid.get(s.id) ?? 0));
        if (outstanding > 0)
          out.push({
            refId: s.id,
            refNo: s.slipNo,
            date: s.slipDate.toISOString(),
            billAmt: Number(s.totalHire),
            outstanding,
            tdsPct: 0,
            module: moduleLink,
          });
      }
    } else if (moduleLink === "CASH_MEMO") {
      const deliveries = await tx.delivery.findMany({
        where: { ...scope, type: "CASH_MEMO", ...(partyId ? { partyId } : {}) },
        orderBy: { delDate: "asc" },
      });
      const paid = await allocatedByRef(tx, moduleLink, deliveries.map((d) => d.id), voucherId);
      for (const d of deliveries) {
        const outstanding = round2(Number(d.total) - (paid.get(d.id) ?? 0));
        if (outstanding > 0)
          out.push({
            refId: d.id,
            refNo: d.delNo,
            date: d.delDate.toISOString(),
            billAmt: Number(d.total),
            outstanding,
            tdsPct: 0,
            module: moduleLink,
          });
      }
    } else if (moduleLink === "OFFICE_EXPENSE" || moduleLink === "OFFICE_INCOME") {
      // Only entries left ON CREDIT are outstanding. One with a payment mode
      // was settled in cash or bank at entry — the money has already moved, and
      // offering it for settlement again would pay it twice.
      const txns = await tx.officeTransaction.findMany({
        where: {
          ...scope,
          txnType: moduleLink === "OFFICE_EXPENSE" ? "EXPENSE" : "INCOME",
          paymentMode: null,
          // an entry with no party has nobody to owe or be owed by
          partyId: partyId ? partyId : { not: null },
        },
        orderBy: { date: "asc" },
      });
      const pos = await refPositions(tx, {
        firmId: session.firmId,
        fyId: session.fyId,
        refType: moduleLink,
        excludeVoucherId: voucherId,
        docs: txns.map((t) => ({ id: t.id, original: Number(t.amount) })),
      });
      for (const t of txns) {
        const outstanding = pos.get(t.id)?.outstanding ?? 0;
        if (outstanding > 0)
          out.push({
            refId: t.id,
            // blank reference falls back to the voucher number, matching what
            // was persisted on save and what the ledger already shows
            refNo: t.refNo || t.voucherNo,
            date: t.date.toISOString(),
            billAmt: Number(t.amount),
            outstanding,
            tdsPct: 0,
            module: moduleLink,
          });
      }
    } else if (moduleLink === "STAFF_PAYROLL") {
      const salaries = await tx.staffSalary.findMany({
        where: { ...scope, ...(partyId ? { partyId } : {}) },
        orderBy: { month: "asc" },
      });
      // a salary can be settled on the payroll screen too, so both paths count
      const pos = await refPositions(tx, {
        firmId: session.firmId,
        fyId: session.fyId,
        refType: moduleLink,
        excludeVoucherId: voucherId,
        docs: salaries.map((s) => ({
          id: s.id,
          original: Number(s.netSalary),
          ownSettled: Number(s.paidAmount),
        })),
      });
      for (const s of salaries) {
        const outstanding = pos.get(s.id)?.outstanding ?? 0;
        if (outstanding > 0)
          out.push({
            refId: s.id,
            refNo: s.refNo || s.voucherNo || s.month,
            date: new Date(`${s.month}-01T00:00:00`).toISOString(),
            billAmt: Number(s.netSalary),
            outstanding,
            tdsPct: 0,
            module: moduleLink,
          });
      }
    } else if (moduleLink === "VEHICLE_EXPENSE") {
      // only bills left ON CREDIT are outstanding — one with a payment mode was
      // settled in cash or bank at entry, and offering it again would pay twice
      const bills = await tx.vehicleExpenseVoucher.findMany({
        where: {
          ...scope,
          paymentMode: null,
          partyId: partyId ? partyId : { not: null },
        },
        orderBy: { date: "asc" },
      });
      const pos = await refPositions(tx, {
        firmId: session.firmId,
        fyId: session.fyId,
        refType: moduleLink,
        excludeVoucherId: voucherId,
        docs: bills.map((b) => ({ id: b.id, original: Number(b.amount) })),
      });
      for (const b of bills) {
        const outstanding = pos.get(b.id)?.outstanding ?? 0;
        if (outstanding > 0)
          out.push({
            refId: b.id,
            // blank reference falls back to the voucher number, the same rule
            // office bills and salaries follow
            refNo: b.refNo || b.voucherNo,
            date: b.date.toISOString(),
            billAmt: Number(b.amount),
            outstanding,
            tdsPct: 0,
            module: moduleLink,
          });
      }
    } else if (moduleLink === "STAFF_ADVANCE") {
      // an advance is money the staff member owes back: it is RECEIVED, either
      // as a payroll deduction (handled on the salary screen) or in cash here
      const advances = await tx.staffAdvance.findMany({
        where: { ...scope, ...(partyId ? { partyId } : {}) },
        orderBy: { date: "asc" },
      });
      const recovered = await tx.staffSalary.groupBy({
        by: ["advanceId"],
        where: { advanceId: { in: advances.map((a) => a.id) }, deletedAt: null },
        _sum: { advanceRecovery: true },
      });
      const byAdvance = new Map(
        recovered.map((r) => [r.advanceId ?? "", Number(r._sum.advanceRecovery ?? 0)])
      );
      const pos = await refPositions(tx, {
        firmId: session.firmId,
        fyId: session.fyId,
        refType: moduleLink,
        excludeVoucherId: voucherId,
        docs: advances.map((a) => ({
          id: a.id,
          original: Number(a.amount),
          ownSettled: byAdvance.get(a.id) ?? 0,
        })),
      });
      for (const a of advances) {
        const outstanding = pos.get(a.id)?.outstanding ?? 0;
        if (outstanding > 0)
          out.push({
            refId: a.id,
            refNo: a.advanceNo,
            date: a.date.toISOString(),
            billAmt: Number(a.amount),
            outstanding,
            tdsPct: 0,
            module: moduleLink,
          });
      }
    } else if (moduleLink === "ADBLUE_PURCHASE") {
      // a billed refill left on credit. Stock still waiting for its invoice owes
      // nothing yet, and one paid at entry has already moved the money.
      const refills = await tx.adblueTxn.findMany({
        where: {
          ...scope,
          type: "REFILL",
          billNo: { not: null },
          paymentMode: null,
          supplierId: partyId ? partyId : { not: null },
        },
        orderBy: { date: "asc" },
      });
      const pos = await refPositions(tx, {
        firmId: session.firmId,
        fyId: session.fyId,
        refType: moduleLink,
        excludeVoucherId: voucherId,
        docs: refills.map((r) => ({ id: r.id, original: Number(r.amount) })),
      });
      for (const r of refills) {
        const outstanding = pos.get(r.id)?.outstanding ?? 0;
        if (outstanding > 0)
          out.push({
            refId: r.id,
            refNo: r.billNo!,
            date: (r.billDate ?? r.date).toISOString(),
            billAmt: Number(r.amount),
            outstanding,
            tdsPct: 0,
            module: moduleLink,
          });
      }
    } else if (moduleLink === "DRIVER_SETTLEMENT") {
      // a pending trip settlement balance: positive = the company pays the
      // driver, negative = the driver pays the company. Settling it from its own
      // screen creates a voucher and marks it SETTLED, so only PENDING rows are
      // offered here and the same balance can never be settled twice.
      const settlements = await tx.driverSettlement.findMany({
        where: { ...scope, status: "PENDING" },
        orderBy: { date: "asc" },
      });
      const drivers = settlements.length
        ? await tx.driver.findMany({
            where: { id: { in: settlements.map((s) => s.driverId) } },
            select: { id: true, partyId: true, driverCode: true },
          })
        : [];
      const driverById = new Map(drivers.map((d) => [d.id, d]));
      const mine = settlements.filter((s) =>
        partyId ? driverById.get(s.driverId)?.partyId === partyId : true
      );
      const pos = await refPositions(tx, {
        firmId: session.firmId,
        fyId: session.fyId,
        refType: moduleLink,
        excludeVoucherId: voucherId,
        docs: mine.map((s) => ({ id: s.id, original: Math.abs(Number(s.amount)) })),
      });
      for (const s of mine) {
        const outstanding = pos.get(s.id)?.outstanding ?? 0;
        if (outstanding > 0)
          out.push({
            refId: s.id,
            refNo: s.voucherNo || s.tripRef || `SETT-${driverById.get(s.driverId)?.driverCode ?? ""}`,
            date: s.date.toISOString(),
            billAmt: Math.abs(Number(s.amount)),
            outstanding,
            tdsPct: 0,
            module: moduleLink,
          });
      }
    }
    }
    return out;
  });
}

export async function getAccountHeadOptions(): Promise<
  { value: string; label: string; meta?: string }[]
> {
  const session = requireSession();
  const heads = await withTenant(session.tenantId, (tx) =>
    tx.accountHead.findMany({ orderBy: { name: "asc" } })
  );
  return heads.map((h) => ({ value: h.id, label: h.name, meta: h.kind }));
}

/**
 * Open advances of a party for the voucher's Adjust Advance grid — strictly
 * the direction the voucher type may consume (Receipt adjusts advances
 * RECEIVED from the party, Payment adjusts advances PAID to the party), never
 * another party's and never a fully consumed one.
 */
export async function getOpenAdvances(input: {
  partyId: string;
  type: "RECEIPT" | "PAYMENT";
  voucherId?: string | null;
}): Promise<OpenAdvance[]> {
  const session = requireSession();
  return withTenant(session.tenantId, async (tx) => {
    const rows = await listOpenAdvances(tx, {
      firmId: session.firmId,
      partyId: input.partyId,
      kinds: [input.type === "RECEIPT" ? "RECEIVED" : "PAID"],
      includeRefType: "VOUCHER",
      includeRefId: input.voucherId ?? undefined,
    });
    // a voucher must not offer the advance it created itself
    return input.voucherId ? rows.filter((r) => r.voucherId !== input.voucherId) : rows;
  });
}

/** Open advance balances of a party (shown in the voucher form). */
export async function getPartyAdvanceInfo(
  partyId: string
): Promise<{ received: number; paid: number }> {
  const session = requireSession();
  const { partyAdvanceBalance } = await import("@/lib/party-advance");
  return withTenant(session.tenantId, async (tx) => ({
    received: await partyAdvanceBalance(tx, session.firmId, partyId, "RECEIVED"),
    paid: await partyAdvanceBalance(tx, session.firmId, partyId, "PAID"),
  }));
}
