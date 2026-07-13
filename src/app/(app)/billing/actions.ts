"use server";

import { z } from "zod";
import { requireSession } from "@/lib/session";
import { withTenant, type Tx } from "@/lib/db";
import { authorize } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { computeInvoice, parseBulkLrNumbers } from "@/lib/calc/invoice";
import { gstSplit, stateCodeFromGstin } from "@/lib/calc/gst";
import { round2 } from "@/lib/calc/tds";
import { toNum } from "@/lib/utils";
import type { InvoiceKind } from "@prisma/client";

// ---------------------------------------------------------------- types

export interface BillingPendingLr {
  id: string;
  lrNo: string;
  lrDate: string;
  source: string;
  dest: string;
  vehicle: string;
  qty: number;
  chargeWt: number;
  amount: number; // freight + charges
  poNumber: string;
  gateEntryNo: string;
}

export interface BillingDefaults {
  defaultBankPartyId: string | null;
  defaultTdsPct: number;
  firmStateCode: string | null;
  firmGstPct: number;
}

// ---------------------------------------------------------------- lookups

export async function getBillingDefaults(): Promise<BillingDefaults> {
  const session = requireSession();
  const firm = await withTenant(session.tenantId, (tx) =>
    tx.firm.findUnique({ where: { id: session.firmId } })
  );
  return {
    defaultBankPartyId: firm?.defaultBankPartyId ?? null,
    defaultTdsPct: firm ? toNum(String(firm.defaultTdsPct)) : 1,
    firmStateCode: stateCodeFromGstin(firm?.gstin),
    firmGstPct: firm
      ? toNum(String(firm.cgstPct)) + toNum(String(firm.sgstPct)) || toNum(String(firm.igstPct))
      : 0,
  };
}

export async function getPartyStateCode(partyId: string): Promise<string | null> {
  const session = requireSession();
  const party = await withTenant(session.tenantId, (tx) =>
    tx.party.findUnique({ where: { id: partyId } })
  );
  return stateCodeFromGstin(party?.gstin);
}

async function decorateLrs(
  tx: Tx,
  lrs: {
    id: string;
    lrNo: string;
    lrDate: Date;
    sourceCityId: string;
    destCityId: string;
    vehicleId: string | null;
    vehicleText: string | null;
    total: unknown;
    poNumber: string | null;
    gateEntryNo: string | null;
    items: { qty: unknown; chargeWt: unknown }[];
  }[]
): Promise<BillingPendingLr[]> {
  const cityIds = Array.from(new Set(lrs.flatMap((l) => [l.sourceCityId, l.destCityId])));
  const vehicleIds = Array.from(new Set(lrs.map((l) => l.vehicleId).filter(Boolean))) as string[];
  const [cities, vehicles] = [
    await tx.city.findMany({ where: { id: { in: cityIds } } }),
    await tx.vehicle.findMany({ where: { id: { in: vehicleIds } } }),
  ];
  const cmap = new Map(cities.map((c) => [c.id, c.name]));
  const vmap = new Map(vehicles.map((v) => [v.id, v.number]));
  return lrs.map((lr) => ({
    id: lr.id,
    lrNo: lr.lrNo,
    lrDate: lr.lrDate.toISOString(),
    source: cmap.get(lr.sourceCityId) ?? "",
    dest: cmap.get(lr.destCityId) ?? "",
    vehicle: (lr.vehicleId && vmap.get(lr.vehicleId)) || lr.vehicleText || "",
    qty: lr.items.reduce((s, i) => s + toNum(String(i.qty)), 0),
    chargeWt: lr.items.reduce((s, i) => s + toNum(String(i.chargeWt)), 0),
    amount: toNum(String(lr.total)),
    poNumber: lr.poNumber ?? "",
    gateEntryNo: lr.gateEntryNo ?? "",
  }));
}

function pendingWhere(session: { firmId: string; fyId: string }, kind: InvoiceKind, partyId: string) {
  return {
    firmId: session.firmId,
    fyId: session.fyId,
    deletedAt: null,
    lrType: kind === "PART_TRUCK" ? ("TBB" as const) : { not: "CANCELLED" as const },
    status: "DELIVERED" as const, // workflow: bill only after POD confirms delivery
    invoiceLrs: { none: {} },
    OR: [{ billToId: partyId }, { billToId: null, consignorId: partyId }],
  };
}

/** LRs of a party pending billing (not billed, no invoice link, not cancelled). */
export async function getPendingLrsForParty(
  partyId: string,
  kind: InvoiceKind
): Promise<BillingPendingLr[]> {
  const session = requireSession();
  return withTenant(session.tenantId, async (tx) => {
    const lrs = await tx.lr.findMany({
      where: pendingWhere(session, kind, partyId),
      include: { items: true },
      orderBy: { lrDate: "asc" },
    });
    return decorateLrs(tx, lrs);
  });
}

export interface BulkLrError {
  lrNo: string;
  reason: string;
  alreadyBilled?: boolean;
}

/** Resolve a bulk-pasted list of LR numbers against a party's pending LRs. */
export async function resolveBulkLrs(
  partyId: string,
  text: string,
  kind: InvoiceKind
): Promise<{ added: BillingPendingLr[]; errors: BulkLrError[] }> {
  const session = requireSession();
  const numbers = parseBulkLrNumbers(text);
  return withTenant(session.tenantId, async (tx) => {
    const added: BillingPendingLr[] = [];
    const errors: BulkLrError[] = [];
    for (const lrNo of numbers) {
      const lr = await tx.lr.findFirst({
        where: { firmId: session.firmId, fyId: session.fyId, lrNo, deletedAt: null },
        include: { items: true, invoiceLrs: true },
      });
      if (!lr) {
        errors.push({ lrNo, reason: `LR ${lrNo} not found.` });
        continue;
      }
      if (lr.invoiceLrs.length > 0 || lr.status === "BILLED") {
        errors.push({
          lrNo,
          alreadyBilled: true,
          reason: `Invoice for LR ${lrNo} has already been created.`,
        });
        continue;
      }
      const billedParty = lr.billToId ?? lr.consignorId;
      if (billedParty !== partyId) {
        errors.push({ lrNo, reason: `LR ${lrNo} belongs to a different party.` });
        continue;
      }
      if (lr.lrType === "CANCELLED") {
        errors.push({ lrNo, reason: `LR ${lrNo} is cancelled.` });
        continue;
      }
      if (lr.status !== "DELIVERED") {
        errors.push({
          lrNo,
          reason: `LR ${lrNo} is not delivered yet (status ${lr.status}). Complete chalan + POD first.`,
        });
        continue;
      }
      if (kind === "PART_TRUCK" && lr.lrType !== "TBB") {
        errors.push({ lrNo, reason: `LR ${lrNo} is not a TBB (to-be-billed) LR.` });
        continue;
      }
      const [row] = await decorateLrs(tx, [lr]);
      added.push(row);
    }
    return { added, errors };
  });
}

// ---------------------------------------------------------------- save

const chargeSchema = z.object({
  chargeType: z.string().min(1),
  description: z.string().optional(),
  amount: z.number(),
  relatedLrs: z.string().optional(),
  remarks: z.string().optional(),
});

const lineSchema = z.object({
  productName: z.string().min(1),
  description: z.string().optional(),
  uom: z.string().optional(),
  hsnCode: z.string().optional(),
  qty: z.number(),
  rate: z.number(),
  discountPct: z.number().default(0),
  gstPct: z.number().default(0),
});

const invoiceSchema = z.object({
  id: z.string().optional(),
  kind: z.enum(["PART_TRUCK", "FULL_TRUCK", "MANUAL", "GST"]),
  invoiceNo: z.string().trim().min(1, "Invoice number is required (manual entry)"),
  invoiceDate: z.string().min(1),
  dueDate: z.string().nullable().optional(),
  partyId: z.string().min(1, "Party is required"),
  consignorId: z.string().optional(), // GST invoice: partyId = consignee, consignorId extra
  bankPartyId: z.string().nullable().optional(),
  setBankDefault: z.boolean().optional(),
  tdsPct: z.number().default(0),
  remarks: z.string().optional(),
  subject: z.string().optional(),
  gstApplicable: z.boolean().default(false),
  gstPct: z.number().default(0),
  lrIds: z.array(z.string()).default([]),
  charges: z.array(chargeSchema).default([]),
  lines: z.array(lineSchema).default([]),
  advance: z.number().default(0),
  vehicleText: z.string().optional(),
  // GST extras
  placeOfSupply: z.string().optional(),
  supplyDate: z.string().nullable().optional(),
  transportMode: z.string().optional(),
  reverseCharge: z.boolean().default(false),
  tcsPct: z.number().default(0),
  freightExtra: z.number().default(0),
  othersExtra: z.number().default(0),
  narration: z.string().optional(),
});

export type SaveInvoiceInput = z.infer<typeof invoiceSchema>;

export async function saveInvoice(
  input: unknown
): Promise<{ ok: true; id: string } | { ok: false; error: string; alreadyBilledLr?: string }> {
  const session = requireSession();
  const parsed = invoiceSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;
  await authorize(session, "billing", data.id ? "edit" : "create");

  if ((data.kind === "PART_TRUCK" || data.kind === "FULL_TRUCK") && data.lrIds.length === 0) {
    return { ok: false, error: "Select at least one LR." };
  }
  if ((data.kind === "MANUAL" || data.kind === "GST") && data.lines.length === 0) {
    return { ok: false, error: "Add at least one line." };
  }

  try {
    return await withTenant(session.tenantId, async (tx) => {
      // unique invoice number per firm+fy+kind
      const dup = await tx.invoice.findFirst({
        where: {
          firmId: session.firmId,
          fyId: session.fyId,
          kind: data.kind,
          invoiceNo: data.invoiceNo,
          deletedAt: null,
          ...(data.id ? { id: { not: data.id } } : {}),
        },
      });
      if (dup) {
        return {
          ok: false as const,
          error: `Invoice number ${data.invoiceNo} already exists for this firm / financial year.`,
        };
      }

      const before = data.id
        ? await tx.invoice.findFirst({
            where: { id: data.id, firmId: session.firmId, deletedAt: null },
            include: { lrs: true },
          })
        : null;
      if (data.id && !before) return { ok: false as const, error: "Invoice not found." };
      const previousLrIds = before?.lrs.map((l) => l.lrId) ?? [];

      // validate LRs & duplicate billing (hard block)
      const lrs = data.lrIds.length
        ? await tx.lr.findMany({
            where: { id: { in: data.lrIds }, firmId: session.firmId, fyId: session.fyId, deletedAt: null },
            include: { items: true, invoiceLrs: true },
          })
        : [];
      if (lrs.length !== data.lrIds.length) {
        return { ok: false as const, error: "One or more selected LRs were not found." };
      }
      for (const lr of lrs) {
        const other = lr.invoiceLrs.find((il) => il.invoiceId !== data.id);
        if (other || (lr.status === "BILLED" && !previousLrIds.includes(lr.id))) {
          return {
            ok: false as const,
            alreadyBilledLr: lr.lrNo,
            error: `Invoice for LR ${lr.lrNo} has already been created.`,
          };
        }
      }

      // state codes for GST split
      const firm = await tx.firm.findUnique({ where: { id: session.firmId } });
      const party = await tx.party.findUnique({ where: { id: data.partyId } });
      if (!party) return { ok: false as const, error: "Party not found." };
      const supplierStateCode = stateCodeFromGstin(firm?.gstin);
      const recipientStateCode = stateCodeFromGstin(party.gstin);

      // ---- recompute (never trust client) ----
      let totals: {
        total: number;
        grandTotal: number;
        cgstAmt: number;
        sgstAmt: number;
        igstAmt: number;
        tdsAmt: number;
        netTotal: number;
        balance: number;
      };
      let tcsAmt = 0;
      let computedLines: {
        productName: string;
        description?: string;
        uom?: string;
        hsnCode?: string;
        qty: number;
        rate: number;
        total: number;
        discountPct: number;
        taxableValue: number;
        gstPct: number;
        cgstAmt: number;
        sgstAmt: number;
        igstAmt: number;
        amount: number;
      }[] = [];

      if (data.kind === "GST") {
        computedLines = data.lines.map((l) => {
          const total = round2(l.qty * l.rate);
          const taxableValue = round2(total * (1 - l.discountPct / 100));
          const gst = gstSplit({
            taxableValue,
            gstPct: l.gstPct,
            supplierStateCode,
            recipientStateCode,
          });
          return {
            ...l,
            total,
            taxableValue,
            cgstAmt: gst.cgst,
            sgstAmt: gst.sgst,
            igstAmt: gst.igst,
            amount: round2(taxableValue + gst.cgst + gst.sgst + gst.igst),
          };
        });
        const totTaxable = round2(computedLines.reduce((s, l) => s + l.taxableValue, 0));
        const cgstAmt = round2(computedLines.reduce((s, l) => s + l.cgstAmt, 0));
        const sgstAmt = round2(computedLines.reduce((s, l) => s + l.sgstAmt, 0));
        const igstAmt = round2(computedLines.reduce((s, l) => s + l.igstAmt, 0));
        const preTcs = round2(
          totTaxable + cgstAmt + sgstAmt + igstAmt + data.freightExtra + data.othersExtra
        );
        tcsAmt = round2((preTcs * data.tcsPct) / 100);
        const grandTotal = round2(preTcs + tcsAmt);
        totals = {
          total: round2(computedLines.reduce((s, l) => s + l.total, 0)),
          grandTotal,
          cgstAmt,
          sgstAmt,
          igstAmt,
          tdsAmt: 0,
          netTotal: grandTotal,
          balance: round2(grandTotal - data.advance),
        };
      } else {
        const baseAmounts =
          data.kind === "MANUAL"
            ? data.lines.map((l) => round2(l.qty * l.rate))
            : lrs.map((lr) => toNum(String(lr.total)));
        totals = computeInvoice({
          lrAmounts: baseAmounts,
          extraCharges: data.charges.map((c) => c.amount),
          gstApplicable: data.gstApplicable,
          gstPct: data.gstPct,
          supplierStateCode,
          recipientStateCode,
          tdsPct: data.tdsPct,
          advance: data.advance,
        });
        if (data.kind === "MANUAL") {
          computedLines = data.lines.map((l) => {
            const total = round2(l.qty * l.rate);
            return {
              ...l,
              total,
              taxableValue: total,
              cgstAmt: 0,
              sgstAmt: 0,
              igstAmt: 0,
              amount: total,
            };
          });
        }
      }

      const totalWt = lrs.reduce(
        (s, lr) => s + lr.items.reduce((a, i) => a + toNum(String(i.chargeWt)), 0),
        0
      );

      const invoiceData = {
        tenantId: session.tenantId,
        firmId: session.firmId,
        fyId: session.fyId,
        kind: data.kind,
        invoiceNo: data.invoiceNo,
        invoiceDate: new Date(data.invoiceDate),
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        partyId: data.partyId,
        lrTypeFilter: data.kind === "PART_TRUCK" ? ("TBB" as const) : null,
        remarks: data.remarks || null,
        subject: data.subject || null,
        bankPartyId: data.bankPartyId || null,
        gstApplicable: data.kind === "GST" ? true : data.gstApplicable,
        cgstPct: totals.cgstAmt > 0 ? data.gstPct / 2 : 0,
        cgstAmt: totals.cgstAmt,
        sgstPct: totals.sgstAmt > 0 ? data.gstPct / 2 : 0,
        sgstAmt: totals.sgstAmt,
        igstPct: totals.igstAmt > 0 ? data.gstPct : 0,
        igstAmt: totals.igstAmt,
        tdsPct: data.tdsPct,
        tdsAmt: totals.tdsAmt,
        total: totals.total,
        grandTotal: totals.grandTotal,
        netTotal: totals.netTotal,
        advance: data.advance,
        balance: totals.balance,
        totalWt: round2(totalWt),
        placeOfSupply: data.placeOfSupply || null,
        supplyDate: data.supplyDate ? new Date(data.supplyDate) : null,
        transportMode: data.transportMode || null,
        reverseCharge: data.reverseCharge,
        tcsPct: data.tcsPct,
        tcsAmt,
        freightExtra: data.freightExtra,
        othersExtra: data.othersExtra,
        narration: data.narration || null,
        vehicleText: data.vehicleText || null,
      };

      let invoiceId: string;
      if (data.id) {
        const updated = await tx.invoice.update({
          where: { id: data.id },
          data: invoiceData,
        });
        invoiceId = updated.id;
        await tx.invoiceLr.deleteMany({ where: { invoiceId } });
        await tx.invoiceCharge.deleteMany({ where: { invoiceId } });
        await tx.invoiceLine.deleteMany({ where: { invoiceId } });
        // revert LRs removed from the invoice
        const removed = previousLrIds.filter((id) => !data.lrIds.includes(id));
        for (const lrId of removed) {
          const hasPod = await tx.pod.findFirst({ where: { lrId } });
          await tx.lr.update({
            where: { id: lrId },
            data: { status: hasPod ? "DELIVERED" : "PENDING" },
          });
        }
        await audit(tx, session, {
          entity: "Invoice",
          entityId: invoiceId,
          action: "UPDATE",
          before,
          after: updated,
        });
      } else {
        const created = await tx.invoice.create({
          data: { ...invoiceData, createdById: session.userId },
        });
        invoiceId = created.id;
        await audit(tx, session, {
          entity: "Invoice",
          entityId: invoiceId,
          action: "CREATE",
          after: created,
        });
      }

      if (data.lrIds.length) {
        await tx.invoiceLr.createMany({
          data: data.lrIds.map((lrId) => ({ tenantId: session.tenantId, invoiceId, lrId })),
        });
        await tx.lr.updateMany({
          where: { id: { in: data.lrIds } },
          data: { status: "BILLED" },
        });
      }
      if (data.charges.length) {
        await tx.invoiceCharge.createMany({
          data: data.charges.map((c) => ({
            tenantId: session.tenantId,
            invoiceId,
            chargeType: c.chargeType,
            description: c.description || null,
            amount: c.amount,
            relatedLrs: c.relatedLrs || null,
            remarks: c.remarks || null,
          })),
        });
      }
      if (computedLines.length) {
        await tx.invoiceLine.createMany({
          data: computedLines.map((l) => ({
            tenantId: session.tenantId,
            invoiceId,
            productName: l.productName,
            description: l.description || null,
            uom: l.uom || null,
            hsnCode: l.hsnCode || null,
            qty: l.qty,
            rate: l.rate,
            total: l.total,
            discountPct: l.discountPct,
            taxableValue: l.taxableValue,
            gstPct: l.gstPct,
            cgstAmt: l.cgstAmt,
            sgstAmt: l.sgstAmt,
            igstAmt: l.igstAmt,
            amount: l.amount,
          })),
        });
      }

      if (data.setBankDefault && data.bankPartyId) {
        await tx.firm.update({
          where: { id: session.firmId },
          data: { defaultBankPartyId: data.bankPartyId },
        });
      }

      return { ok: true as const, id: invoiceId };
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Save failed";
    if (msg.includes("Unique constraint")) {
      return {
        ok: false,
        error: `Invoice number ${data.invoiceNo} already exists for this firm / financial year.`,
      };
    }
    return { ok: false, error: msg };
  }
}

// ---------------------------------------------------------------- delete

export async function deleteInvoice(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = requireSession();
  try {
    await authorize(session, "billing", "delete");
  } catch {
    return { ok: false, error: "Only ADMIN/OWNER may delete invoices." };
  }
  return withTenant(session.tenantId, async (tx) => {
    const invoice = await tx.invoice.findFirst({
      where: { id, firmId: session.firmId, deletedAt: null },
      include: { lrs: true },
    });
    if (!invoice) return { ok: false as const, error: "Invoice not found." };
    for (const il of invoice.lrs) {
      const hasPod = await tx.pod.findFirst({ where: { lrId: il.lrId } });
      await tx.lr.update({
        where: { id: il.lrId },
        data: { status: hasPod ? "DELIVERED" : "PENDING" },
      });
    }
    await tx.invoiceLr.deleteMany({ where: { invoiceId: id } });
    await tx.invoice.update({ where: { id }, data: { deletedAt: new Date() } });
    await audit(tx, session, {
      entity: "Invoice",
      entityId: id,
      action: "DELETE",
      before: invoice,
    });
    return { ok: true as const };
  });
}

// ---------------------------------------------------------------- edit load

export interface InvoiceEditPayload {
  id: string;
  kind: InvoiceKind;
  invoiceNo: string;
  invoiceDate: string;
  dueDate: string | null;
  partyId: string;
  bankPartyId: string | null;
  tdsPct: number;
  remarks: string;
  subject: string;
  gstApplicable: boolean;
  gstPct: number;
  advance: number;
  vehicleText: string;
  placeOfSupply: string;
  supplyDate: string | null;
  transportMode: string;
  reverseCharge: boolean;
  tcsPct: number;
  freightExtra: number;
  othersExtra: number;
  narration: string;
  lrs: BillingPendingLr[];
  charges: {
    chargeType: string;
    description: string;
    amount: number;
    relatedLrs: string;
    remarks: string;
  }[];
  lines: {
    productName: string;
    description: string;
    uom: string;
    hsnCode: string;
    qty: number;
    rate: number;
    discountPct: number;
    gstPct: number;
  }[];
}

export async function getInvoiceForEdit(id: string): Promise<InvoiceEditPayload | null> {
  const session = requireSession();
  return withTenant(session.tenantId, async (tx) => {
    const inv = await tx.invoice.findFirst({
      where: { id, firmId: session.firmId, deletedAt: null },
      include: { lrs: { include: { lr: { include: { items: true } } } }, charges: true, lines: true },
    });
    if (!inv) return null;
    const gstPct =
      toNum(String(inv.cgstPct)) + toNum(String(inv.sgstPct)) || toNum(String(inv.igstPct));
    return {
      id: inv.id,
      kind: inv.kind,
      invoiceNo: inv.invoiceNo,
      invoiceDate: inv.invoiceDate.toISOString(),
      dueDate: inv.dueDate ? inv.dueDate.toISOString() : null,
      partyId: inv.partyId,
      bankPartyId: inv.bankPartyId,
      tdsPct: toNum(String(inv.tdsPct)),
      remarks: inv.remarks ?? "",
      subject: inv.subject ?? "",
      gstApplicable: inv.gstApplicable,
      gstPct,
      advance: toNum(String(inv.advance)),
      vehicleText: inv.vehicleText ?? "",
      placeOfSupply: inv.placeOfSupply ?? "",
      supplyDate: inv.supplyDate ? inv.supplyDate.toISOString() : null,
      transportMode: inv.transportMode ?? "",
      reverseCharge: inv.reverseCharge,
      tcsPct: toNum(String(inv.tcsPct)),
      freightExtra: toNum(String(inv.freightExtra)),
      othersExtra: toNum(String(inv.othersExtra)),
      narration: inv.narration ?? "",
      lrs: await decorateLrs(
        tx,
        inv.lrs.map((il) => il.lr)
      ),
      charges: inv.charges.map((c) => ({
        chargeType: c.chargeType,
        description: c.description ?? "",
        amount: toNum(String(c.amount)),
        relatedLrs: c.relatedLrs ?? "",
        remarks: c.remarks ?? "",
      })),
      lines: inv.lines.map((l) => ({
        productName: l.productName,
        description: l.description ?? "",
        uom: l.uom ?? "",
        hsnCode: l.hsnCode ?? "",
        qty: toNum(String(l.qty)),
        rate: toNum(String(l.rate)),
        discountPct: toNum(String(l.discountPct)),
        gstPct: toNum(String(l.gstPct)),
      })),
    };
  });
}

// ---------------------------------------------------------------- bill submission

export async function searchInvoicesByNo(
  q: string
): Promise<{ id: string; invoiceNo: string; kind: InvoiceKind; partyId: string; partyName: string; invoiceDate: string }[]> {
  const session = requireSession();
  if (!q.trim()) return [];
  return withTenant(session.tenantId, async (tx) => {
    const invs = await tx.invoice.findMany({
      where: {
        firmId: session.firmId,
        fyId: session.fyId,
        deletedAt: null,
        invoiceNo: { contains: q.trim(), mode: "insensitive" },
      },
      take: 20,
      orderBy: { invoiceDate: "desc" },
    });
    const parties = await tx.party.findMany({
      where: { id: { in: Array.from(new Set(invs.map((i) => i.partyId))) } },
    });
    const pmap = new Map(parties.map((p) => [p.id, p.name]));
    return invs.map((i) => ({
      id: i.id,
      invoiceNo: i.invoiceNo,
      kind: i.kind,
      partyId: i.partyId,
      partyName: pmap.get(i.partyId) ?? "",
      invoiceDate: i.invoiceDate.toISOString(),
    }));
  });
}

const submissionSchema = z.object({
  invoiceId: z.string().nullable().optional(),
  billNo: z.string().min(1, "Bill number is required"),
  billDate: z.string().min(1, "Bill date is required"),
  partyId: z.string().nullable().optional(),
  receivedBy: z.string().optional(),
  deptName: z.string().optional(),
  submittedBy: z.string().optional(),
  docketNo: z.string().optional(),
  counterName: z.string().optional(),
  remarks: z.string().optional(),
});

export async function saveBillSubmission(
  input: unknown
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const session = requireSession();
  await authorize(session, "billing", "create");
  const parsed = submissionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;
  return withTenant(session.tenantId, async (tx) => {
    const created = await tx.billSubmission.create({
      data: {
        tenantId: session.tenantId,
        firmId: session.firmId,
        fyId: session.fyId,
        invoiceId: data.invoiceId || null,
        billNo: data.billNo,
        billDate: new Date(data.billDate),
        partyId: data.partyId || null,
        receivedBy: data.receivedBy || null,
        deptName: data.deptName || null,
        submittedBy: data.submittedBy || null,
        docketNo: data.docketNo || null,
        counterName: data.counterName || null,
        remarks: data.remarks || null,
      },
    });
    await audit(tx, session, {
      entity: "BillSubmission",
      entityId: created.id,
      action: "CREATE",
      after: created,
    });
    return { ok: true as const, id: created.id };
  });
}
