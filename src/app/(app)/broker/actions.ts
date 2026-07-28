"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { requireSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { authorize } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { syncSequenceTo } from "@/lib/sequences";
import { postLedger, reverseLedger } from "@/lib/ledger";
import { toNum } from "@/lib/utils";
import {
  ADVANCE_TYPES,
  advanceAmount,
  computeBrokerSide,
  computeTripKm,
  sideAdvanceTotal,
  type BrokerAdvance,
} from "@/components/broker/broker-calc";

const rateBasisSchema = z.enum(["QTY", "ACTUAL_WT", "CHARGE_WT", "FIXED"]);

const advanceSchema = z.object({
  side: z.enum(["P", "V"]),
  type: z.enum(ADVANCE_TYPES),
  headKind: z.enum(["INCOME", "EXPENSE", "BANK", "CASH"]).nullish(),
  headId: z.string().nullish(),
  supplierName: z.string().nullish(),
  bankName: z.string().nullish(),
  dieselQty: z.number().min(0).nullish(),
  dieselRate: z.number().min(0).nullish(),
  amount: z.number().min(0).default(0),
  date: z.string().nullish(), // ISO yyyy-mm-dd
  remarks: z.string().nullish(),
});

const sideSchema = {
  rate: z.number().min(0).default(0),
  freight: z.number().min(0).default(0), // manual freight (editable)
  detention: z.number().min(0).default(0),
  odcAmt: z.number().min(0).default(0),
  fineAmt: z.number().min(0).default(0),
  ldCharge: z.number().min(0).default(0),
  shortageAmt: z.number().min(0).default(0),
  tdsPct: z.number().min(0).default(0),
  tdsAmt: z.number().min(0).default(0),
  commPct: z.number().min(0).default(0),
  commAmt: z.number().min(0).default(0),
  mamool: z.number().min(0).default(0),
  paymentCharge: z.number().min(0).default(0),
  remarks: z.string().nullish(),
};

const brokerSlipSchema = z.object({
  id: z.string().nullish(),
  slipNo: z.string().trim().min(1, "Slip number is required"),
  slipDate: z.string().min(1, "Slip date is required"), // ISO yyyy-mm-dd
  vehicleId: z.string().nullish(),
  transporterId: z.string().nullish(),
  loadStationId: z.string().nullish(),
  destCityId: z.string().nullish(),
  consignorId: z.string().nullish(),
  consigneeId: z.string().nullish(),
  lrNo: z.string().nullish(),
  lrDate: z.string().nullish(),
  ewbNo: z.string().nullish(),
  ewbDate: z.string().nullish(),
  productId: z.string().nullish(),
  productName: z.string().nullish(),
  qty: z.number().min(0).default(0),
  actualWt: z.number().min(0).default(0),
  chargeWt: z.number().min(0).default(0),
  unit: z.string().default("MT"),
  rateBasis: rateBasisSchema.default("CHARGE_WT"), // legacy shared basis
  pRateBasis: rateBasisSchema.default("CHARGE_WT"),
  vRateBasis: rateBasisSchema.default("CHARGE_WT"),

  // party side
  partyId: z.string().nullish(),
  p: z.object(sideSchema),

  // owner side
  ownerId: z.string().nullish(),
  ownerName: z.string().nullish(),
  v: z.object(sideSchema),

  advances: z.array(advanceSchema).default([]),

  // trip km
  startKm: z.number().min(0).nullish(),
  unloadDate: z.string().nullish(),
  unloadKm: z.number().min(0).nullish(),
  unloadRemarks: z.string().nullish(),
});

export type SaveBrokerSlipResult = { ok: true; id: string } | { ok: false; error: string };

function toDate(s: string): Date {
  return new Date(s.includes("T") ? s : `${s}T00:00:00`);
}

export async function saveBrokerSlip(input: unknown): Promise<SaveBrokerSlipResult> {
  const session = requireSession();
  const parsed = brokerSlipSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;
  await authorize(session, "broker", data.id ? "edit" : "create");

  // never trust client totals — recompute everything server-side
  const advances: BrokerAdvance[] = data.advances.map((a) => ({
    ...a,
    amount: advanceAmount(a as BrokerAdvance),
  }));
  const pAdvance = sideAdvanceTotal(advances, "P");
  const vAdvance = sideAdvanceTotal(advances, "V");

  const base = {
    qty: data.qty,
    actualWt: data.actualWt,
    chargeWt: data.chargeWt,
  };
  const pTotals = computeBrokerSide({
    ...base,
    rateBasis: data.pRateBasis,
    rate: data.p.rate,
    manualFreight: data.p.freight,
    detention: data.p.detention,
    odcAmt: data.p.odcAmt,
    fineAmt: data.p.fineAmt,
    ldCharge: data.p.ldCharge,
    shortageAmt: data.p.shortageAmt,
    tdsPct: data.p.tdsPct,
    tdsAmtManual: data.p.tdsAmt,
    commPct: data.p.commPct,
    commAmtManual: data.p.commAmt,
    mamool: data.p.mamool,
    paymentCharge: data.p.paymentCharge,
    advance: pAdvance,
  });
  const vTotals = computeBrokerSide({
    ...base,
    rateBasis: data.vRateBasis,
    rate: data.v.rate,
    manualFreight: data.v.freight,
    detention: data.v.detention,
    odcAmt: data.v.odcAmt,
    fineAmt: data.v.fineAmt,
    ldCharge: data.v.ldCharge,
    shortageAmt: data.v.shortageAmt,
    tdsPct: data.v.tdsPct,
    tdsAmtManual: data.v.tdsAmt,
    commPct: data.v.commPct,
    commAmtManual: data.v.commAmt,
    mamool: data.v.mamool,
    paymentCharge: data.v.paymentCharge,
    advance: vAdvance,
  });

  const slipDate = toDate(data.slipDate);
  const unloadDate = data.unloadDate ? toDate(data.unloadDate) : null;
  const km = computeTripKm({
    startKm: data.startKm ?? null,
    unloadKm: data.unloadKm ?? null,
    slipDate,
    unloadDate,
  });

  const slipData = {
    slipNo: data.slipNo,
    slipDate,
    vehicleId: data.vehicleId || null,
    transporterId: data.transporterId || null,
    loadStationId: data.loadStationId || null,
    destCityId: data.destCityId || null,
    consignorId: data.consignorId || null,
    consigneeId: data.consigneeId || null,
    lrNo: data.lrNo || null,
    lrDate: data.lrDate ? toDate(data.lrDate) : null,
    ewbNo: data.ewbNo || null,
    ewbDate: data.ewbDate ? toDate(data.ewbDate) : null,
    productId: data.productId || null,
    productName: data.productName || null,
    qty: data.qty,
    actualWt: data.actualWt,
    chargeWt: data.chargeWt,
    unit: data.unit || "MT",
    rateBasis: data.rateBasis,
    pRateBasis: data.pRateBasis,
    vRateBasis: data.vRateBasis,

    // the receivable side IS the broker selected in the slip header —
    // no separate party selection (falls back to any legacy partyId)
    partyId: data.transporterId || data.partyId || null,
    pRate: data.p.rate,
    pFreight: pTotals.freight,
    pDetention: data.p.detention,
    pOdcAmt: data.p.odcAmt,
    pFineSlip: data.p.fineAmt,
    pLdCharge: data.p.ldCharge,
    pShortageAmt: data.p.shortageAmt,
    pTdsPct: data.p.tdsPct,
    pTdsAmt: pTotals.tdsAmt,
    pCommPct: data.p.commPct,
    pCommAmt: pTotals.commAmt,
    pMamool: data.p.mamool,
    pPaymentCharge: data.p.paymentCharge,
    pChalanAmt: pTotals.chalanAmt,
    pNetAmt: pTotals.netAmt,
    pAdvance,
    pBalance: pTotals.balance,
    pRemarks: data.p.remarks || null,

    ownerId: data.ownerId || null,
    ownerName: data.ownerName || null,
    vRate: data.v.rate,
    vFreight: vTotals.freight,
    vDetention: data.v.detention,
    vOdcAmt: data.v.odcAmt,
    vFineAmt: data.v.fineAmt,
    vLdCharge: data.v.ldCharge,
    vShortageAmt: data.v.shortageAmt,
    vTdsPct: data.v.tdsPct,
    vTdsAmt: vTotals.tdsAmt,
    vCommPct: data.v.commPct,
    vCommAmt: vTotals.commAmt,
    vMamool: data.v.mamool,
    vPaymentAmt: data.v.paymentCharge,
    vChalanAmt: vTotals.chalanAmt,
    vNetAmt: vTotals.netAmt,
    vAdvance,
    vBalance: vTotals.balance,
    vRemarks: data.v.remarks || null,

    advances: advances as unknown as Prisma.InputJsonValue,

    startKm: data.startKm ?? null,
    unloadDate,
    unloadKm: data.unloadKm ?? null,
    runningKm: km.runningKm,
    tripDays: km.tripDays,
    unloadRemarks: data.unloadRemarks || null,
  };

  try {
    const id = await withTenant(session.tenantId, async (tx) => {
      let savedId: string;
      if (data.id) {
        const before = await tx.brokerSlip.findUniqueOrThrow({ where: { id: data.id } });
        if (before.deletedAt) throw new Error("Broker slip has been deleted");
        const updated = await tx.brokerSlip.update({ where: { id: data.id }, data: slipData });
        savedId = updated.id;
        await audit(tx, session, {
          entity: "BrokerSlip",
          entityId: savedId,
          action: "UPDATE",
          before,
          after: updated,
        });
      } else {
        const created = await tx.brokerSlip.create({
          data: {
            tenantId: session.tenantId,
            firmId: session.firmId,
            fyId: session.fyId,
            createdById: session.userId,
            ...slipData,
          },
        });
        savedId = created.id;
        await audit(tx, session, {
          entity: "BrokerSlip",
          entityId: savedId,
          action: "CREATE",
          after: created,
        });
      }

      await syncSequenceTo(tx, {
        tenantId: session.tenantId,
        firmId: session.firmId,
        fyId: session.fyId,
        docType: "BROKER_SLIP",
        savedNumber: data.slipNo,
      });

      return savedId;
    });

    revalidatePath("/broker/register");
    return { ok: true, id };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, error: "Slip number already exists" };
    }
    return { ok: false, error: err instanceof Error ? err.message : "Failed to save broker slip" };
  }
}

export async function deleteBrokerSlip(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = requireSession();
  if (session.role !== "ADMIN" && session.role !== "OWNER") {
    return { ok: false, error: "Only Admin/Owner may delete broker slips" };
  }
  await authorize(session, "broker", "delete");
  try {
    await withTenant(session.tenantId, async (tx) => {
      const before = await tx.brokerSlip.findUniqueOrThrow({ where: { id } });
      await tx.brokerSlip.update({ where: { id }, data: { deletedAt: new Date() } });
      await reverseLedger(tx, "BROKER_SLIP_RECEIVED", id);
      await reverseLedger(tx, "BROKER_SLIP_PAID", id);
      await audit(tx, session, { entity: "BrokerSlip", entityId: id, action: "DELETE", before });
    });
    revalidatePath("/broker/register");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to delete broker slip",
    };
  }
}

// ------------------------------------------------------------- POD attached flag

/**
 * Informational only: marks that the POD has been handed over / shared.
 * Not linked to unload date, POD workflow, billing or payments.
 */
export async function setBrokerSlipPodAttached(
  id: string,
  attached: boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = requireSession();
  await authorize(session, "broker", "edit");
  try {
    await withTenant(session.tenantId, async (tx) => {
      const before = await tx.brokerSlip.findFirst({ where: { id, deletedAt: null } });
      if (!before) throw new Error("Broker slip not found");
      await tx.brokerSlip.update({ where: { id }, data: { podAttached: attached } });
      await audit(tx, session, {
        entity: "BrokerSlip",
        entityId: id,
        action: "UPDATE",
        before,
        after: { podAttached: attached },
      });
    });
    revalidatePath("/broker/register");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Update failed" };
  }
}

// ------------------------------------------------------------- balance received / paid

const brokerBalancePaymentSchema = z.object({
  slipId: z.string().min(1),
  /** P = broker/party side (balance RECEIVED), V = owner side (balance PAID) */
  side: z.enum(["P", "V"]),
  roundOff: z.number().default(0),
  shortage: z.number().min(0).default(0),
  paymentDate: z.string().min(1, "Payment date is required"),
  paymentHeadId: z.string().min(1, "Payment head (bank/cash) is required"),
  paymentMode: z.enum(["CASH", "BANK", "UPI", "CHEQUE", "NEFT_RTGS"]).default("BANK"),
  remarks: z.string().optional().nullable(),
});

/**
 * Settle a broker slip balance — mirrors the chalan balance payment (same
 * ledger behaviour), but with NO dependency on POD status / POD attached:
 * - side P: balance received from the broker/party — money IN
 *   (debit the bank/cash head, credit the party)
 * - side V: balance paid to the owner — money OUT
 *   (credit the bank/cash head, debit the owner party)
 */
export async function saveBrokerBalancePayment(
  input: unknown
): Promise<{ ok: true; paidAmount: number } | { ok: false; error: string }> {
  const session = requireSession();
  await authorize(session, "broker", "edit");
  const parsed = brokerBalancePaymentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;
  try {
    return await withTenant(session.tenantId, async (tx) => {
      const slip = await tx.brokerSlip.findFirst({
        where: { id: data.slipId, firmId: session.firmId, deletedAt: null },
      });
      if (!slip) return { ok: false as const, error: "Broker slip not found." };

      const balance = toNum(String(data.side === "P" ? slip.pBalance : slip.vBalance));
      const paidAmount = Math.round((balance - data.roundOff - data.shortage) * 100) / 100;
      if (paidAmount < 0) {
        return { ok: false as const, error: "Round-off + shortage exceed the balance." };
      }
      const paymentDate = new Date(`${data.paymentDate}T00:00:00`);
      const refType = data.side === "P" ? "BROKER_SLIP_RECEIVED" : "BROKER_SLIP_PAID";
      const counterPartyId = data.side === "P" ? slip.partyId : slip.ownerId;

      const fields =
        data.side === "P"
          ? {
              pPaymentStatus: "RECEIVED",
              pRoundOff: data.roundOff,
              pShortage: data.shortage,
              pPaidAmount: paidAmount,
              pPaymentDate: paymentDate,
              pPaymentHeadId: data.paymentHeadId,
              pPaymentMode: data.paymentMode,
              pPaymentRemarks: data.remarks || null,
            }
          : {
              vPaymentStatus: "PAID",
              vRoundOff: data.roundOff,
              vShortage: data.shortage,
              vPaidAmount: paidAmount,
              vPaymentDate: paymentDate,
              vPaymentHeadId: data.paymentHeadId,
              vPaymentMode: data.paymentMode,
              vPaymentRemarks: data.remarks || null,
            };
      const after = await tx.brokerSlip.update({ where: { id: slip.id }, data: fields });

      await reverseLedger(tx, refType, slip.id);
      if (paidAmount > 0) {
        const common = {
          date: paymentDate,
          refType,
          refId: slip.id,
          refNo: slip.slipNo,
        };
        await postLedger(tx, session, [
          {
            ...common,
            partyId: data.paymentHeadId,
            // money in on receive (debit head), money out on pay (credit head)
            side: data.side === "P" ? ("DEBIT" as const) : ("CREDIT" as const),
            amount: paidAmount,
            narration:
              data.side === "P"
                ? `Balance received against broker slip ${slip.slipNo} (${data.paymentMode})`
                : `Balance paid against broker slip ${slip.slipNo} (${data.paymentMode})`,
          },
          ...(counterPartyId
            ? [
                {
                  ...common,
                  partyId: counterPartyId,
                  side: data.side === "P" ? ("CREDIT" as const) : ("DEBIT" as const),
                  amount: paidAmount,
                  narration: `Broker slip ${slip.slipNo} balance ${
                    data.side === "P" ? "received" : "paid"
                  }${data.remarks ? " — " + data.remarks : ""}`,
                },
              ]
            : []),
        ]);
      }
      await audit(tx, session, {
        entity: "BrokerSlip",
        entityId: slip.id,
        action: "UPDATE",
        before: slip,
        after,
      });
      revalidatePath("/broker/register");
      return { ok: true as const, paidAmount };
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Balance payment failed" };
  }
}

// ------------------------------------------------------------- POD file upload

/** Attach an uploaded POD file to a broker slip (file already stored via /api/uploads/pod). */
export async function setBrokerSlipPodFile(
  id: string,
  filePath: string,
  fileName: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = requireSession();
  await authorize(session, "broker", "edit");
  if (!filePath.startsWith(`${session.tenantId}/`)) {
    return { ok: false, error: "Invalid file path." };
  }
  try {
    await withTenant(session.tenantId, async (tx) => {
      const before = await tx.brokerSlip.findFirst({ where: { id, deletedAt: null } });
      if (!before) throw new Error("Broker slip not found");
      await tx.brokerSlip.update({
        where: { id },
        data: {
          podFilePath: filePath,
          podFileName: fileName,
          podUploadDate: new Date(),
          podAttached: true,
        },
      });
      await audit(tx, session, {
        entity: "BrokerSlip",
        entityId: id,
        action: "UPDATE",
        before,
        after: { podFilePath: filePath, podFileName: fileName },
      });
    });
    revalidatePath("/broker/register");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Upload failed" };
  }
}
