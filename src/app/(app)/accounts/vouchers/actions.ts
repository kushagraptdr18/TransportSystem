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

const allocationSchema = z.object({
  refId: z.string().min(1),
  refNo: z.string().min(1),
  /** per-row module — set when the grid runs in "All modules" mode */
  refType: z
    .enum(["BILLING", "GST_BILLING", "FREIGHT_CHALLAN", "BROKER_ENTRY", "LORRY_HIRE", "CASH_MEMO"])
    .nullish(),
  billAmt: z.number().min(0).default(0),
  tdsPct: z.number().min(0).default(0),
  tdsAmt: z.number().min(0).default(0),
  deduction: z.number().min(0).default(0),
  otherAmt: z.number().min(0).default(0),
  amount: z.number().min(0).default(0),
  remarks: z.string().nullish(),
});

const voucherSchema = z.object({
  id: z.string().nullish(),
  type: z.enum(["RECEIPT", "PAYMENT", "CONTRA", "JOURNAL"]),
  voucherNo: z.string().trim().min(1, "Voucher number is required"),
  voucherDate: z.string().min(1, "Date is required"), // ISO yyyy-mm-dd
  entryType: z.enum(["CASH", "BANK", "CONTRA"]).default("CASH"),
  moduleLink: z
    .enum([
      "BILLING",
      "LORRY_HIRE",
      "BROKER_ENTRY",
      "FREIGHT_CHALLAN",
      "CASH_MEMO",
      "GST_BILLING",
      "LR_ENTRY",
      "OTHERS",
    ])
    .default("OTHERS"),
  partyId: z.string().nullish(),
  vehicleId: z.string().nullish(),
  accountHeadId: z.string().nullish(),
  ledgerPosting: z.enum(["PARTY", "VEHICLE", "BOTH"]).default("PARTY"),
  bankPartyId: z.string().min(1, "Bank/Cash (or journal credit) account is required"),
  chequeNo: z.string().nullish(),
  chequeDate: z.string().nullish(),
  amount: z.number().min(0.01, "Amount is required"),
  tdsAmt: z.number().min(0).default(0),
  deduction: z.number().min(0).default(0),
  otherAmt: z.number().min(0).default(0),
  remarks: z.string().nullish(),
  allocations: z.array(allocationSchema).default([]),
  // central adjustment engine lines (shared by receipt / payment / journal)
  adjustments: z.array(adjustmentSchema).default([]),
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
  if (data.type === "JOURNAL" && !data.partyId) {
    return { ok: false, error: "Debit party is required for a journal voucher" };
  }
  if (data.type === "CONTRA" && data.adjustments.length > 0) {
    return { ok: false, error: "Adjustments are not applicable on contra vouchers" };
  }

  // never trust client totals — adjustments reduce the net like deductions
  const adjTotal = adjustmentsTotal(data.adjustments);
  const netAmount = round2(
    data.amount - data.tdsAmt - data.deduction + data.otherAmt - adjTotal
  );
  if (netAmount < 0) {
    return { ok: false, error: "Deductions + adjustments exceed the voucher amount" };
  }
  if (netAmount <= 0 && data.type !== "JOURNAL") {
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
        bankPartyId: data.bankPartyId,
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
        amount: a.amount,
        remarks: a.remarks || null,
      }));

      // ---- validation: never over-settle, never allocate beyond the voucher
      const allocatedSum = round2(data.allocations.reduce((s, a) => s + a.amount, 0));
      if (allocatedSum > data.amount + 0.01) {
        throw new Error(
          `Allocated ${allocatedSum} exceeds the voucher amount ${data.amount}.`
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
            const cs = await tx.chalan.findMany({ where: { id: { in: refIds } } });
            cs.forEach((c) => gross.set(c.id, Number(c.balance)));
          } else if (refType === "BROKER_ENTRY") {
            const ss = await tx.brokerSlip.findMany({ where: { id: { in: refIds } } });
            ss.forEach((s) => gross.set(s.id, Number(s.vBalance)));
          } else if (refType === "LORRY_HIRE") {
            const hs = await tx.hireSlip.findMany({ where: { id: { in: refIds } } });
            hs.forEach((h) => gross.set(h.id, Number(h.balance)));
          } else if (refType === "CASH_MEMO") {
            const ds = await tx.delivery.findMany({ where: { id: { in: refIds } } });
            ds.forEach((d2) => gross.set(d2.id, Number(d2.total)));
          }
          for (const r of rows) {
            const pending = round2((gross.get(r.refId) ?? Infinity) - (already.get(r.refId) ?? 0));
            const settle = round2(r.amount + r.tdsAmt + r.deduction);
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
      entries.push({ ...common, partyId: data.bankPartyId, side: bankSide, amount: netAmount });

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
        // legacy header deductions post to auto-created heads (TDS ledger etc.)
        const legacy: [string, number, "bank" | "counter"][] = [
          ["TDS", data.tdsAmt, "bank"],
          ["DEDUCTION", data.deduction, "bank"],
          ["OTHER CHARGES", data.otherAmt, "counter"],
        ];
        for (const [name, amt, dir] of legacy) {
          if (amt > 0) {
            const headId = await ensureAdjustmentHead(tx, session.tenantId, name);
            entries.push({
              ...common,
              accountHeadId: headId,
              side: dir === "bank" ? bankSide : counterSide,
              amount: round2(amt),
              narration: `${name} on ${data.type.toLowerCase()} voucher ${data.voucherNo}`,
            });
          }
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

      await postLedger(tx, session, entries);

      await syncSequenceTo(tx, {
        tenantId: session.tenantId,
        firmId: session.firmId,
        fyId: session.fyId,
        docType: DOC_TYPE_BY_VOUCHER[data.type as VoucherType],
        savedNumber: data.voucherNo,
      });

      // ---- automatic party advance (receive-as-advance / over-payment /
      // advance-payment / over-payment on payables) ----
      // Any unallocated remainder of a party receipt OR payment becomes an
      // advance balance for that party — no second voucher is ever needed.
      const advanceKind = data.type === "RECEIPT" ? "RECEIVED" : "PAID";
      if ((data.type === "RECEIPT" || data.type === "PAYMENT") && data.partyId && !data.accountHeadId) {
        const unallocated = round2(data.amount - allocatedSum);
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
      await reverseLedger(tx, "VOUCHER", id);
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

/** Sum of amounts already allocated to a set of refs (excluding a voucher being edited). */
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
    _sum: { amount: true },
  });
  return new Map(rows.map((r) => [r.refId, Number(r._sum.amount ?? 0)]));
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
}): Promise<AllocationCandidate[]> {
  const session = requireSession();
  const { partyId, voucherId } = input;
  const links: ModuleLink[] =
    input.moduleLink === "ALL"
      ? ["BILLING", "GST_BILLING", "FREIGHT_CHALLAN", "BROKER_ENTRY", "LORRY_HIRE", "CASH_MEMO"]
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
      const paid = await allocatedByRef(tx, moduleLink, chalans.map((c) => c.id), voucherId);
      for (const c of chalans) {
        const outstanding = round2(Number(c.balance) - (paid.get(c.id) ?? 0));
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
      const paid = await allocatedByRef(tx, moduleLink, slips.map((s) => s.id), voucherId);
      for (const s of slips) {
        const outstanding = round2(Number(s.vBalance) - (paid.get(s.id) ?? 0));
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
