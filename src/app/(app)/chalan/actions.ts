"use server";

import { revalidatePath } from "next/cache";

import { z } from "zod";
import { requireSession } from "@/lib/session";
import { withTenant, Tx } from "@/lib/db";
import { authorize } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { syncSequenceTo } from "@/lib/sequences";
import { postLedger, reverseLedger } from "@/lib/ledger";
import { computeChalan } from "@/lib/calc/chalan";
import { toNum } from "@/lib/utils";
import type { PendingLrRow } from "@/components/fleet/lr-picker";

/** Pending LRs of a vehicle (no chalan yet, not cancelled). */
export async function getPendingLrsForVehicle(
  vehicleId: string,
  excludeChalanId?: string
): Promise<PendingLrRow[]> {
  const session = requireSession();
  const lrs = await withTenant(session.tenantId, (tx) =>
    tx.lr.findMany({
      where: {
        firmId: session.firmId,
        fyId: session.fyId,
        vehicleId,
        status: "PENDING",
        lrType: { notIn: ["CANCELLED", "PAPER_CHANGE"] },
        deletedAt: null,
        chalanLrs: excludeChalanId
          ? { none: { chalanId: { not: excludeChalanId } } }
          : { none: {} },
      },
      include: {
        items: true,
        chalanLrs: true,
      },
      orderBy: { lrDate: "asc" },
    })
  );
  const [cities, parties] = await withTenant(session.tenantId, (tx) =>
    Promise.all([tx.city.findMany(), tx.party.findMany()])
  );
  const cityName = (id: string) => cities.find((c) => c.id === id)?.name ?? "";
  const partyName = (id: string) => parties.find((p) => p.id === id)?.name ?? "";
  return lrs.map((lr) => ({
    id: lr.id,
    lrNo: lr.lrNo,
    lrDate: lr.lrDate.toISOString(),
    source: cityName(lr.sourceCityId),
    destination: cityName(lr.destCityId),
    consignor: partyName(lr.consignorId),
    qty: lr.items.reduce((s, i) => s + toNum(i.qty), 0),
    actualWt: lr.items.reduce((s, i) => s + toNum(i.actualWt), 0),
    chargeWt: lr.items.reduce((s, i) => s + toNum(i.chargeWt), 0),
    freight: toNum(lr.freight),
    rate: lr.items.length ? Math.max(...lr.items.map((i) => toNum(i.rate))) : 0,
    rateBasis: (lr.items.find((i) => toNum(i.rate) > 0)?.rateBasis ?? "CHARGE_WT") as
      | "QTY"
      | "ACTUAL_WT"
      | "CHARGE_WT"
      | "FIXED",
    remarks: lr.remarks ?? "",
  }));
}

/** Broker PAN + TDS mode for auto TDS pct. */
export async function getBrokerTdsInfo(partyId: string) {
  const session = requireSession();
  const p = await withTenant(session.tenantId, (tx) =>
    tx.party.findUnique({ where: { id: partyId } })
  );
  return { pan: p?.pan ?? null, tdsMode: p?.tdsMode ?? null };
}

const advanceSchema = z.object({
  type: z.enum(["CASH", "BANK", "DIESEL", "TOLL", "TYRE", "SPARE_PARTS", "REPAIR", "OTHER"]),
  supplierName: z.string().optional().nullable(),
  bankName: z.string().optional().nullable(),
  bankPartyId: z.string().optional().nullable(),
  dieselQty: z.number().optional().nullable(),
  dieselRate: z.number().optional().nullable(),
  amount: z.number().default(0),
  date: z.string().optional().nullable(),
  remarks: z.string().optional().nullable(),
});

const chalanSchema = z.object({
  id: z.string().optional().nullable(),
  chalanNo: z.string().min(1),
  chalanDate: z.string(),
  brokerId: z.string().min(1),
  vehicleId: z.string().min(1),
  driverName: z.string().optional().nullable(),
  driverMobile: z.string().optional().nullable(),
  licenseNo: z.string().optional().nullable(),
  payableAt: z.string().optional().nullable(),
  transportName: z.string().optional().nullable(),
  ownerName: z.string().optional().nullable(),
  remarks: z.string().optional().nullable(),
  lrIds: z.array(z.string()).min(1, "Select at least one LR — a chalan cannot be saved without LRs"),
  freight: z.number().default(0), // vehicle freight (manual fallback)
  rate: z.number().default(0),
  rateBasis: z.enum(["QTY", "ACTUAL_WT", "CHARGE_WT", "FIXED"]).default("CHARGE_WT"),
  detention: z.number().default(0),
  odcAmt: z.number().default(0),
  fineSlip: z.number().default(0),
  ldCharge: z.number().default(0),
  shortageAmt: z.number().default(0),
  otherAmt: z.number().default(0),
  otherRemarks: z.string().optional().nullable(),
  commissionPct: z.number().default(0),
  commissionAmt: z.number().default(0),
  mamool: z.number().default(0),
  courierCharge: z.number().default(0),
  tdsPct: z.number().default(0),
  // trip km
  startKm: z.number().optional().nullable(),
  unloadDate: z.string().optional().nullable(),
  unloadKm: z.number().optional().nullable(),
  unloadRemarks: z.string().optional().nullable(),
});

async function recomputeAndStore(
  tx: Tx,
  session: ReturnType<typeof requireSession>,
  data: z.infer<typeof chalanSchema>,
  advances: number[]
) {
  const lrs = await tx.lr.findMany({ where: { id: { in: data.lrIds } }, include: { items: true } });
  const blocked = lrs.find((l) => l.lrType === "CANCELLED" || l.lrType === "PAPER_CHANGE");
  if (blocked) {
    throw new Error(
      `LR ${blocked.lrNo} is ${blocked.lrType === "CANCELLED" ? "cancelled" : "a paper-change LR"} and cannot be loaded on a chalan.`
    );
  }
  const actualWt = lrs.reduce((s, l) => s + l.items.reduce((a, i) => a + toNum(i.actualWt), 0), 0);
  const chargeWt = lrs.reduce((s, l) => s + l.items.reduce((a, i) => a + toNum(i.chargeWt), 0), 0);
  const bookingFreight = lrs.reduce((s, l) => s + toNum(l.freight), 0);

  const totals = computeChalan({
    rate: data.rate,
    rateBasis: data.rateBasis,
    actualWt,
    chargeWt,
    manualFreight: data.rate > 0 ? 0 : data.freight,
    detention: data.detention,
    odcAmt: data.odcAmt,
    fineSlip: data.fineSlip,
    otherAmt: data.otherAmt,
    ldCharge: data.ldCharge,
    shortageAmt: data.shortageAmt,
    mamool: data.mamool,
    courierCharge: data.courierCharge,
    commissionPct: data.commissionPct,
    commissionAmt: data.commissionAmt,
    tdsPct: data.tdsPct,
    advances,
  });

  const startKm = data.startKm ?? null;
  const unloadKm = data.unloadKm ?? null;
  const unloadDate = data.unloadDate ? new Date(data.unloadDate) : null;
  const runningKm = startKm != null && unloadKm != null ? unloadKm - startKm : null;
  const tripDays =
    unloadDate != null
      ? Math.max(
          0,
          Math.round(
            (unloadDate.getTime() - new Date(data.chalanDate).getTime()) / 86400000
          )
        )
      : null;

  return {
    fields: {
      chalanNo: data.chalanNo,
      chalanDate: new Date(data.chalanDate),
      brokerId: data.brokerId,
      vehicleId: data.vehicleId,
      driverName: data.driverName ?? null,
      driverMobile: data.driverMobile ?? null,
      licenseNo: data.licenseNo ?? null,
      payableAt: data.payableAt ?? null,
      transportName: data.transportName || null,
      ownerName: data.ownerName || null,
      remarks: data.remarks ?? null,
      actualWt,
      chargeWt,
      freight: totals.freight,
      rate: data.rate,
      rateBasis: data.rateBasis,
      bookingFreight,
      detention: data.detention,
      odcAmt: data.odcAmt,
      fineSlip: data.fineSlip,
      ldCharge: data.ldCharge,
      shortageAmt: data.shortageAmt,
      mamool: data.mamool,
      courierCharge: data.courierCharge,
      commissionPct: data.commissionPct,
      commissionAmt: totals.commissionAmt,
      tdsPct: data.tdsPct,
      tdsAmt: totals.tdsAmt,
      otherAmt: data.otherAmt,
      otherRemarks: data.otherRemarks ?? null,
      totalChalanAmt: totals.totalChalanAmt,
      grandTotal: totals.grandTotal,
      advanceTotal: totals.advanceTotal,
      balance: totals.balance,
      startKm,
      unloadDate,
      unloadKm,
      runningKm,
      tripDays,
      unloadRemarks: data.unloadRemarks ?? null,
    },
  };
}

/** Step-1 save (draft) — creates or updates the chalan and its LR links. */
export async function saveChalan(input: unknown): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const session = requireSession();
  const parsed = chalanSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const data = parsed.data;
  await authorize(session, "chalan", data.id ? "edit" : "create");

  try {
    return await withTenant(session.tenantId, async (tx) => {
      const existing = data.id
        ? await tx.chalan.findFirst({
            where: { id: data.id, deletedAt: null },
            include: { advances: true },
          })
        : null;
      if (data.id && !existing) return { ok: false as const, error: "Chalan not found" };

      // duplicate chalan numbers are not allowed within a firm + financial year
      const clash = await tx.chalan.findFirst({
        where: {
          firmId: session.firmId,
          fyId: session.fyId,
          chalanNo: data.chalanNo,
          deletedAt: null,
          ...(data.id ? { id: { not: data.id } } : {}),
        },
        select: { id: true },
      });
      if (clash) {
        return { ok: false as const, error: `Chalan No ${data.chalanNo} already exists — use a different number.` };
      }

      const advances = existing?.advances.map((a) => toNum(a.amount)) ?? [];
      const { fields } = await recomputeAndStore(tx, session, data, advances);

      let id: string;
      if (existing) {
        await tx.chalan.update({ where: { id: existing.id }, data: fields });
        await tx.chalanLr.deleteMany({ where: { chalanId: existing.id } });
        id = existing.id;
      } else {
        const created = await tx.chalan.create({
          data: {
            tenantId: session.tenantId,
            firmId: session.firmId,
            fyId: session.fyId,
            createdById: session.userId,
            ...fields,
          },
        });
        id = created.id;
      }
      if (data.lrIds.length) {
        await tx.chalanLr.createMany({
          data: data.lrIds.map((lrId) => ({ tenantId: session.tenantId, chalanId: id, lrId })),
        });
      }
      await audit(tx, session, {
        entity: "Chalan",
        entityId: id,
        action: existing ? "UPDATE" : "CREATE",
        before: existing ?? undefined,
        after: fields,
      });
      return { ok: true as const, id };
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Save failed" };
  }
}

/** Replace advances for a chalan and recompute advance total / balance. */
export async function saveChalanAdvances(
  chalanId: string,
  input: unknown
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = requireSession();
  await authorize(session, "chalan", "edit");
  const parsed = z.array(advanceSchema).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid advances" };
  const rows = parsed.data;

  try {
    return await withTenant(session.tenantId, async (tx) => {
      const chalan = await tx.chalan.findFirst({ where: { id: chalanId, deletedAt: null } });
      if (!chalan) return { ok: false as const, error: "Chalan not found" };
      await tx.chalanAdvance.deleteMany({ where: { chalanId } });
      if (rows.length) {
        await tx.chalanAdvance.createMany({
          data: rows.map((r) => ({
            tenantId: session.tenantId,
            chalanId,
            type: r.type,
            supplierName: r.supplierName ?? null,
            bankName: r.bankName ?? null,
            bankPartyId: r.bankPartyId ?? null,
            dieselQty: r.dieselQty ?? null,
            dieselRate: r.dieselRate ?? null,
            amount: r.amount,
            date: r.date ? new Date(r.date) : null,
            remarks: r.remarks ?? null,
          })),
        });
      }
      const advanceTotal = rows.reduce((s, r) => s + r.amount, 0);
      const balance = toNum(chalan.grandTotal) - advanceTotal;
      await tx.chalan.update({ where: { id: chalanId }, data: { advanceTotal, balance } });

      // BANK advances hit the bank book: credit the bank account (money out),
      // debit the broker (advance recoverable against the chalan)
      await reverseLedger(tx, "CHALAN_ADVANCE", chalanId);
      const bankRows = rows.filter((r) => r.type === "BANK" && r.bankPartyId && r.amount > 0);
      await postLedger(
        tx,
        session,
        bankRows.flatMap((r) => {
          const date = r.date ? new Date(r.date) : chalan.chalanDate;
          const common = {
            date,
            refType: "CHALAN_ADVANCE",
            refId: chalanId,
            refNo: chalan.chalanNo,
            narration: `Bank advance against chalan ${chalan.chalanNo}${r.remarks ? " — " + r.remarks : ""}`,
          };
          return [
            { ...common, partyId: r.bankPartyId!, side: "CREDIT" as const, amount: r.amount },
            { ...common, partyId: chalan.brokerId, side: "DEBIT" as const, amount: r.amount },
          ];
        })
      );
      await audit(tx, session, {
        entity: "ChalanAdvance",
        entityId: chalanId,
        action: "UPDATE",
        after: rows,
      });
      return { ok: true as const };
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Save failed" };
  }
}

/** Final save: isFinal=true, LRs -> ON_CHALAN, sequence synced. */
export async function finalizeChalan(
  chalanId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = requireSession();
  await authorize(session, "chalan", "edit");
  try {
    return await withTenant(session.tenantId, async (tx) => {
      const chalan = await tx.chalan.findFirst({
        where: { id: chalanId, deletedAt: null },
        include: { lrs: true },
      });
      if (!chalan) return { ok: false as const, error: "Chalan not found" };
      await tx.chalan.update({ where: { id: chalanId }, data: { isFinal: true } });
      await tx.lr.updateMany({
        where: { id: { in: chalan.lrs.map((l) => l.lrId) } },
        data: { status: "ON_CHALAN" },
      });
      await syncSequenceTo(tx, {
        tenantId: session.tenantId,
        firmId: session.firmId,
        fyId: session.fyId,
        docType: "CHALAN",
        savedNumber: chalan.chalanNo,
      });
      await audit(tx, session, {
        entity: "Chalan",
        entityId: chalanId,
        action: "UPDATE",
        after: { isFinal: true },
      });
      return { ok: true as const };
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Finalize failed" };
  }
}

/** Soft delete (ADMIN/OWNER); releases linked LRs back to PENDING. */
export async function deleteChalan(
  chalanId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = requireSession();
  await authorize(session, "chalan", "delete");
  try {
    return await withTenant(session.tenantId, async (tx) => {
      const chalan = await tx.chalan.findFirst({
        where: { id: chalanId, deletedAt: null },
        include: { lrs: { include: { lr: { include: { invoiceLrs: true } } } } },
      });
      if (!chalan) return { ok: false as const, error: "Chalan not found" };

      // a billed LR must not be silently detached — the bill must go first
      const billed = chalan.lrs.find(
        (l) => l.lr.invoiceLrs.length > 0 || l.lr.status === "BILLED"
      );
      if (billed) {
        return {
          ok: false as const,
          error: `LR ${billed.lr.lrNo} is already billed. Delete its bill before deleting this chalan.`,
        };
      }

      const lrIds = chalan.lrs.map((l) => l.lrId);

      // cascade: remove PODs raised for these LRs (POD exists only via this
      // chalan's delivery), the chalan-LR links, and the ledger postings
      await tx.pod.deleteMany({ where: { lrId: { in: lrIds } } });
      await tx.chalanLr.deleteMany({ where: { chalanId } });
      await reverseLedger(tx, "CHALAN_ADVANCE", chalanId);
      await reverseLedger(tx, "CHALAN_BALANCE", chalanId);
      await tx.chalan.update({ where: { id: chalanId }, data: { deletedAt: new Date() } });

      // every associated LR returns to PENDING so it can be re-loaded onto a
      // new chalan (cancelled / paper-change LRs keep their type)
      await tx.lr.updateMany({
        where: {
          id: { in: lrIds },
          lrType: { notIn: ["CANCELLED", "PAPER_CHANGE"] },
        },
        data: { status: "PENDING" },
      });
      await audit(tx, session, {
        entity: "Chalan",
        entityId: chalanId,
        action: "DELETE",
        before: chalan,
      });
      return { ok: true as const };
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Delete failed" };
  }
}

// ---------------------------------------------------------------- balance payment

const balancePaymentSchema = z.object({
  chalanId: z.string().min(1),
  roundOff: z.number().default(0),
  shortage: z.number().min(0).default(0),
  paymentDate: z.string().min(1, "Payment date is required"),
  paymentHeadId: z.string().min(1, "Payment head (bank/cash) is required"),
  paymentMode: z.enum(["CASH", "BANK", "UPI", "CHEQUE", "NEFT_RTGS"]).default("BANK"),
  remarks: z.string().optional().nullable(),
});

/**
 * Settle a chalan's balance: chalan moves PENDING -> PAID, and the payment is
 * posted to the ledger (credit the bank/cash head, debit the broker) so the
 * bank/cash books and broker ledger update automatically.
 */
export async function saveBalancePayment(
  input: unknown
): Promise<{ ok: true; paidAmount: number } | { ok: false; error: string }> {
  const session = requireSession();
  await authorize(session, "chalan", "edit");
  const parsed = balancePaymentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;
  try {
    return await withTenant(session.tenantId, async (tx) => {
      const chalan = await tx.chalan.findFirst({
        where: { id: data.chalanId, firmId: session.firmId, deletedAt: null },
      });
      if (!chalan) return { ok: false as const, error: "Chalan not found." };
      if (!chalan.isFinal) {
        return { ok: false as const, error: "Finalize the chalan before settling its balance." };
      }
      // all attached LRs must have a confirmed POD before balance can be paid
      const links = await tx.chalanLr.findMany({
        where: { chalanId: chalan.id },
        include: { lr: { include: { pods: true } } },
      });
      const operational = links.filter(
        (l) => l.lr.lrType !== "CANCELLED" && l.lr.lrType !== "PAPER_CHANGE"
      );
      const podDone = operational.filter((l) => l.lr.pods.length > 0).length;
      if (operational.length > 0 && podDone < operational.length) {
        return {
          ok: false as const,
          error: `POD is only ${podDone}/${operational.length} confirmed — all LRs must have a confirmed POD before balance payment.`,
        };
      }
      const paidAmount =
        Math.round((toNum(chalan.balance) - data.roundOff - data.shortage) * 100) / 100;
      if (paidAmount < 0) {
        return { ok: false as const, error: "Round-off + shortage exceed the balance." };
      }
      const paymentDate = new Date(`${data.paymentDate}T00:00:00`);
      const after = await tx.chalan.update({
        where: { id: chalan.id },
        data: {
          paymentStatus: "PAID",
          balRoundOff: data.roundOff,
          balShortage: data.shortage,
          balPaidAmount: paidAmount,
          balPaymentDate: paymentDate,
          balPaymentHeadId: data.paymentHeadId,
          balPaymentMode: data.paymentMode,
          balRemarks: data.remarks || null,
        },
      });
      await reverseLedger(tx, "CHALAN_BALANCE", chalan.id);
      if (paidAmount > 0) {
        await postLedger(tx, session, [
          {
            date: paymentDate,
            partyId: data.paymentHeadId,
            side: "CREDIT",
            amount: paidAmount,
            refType: "CHALAN_BALANCE",
            refId: chalan.id,
            refNo: chalan.chalanNo,
            narration: `Balance payment for chalan ${chalan.chalanNo} (${data.paymentMode})`,
          },
          {
            date: paymentDate,
            partyId: chalan.brokerId,
            side: "DEBIT",
            amount: paidAmount,
            refType: "CHALAN_BALANCE",
            refId: chalan.id,
            refNo: chalan.chalanNo,
            narration: `Balance settled${data.remarks ? " — " + data.remarks : ""}`,
          },
        ]);
      }
      await audit(tx, session, {
        entity: "Chalan",
        entityId: chalan.id,
        action: "UPDATE",
        before: chalan,
        after,
      });
      revalidatePath("/chalan/register");
      return { ok: true as const, paidAmount };
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Balance payment failed" };
  }
}

// ---------------------------------------------------------------- chalan status

export interface ChalanStatusData {
  chalanNo: string;
  chalanDate: string;
  vehicle: string;
  transporter: string;
  owner: string;
  driverName: string;
  origin: string;
  destination: string;
  createdAt: string;
  isFinal: boolean;
  lrs: {
    lrNo: string;
    lrDate: string;
    consignor: string;
    consignee: string;
    qty: number;
    freight: number;
    status: string;
    billed: boolean;
    invoiceNo: string;
    invoiceDate: string | null;
    invoiceAmount: number;
    invoiceReceived: number;
    invoiceBalance: number;
    invoiceStatus: string; // Paid | Partially Paid | Pending | Not Billed
  }[];
  advances: {
    name: string;
    amount: number;
    date: string | null;
    mode: string;
    remarks: string;
  }[];
  advanceTotal: number;
  grandTotal: number;
  balance: number;
  paymentStatus: string;
  balPaidAmount: number;
  balPaymentDate: string | null;
  balPaymentMode: string;
  balRoundOff: number;
  balShortage: number;
  balRemarks: string;
  payments: {
    date: string;
    amount: number;
    account: string; // bank / cash head or broker
    side: string;
    refType: string;
    narration: string;
  }[];
}

/** Complete lifecycle of a chalan: LRs, per-LR billing, payments, history. */
export async function getChalanStatus(
  chalanId: string
): Promise<{ ok: true; data: ChalanStatusData } | { ok: false; error: string }> {
  const session = requireSession();
  return withTenant(session.tenantId, async (tx) => {
    const chalan = await tx.chalan.findFirst({
      where: { id: chalanId, firmId: session.firmId, deletedAt: null },
      include: {
        lrs: { include: { lr: { include: { items: true, invoiceLrs: { include: { invoice: true } } } } } },
        advances: true,
      },
    });
    if (!chalan) return { ok: false as const, error: "Chalan not found" };

    const [broker, vehicle, parties, cities, ledger] = await Promise.all([
      tx.party.findUnique({ where: { id: chalan.brokerId } }),
      tx.vehicle.findUnique({ where: { id: chalan.vehicleId } }),
      tx.party.findMany(),
      tx.city.findMany(),
      tx.ledgerEntry.findMany({
        where: { refId: chalanId, refType: { in: ["CHALAN_ADVANCE", "CHALAN_BALANCE"] } },
        orderBy: { date: "asc" },
      }),
    ]);
    const partyName = (id: string | null) =>
      id ? parties.find((p) => p.id === id)?.name ?? "" : "";
    const cityName = (id: string | null) =>
      id ? cities.find((c) => c.id === id)?.name ?? "" : "";

    const lrRows = chalan.lrs.map(({ lr }) => {
      const inv = lr.invoiceLrs[0]?.invoice ?? null;
      const invAmount = inv ? toNum(inv.netTotal) : 0;
      const invReceived = inv ? toNum(inv.advance) : 0;
      const invBalance = inv ? toNum(inv.balance) : 0;
      return {
        lrNo: lr.lrNo,
        lrDate: lr.lrDate.toISOString(),
        consignor: partyName(lr.consignorId),
        consignee: partyName(lr.consigneeId),
        qty: lr.items.reduce((s, i) => s + toNum(i.qty), 0),
        freight: toNum(lr.freight),
        status: lr.status,
        billed: !!inv,
        invoiceNo: inv?.invoiceNo ?? "",
        invoiceDate: inv ? inv.invoiceDate.toISOString() : null,
        invoiceAmount: invAmount,
        invoiceReceived: invReceived,
        invoiceBalance: invBalance,
        invoiceStatus: !inv
          ? "Not Billed"
          : invBalance <= 0
            ? "Paid"
            : invReceived > 0
              ? "Partially Paid"
              : "Pending",
      };
    });

    const sources = Array.from(new Set(chalan.lrs.map(({ lr }) => cityName(lr.sourceCityId)).filter(Boolean)));
    const dests = Array.from(new Set(chalan.lrs.map(({ lr }) => cityName(lr.destCityId)).filter(Boolean)));

    return {
      ok: true as const,
      data: {
        chalanNo: chalan.chalanNo,
        chalanDate: chalan.chalanDate.toISOString(),
        vehicle: vehicle?.number ?? "",
        transporter: chalan.transportName ?? broker?.transportName ?? "",
        owner: chalan.ownerName ?? broker?.name ?? "",
        driverName: chalan.driverName ?? "",
        origin: sources.join(", "),
        destination: dests.join(", "),
        createdAt: chalan.createdAt.toISOString(),
        isFinal: chalan.isFinal,
        lrs: lrRows,
        advances: chalan.advances.map((a) => ({
          name: a.bankName || a.supplierName || a.type.replace(/_/g, " "),
          amount: toNum(a.amount),
          date: a.date ? a.date.toISOString() : null,
          mode: a.type === "BANK" ? "Bank" : a.type === "CASH" ? "Cash" : a.type.replace(/_/g, " "),
          remarks: a.remarks ?? "",
        })),
        advanceTotal: toNum(chalan.advanceTotal),
        grandTotal: toNum(chalan.grandTotal),
        balance: toNum(chalan.balance),
        paymentStatus: chalan.paymentStatus,
        balPaidAmount: toNum(chalan.balPaidAmount),
        balPaymentDate: chalan.balPaymentDate ? chalan.balPaymentDate.toISOString() : null,
        balPaymentMode: chalan.balPaymentMode ?? "",
        balRoundOff: toNum(chalan.balRoundOff),
        balShortage: toNum(chalan.balShortage),
        balRemarks: chalan.balRemarks ?? "",
        payments: ledger.map((e) => ({
          date: e.date.toISOString(),
          amount: toNum(e.amount),
          account: partyName(e.partyId),
          side: e.side,
          refType: e.refType,
          narration: e.narration ?? "",
        })),
      },
    };
  });
}
