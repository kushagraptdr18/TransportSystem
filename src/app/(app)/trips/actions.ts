"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { requireSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { authorize } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { nextDocNumber, syncSequenceTo } from "@/lib/sequences";
import { tripLegTotal, tripLegBalance } from "@/lib/calc/trip";

const TRIP_EXPENSE_CATEGORIES = [
  "DIESEL",
  "TOLL",
  "DRIVER_BATA",
  "LOADING",
  "UNLOADING",
  "PARKING",
  "POLICE_RTO",
  "MISC",
] as const;

const expenseSchema = z.object({
  category: z.enum(TRIP_EXPENSE_CATEGORIES),
  amount: z.number().min(0).default(0),
  remarks: z.string().nullish(),
  date: z.string().nullish(), // ISO yyyy-mm-dd
});

const tripSchema = z.object({
  id: z.string().nullish(),
  tripNo: z.string().trim().min(1, "Trip number is required"),
  tripDate: z.string().min(1, "Trip date is required"),
  returnDate: z.string().nullish(),
  vehicleId: z.string().min(1, "Vehicle is required"),
  vehicleType: z.string().nullish(),

  goingPartyId: z.string().nullish(),
  goingSourceCityId: z.string().nullish(),
  goingDestCityId: z.string().nullish(),
  gFreight: z.number().min(0).default(0),
  gHamali: z.number().min(0).default(0),
  gOthers: z.number().min(0).default(0),
  gDiesel: z.number().min(0).default(0),
  gDriverAdvance: z.number().min(0).default(0),
  gPartyAdvance: z.number().min(0).default(0),
  gOther: z.number().min(0).default(0),
  gBankName: z.string().nullish(),
  gRemarks: z.string().nullish(),

  returnPartyId: z.string().nullish(),
  returnSourceCityId: z.string().nullish(),
  returnDestCityId: z.string().nullish(),
  rFreight: z.number().min(0).default(0),
  rHamali: z.number().min(0).default(0),
  rOthers: z.number().min(0).default(0),
  rDiesel: z.number().min(0).default(0),
  rDriverAdvance: z.number().min(0).default(0),
  rPartyAdvance: z.number().min(0).default(0),
  rDetention: z.number().min(0).default(0),
  rBankName: z.string().nullish(),
  rRemarks: z.string().nullish(),

  expenses: z.array(expenseSchema).default([]),
});

function toDate(s: string): Date {
  return new Date(s.includes("T") ? s : `${s}T00:00:00`);
}

export type SaveResult = { ok: true; id: string } | { ok: false; error: string };

export async function saveTrip(input: unknown): Promise<SaveResult> {
  const session = requireSession();
  const parsed = tripSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;
  await authorize(session, "trips", data.id ? "edit" : "create");

  const gTotalFreight = tripLegTotal(data.gFreight, data.gHamali, data.gOthers);
  const gBalance = tripLegBalance(
    gTotalFreight,
    data.gDiesel,
    data.gDriverAdvance,
    data.gPartyAdvance,
    data.gOther
  );
  const rTotalFreight = tripLegTotal(data.rFreight, data.rHamali, data.rOthers);
  const rBalance = tripLegBalance(
    rTotalFreight,
    data.rDiesel,
    data.rDriverAdvance,
    data.rPartyAdvance,
    data.rDetention
  );

  try {
    const id = await withTenant(session.tenantId, async (tx) => {
      let tripNo = data.tripNo;
      if (!data.id && !tripNo) {
        tripNo = await nextDocNumber(tx, {
          tenantId: session.tenantId,
          firmId: session.firmId,
          fyId: session.fyId,
          docType: "TRIP",
        });
      }

      const tripData = {
        tripNo,
        tripDate: toDate(data.tripDate),
        returnDate: data.returnDate ? toDate(data.returnDate) : null,
        vehicleId: data.vehicleId,
        vehicleType: data.vehicleType || null,
        goingPartyId: data.goingPartyId || null,
        goingSourceCityId: data.goingSourceCityId || null,
        goingDestCityId: data.goingDestCityId || null,
        gFreight: data.gFreight,
        gHamali: data.gHamali,
        gOthers: data.gOthers,
        gTotalFreight,
        gDiesel: data.gDiesel,
        gDriverAdvance: data.gDriverAdvance,
        gPartyAdvance: data.gPartyAdvance,
        gOther: data.gOther,
        gBankName: data.gBankName || null,
        gBalance,
        gRemarks: data.gRemarks || null,
        returnPartyId: data.returnPartyId || null,
        returnSourceCityId: data.returnSourceCityId || null,
        returnDestCityId: data.returnDestCityId || null,
        rFreight: data.rFreight,
        rHamali: data.rHamali,
        rOthers: data.rOthers,
        rTotalFreight,
        rDiesel: data.rDiesel,
        rDriverAdvance: data.rDriverAdvance,
        rPartyAdvance: data.rPartyAdvance,
        rDetention: data.rDetention,
        rBankName: data.rBankName || null,
        rBalance,
        rRemarks: data.rRemarks || null,
      };

      const expenses = data.expenses
        .filter((e) => e.amount > 0 || e.remarks)
        .map((e) => ({
          tenantId: session.tenantId,
          category: e.category,
          amount: e.amount,
          remarks: e.remarks || null,
          date: e.date ? toDate(e.date) : null,
        }));

      let savedId: string;
      if (data.id) {
        const before = await tx.trip.findUniqueOrThrow({
          where: { id: data.id },
          include: { expenses: true },
        });
        if (before.deletedAt) throw new Error("Trip has been deleted");
        await tx.tripExpense.deleteMany({ where: { tripId: data.id } });
        const updated = await tx.trip.update({
          where: { id: data.id },
          data: { ...tripData, expenses: { create: expenses } },
          include: { expenses: true },
        });
        savedId = updated.id;
        await audit(tx, session, {
          entity: "Trip",
          entityId: savedId,
          action: "UPDATE",
          before,
          after: updated,
        });
      } else {
        const created = await tx.trip.create({
          data: {
            tenantId: session.tenantId,
            firmId: session.firmId,
            fyId: session.fyId,
            ...tripData,
            expenses: { create: expenses },
          },
          include: { expenses: true },
        });
        savedId = created.id;
        await audit(tx, session, {
          entity: "Trip",
          entityId: savedId,
          action: "CREATE",
          after: created,
        });
      }

      await syncSequenceTo(tx, {
        tenantId: session.tenantId,
        firmId: session.firmId,
        fyId: session.fyId,
        docType: "TRIP",
        savedNumber: tripNo,
      });

      return savedId;
    });

    revalidatePath("/trips/register");
    return { ok: true, id };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, error: "Trip number already exists" };
    }
    return { ok: false, error: err instanceof Error ? err.message : "Failed to save trip" };
  }
}

export async function deleteTrip(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = requireSession();
  if (session.role !== "ADMIN" && session.role !== "OWNER") {
    return { ok: false, error: "Only Admin/Owner may delete trips" };
  }
  await authorize(session, "trips", "delete");
  try {
    await withTenant(session.tenantId, async (tx) => {
      const before = await tx.trip.findUniqueOrThrow({ where: { id } });
      await tx.trip.update({ where: { id }, data: { deletedAt: new Date() } });
      await audit(tx, session, { entity: "Trip", entityId: id, action: "DELETE", before });
    });
    revalidatePath("/trips/register");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to delete trip" };
  }
}

export interface TripSource {
  kind: "LR" | "BROKER_SLIP";
  id: string;
  docNo: string;
  partyId: string | null;
  partyName: string | null;
  sourceCityId: string | null;
  sourceCity: string | null;
  destCityId: string | null;
  destCity: string | null;
  weight: number;
  freight: number;
  advance: number;
}

/** Matching LRs / broker slips for a vehicle on a date — used to prefill the going leg. */
export async function findTripSources(vehicleId: string, dateIso: string): Promise<TripSource[]> {
  const session = requireSession();
  const dayStart = toDate(dateIso);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  const range = { gte: dayStart, lt: dayEnd };

  return withTenant(session.tenantId, async (tx) => {
    const [lrs, slips, cities, parties] = await Promise.all([
      tx.lr.findMany({
        where: {
          firmId: session.firmId,
          fyId: session.fyId,
          vehicleId,
          lrDate: range,
          deletedAt: null,
        },
        include: { items: true },
      }),
      tx.brokerSlip.findMany({
        where: {
          firmId: session.firmId,
          fyId: session.fyId,
          vehicleId,
          slipDate: range,
          deletedAt: null,
        },
      }),
      tx.city.findMany(),
      tx.party.findMany(),
    ]);
    const cityName = new Map(cities.map((c) => [c.id, c.name]));
    const partyName = new Map(parties.map((p) => [p.id, p.name]));

    const out: TripSource[] = [];
    for (const lr of lrs) {
      out.push({
        kind: "LR",
        id: lr.id,
        docNo: lr.lrNo,
        partyId: lr.consignorId,
        partyName: partyName.get(lr.consignorId) ?? null,
        sourceCityId: lr.sourceCityId,
        sourceCity: cityName.get(lr.sourceCityId) ?? null,
        destCityId: lr.destCityId,
        destCity: cityName.get(lr.destCityId) ?? null,
        weight: lr.items.reduce((s, i) => s + Number(i.chargeWt), 0),
        freight: Number(lr.freight),
        advance: Number(lr.advance),
      });
    }
    for (const s of slips) {
      out.push({
        kind: "BROKER_SLIP",
        id: s.id,
        docNo: s.slipNo,
        partyId: s.partyId,
        partyName: s.partyId ? partyName.get(s.partyId) ?? null : null,
        sourceCityId: s.loadStationId,
        sourceCity: s.loadStationId ? cityName.get(s.loadStationId) ?? null : null,
        destCityId: s.destCityId,
        destCity: s.destCityId ? cityName.get(s.destCityId) ?? null : null,
        weight: Number(s.chargeWt),
        freight: Number(s.pFreight),
        advance: Number(s.pAdvance),
      });
    }
    return out;
  });
}
