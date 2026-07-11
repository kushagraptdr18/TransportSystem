"use server";

import { z } from "zod";
import { requireSession } from "@/lib/session";
import { withTenant, Tx } from "@/lib/db";
import { authorize } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { syncSequenceTo } from "@/lib/sequences";
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
        lrType: { not: "CANCELLED" },
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
  remarks: z.string().optional().nullable(),
  lrIds: z.array(z.string()),
  freight: z.number().default(0), // vehicle freight (manual)
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
  const actualWt = lrs.reduce((s, l) => s + l.items.reduce((a, i) => a + toNum(i.actualWt), 0), 0);
  const chargeWt = lrs.reduce((s, l) => s + l.items.reduce((a, i) => a + toNum(i.chargeWt), 0), 0);
  const bookingFreight = lrs.reduce((s, l) => s + toNum(l.freight), 0);

  const totals = computeChalan({
    rate: 0,
    rateBasis: "FIXED",
    actualWt,
    chargeWt,
    manualFreight: data.freight,
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
      remarks: data.remarks ?? null,
      actualWt,
      chargeWt,
      freight: totals.freight,
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
        include: { lrs: true },
      });
      if (!chalan) return { ok: false as const, error: "Chalan not found" };
      await tx.chalan.update({ where: { id: chalanId }, data: { deletedAt: new Date() } });
      await tx.lr.updateMany({
        where: { id: { in: chalan.lrs.map((l) => l.lrId) }, status: "ON_CHALAN" },
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
