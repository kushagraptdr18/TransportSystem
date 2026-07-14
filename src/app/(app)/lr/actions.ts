"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { requireSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { authorize } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { toNum } from "@/lib/utils";
import { nextLrNumber, syncSequenceTo } from "@/lib/sequences";
import { stateCodeFromGstin } from "@/lib/calc/gst";
import { computeLrTotals, itemAmount } from "@/components/lr/lr-calc";

const rateBasisSchema = z.enum(["QTY", "ACTUAL_WT", "CHARGE_WT", "FIXED"]);
const lrTypeSchema = z.enum(["TO_PAY", "TBB", "PAID", "FOC", "CANCELLED"]);

const itemSchema = z.object({
  productId: z.string().nullish(),
  productName: z.string().min(1, "Product is required"),
  description: z.string().nullish(),
  qty: z.number().min(0).default(0),
  actualWt: z.number().min(0).default(0),
  chargeWt: z.number().min(0).default(0),
  unit: z.string().default("MT"),
  rate: z.number().min(0).default(0),
  rateBasis: rateBasisSchema.default("CHARGE_WT"),
});

const lrSchema = z.object({
  id: z.string().nullish(),
  lrNo: z.string().trim().min(1, "LR number is required"),
  lrDate: z.string().min(1, "LR date is required"), // ISO yyyy-mm-dd
  refLrNo: z.string().nullish(),
  privateMarka: z.string().nullish(),
  isDummy: z.boolean().default(false),
  sourceCityId: z.string().min(1, "Source city is required"),
  destCityId: z.string().min(1, "Destination city is required"),
  consignorId: z.string().min(1, "Consignor is required"),
  consigneeId: z.string().min(1, "Consignee is required"),
  billToId: z.string().nullish(),
  vehicleId: z.string().nullish(),
  vehicleText: z.string().nullish(),
  ownerName: z.string().nullish(),
  deliveryAt: z.string().nullish(),
  remarks: z.string().nullish(),
  lrType: lrTypeSchema.default("TBB"),
  printFreight: z.boolean().default(true),
  gstApplicable: z.boolean().default(false),

  insCompany: z.string().nullish(),
  insPolicyNo: z.string().nullish(),
  insAmount: z.number().nullish(),

  invoiceNo: z.string().nullish(),
  obdNo: z.string().nullish(),
  refNo: z.string().nullish(),
  invoiceDate: z.string().nullish(),
  goodsValue: z.number().nullish(),
  ewayBillNo: z.string().nullish(),
  ewayExpiry: z.string().nullish(),

  freight: z.number().min(0).default(0),
  hamali: z.number().min(0).default(0),
  preBhada: z.number().min(0).default(0),
  biltyCharge: z.number().min(0).default(0),
  collCharge: z.number().min(0).default(0),
  cpc: z.number().min(0).default(0),
  otherCharge: z.number().min(0).default(0),
  advance: z.number().min(0).default(0),
  advanceBank: z.string().nullish(),

  items: z.array(itemSchema).min(1, "At least one item is required"),
});

export type SaveLrResult = { ok: true; id: string } | { ok: false; error: string };

function toDate(s: string): Date {
  return new Date(s.includes("T") ? s : `${s}T00:00:00`);
}

export async function saveLr(input: unknown): Promise<SaveLrResult> {
  const session = requireSession();
  const parsed = lrSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;
  await authorize(session, "lr", data.id ? "edit" : "create");

  try {
    const id = await withTenant(session.tenantId, async (tx) => {
      // firm GST config + party GSTINs for server-side recompute
      const [firm, consignor, consignee] = await Promise.all([
        tx.firm.findUniqueOrThrow({ where: { id: session.firmId } }),
        tx.party.findUniqueOrThrow({ where: { id: data.consignorId } }),
        tx.party.findUniqueOrThrow({ where: { id: data.consigneeId } }),
      ]);
      const igstPct = Number(firm.igstPct);
      const gstPct = igstPct > 0 ? igstPct : Number(firm.cgstPct) + Number(firm.sgstPct);

      const totals = computeLrTotals({
        freight: data.freight,
        hamali: data.hamali,
        preBhada: data.preBhada,
        biltyCharge: data.biltyCharge,
        collCharge: data.collCharge,
        cpc: data.cpc,
        otherCharge: data.otherCharge,
        gstApplicable: data.gstApplicable,
        gstPct,
        supplierStateCode: stateCodeFromGstin(consignor.gstin),
        recipientStateCode: stateCodeFromGstin(consignee.gstin),
        advance: data.advance,
      });

      let lrNo = data.lrNo;
      if (!data.id && !lrNo) {
        lrNo = await nextLrNumber(tx, { firmId: session.firmId, fyId: session.fyId });
      }

      const lrData = {
        lrNo,
        lrDate: toDate(data.lrDate),
        refLrNo: data.refLrNo || null,
        privateMarka: data.privateMarka || null,
        isDummy: data.isDummy,
        sourceCityId: data.sourceCityId,
        destCityId: data.destCityId,
        consignorId: data.consignorId,
        consigneeId: data.consigneeId,
        billToId: data.billToId || null,
        vehicleId: data.isDummy ? null : data.vehicleId || null,
        vehicleText: data.isDummy ? data.vehicleText || null : null,
        ownerName: data.ownerName || null,
        deliveryAt: data.deliveryAt || null,
        remarks: data.remarks || null,
        lrType: data.lrType,
        printFreight: data.printFreight,
        gstApplicable: data.gstApplicable,
        insCompany: data.insCompany || null,
        insPolicyNo: data.insPolicyNo || null,
        insAmount: data.insAmount ?? null,
        invoiceNo: data.invoiceNo || null,
        obdNo: data.obdNo || null,
        refNo: data.refNo || null,
        invoiceDate: data.invoiceDate ? toDate(data.invoiceDate) : null,
        goodsValue: data.goodsValue ?? null,
        ewayBillNo: data.ewayBillNo || null,
        ewayExpiry: data.ewayExpiry ? toDate(data.ewayExpiry) : null,
        freight: data.freight,
        hamali: data.hamali,
        preBhada: data.preBhada,
        biltyCharge: data.biltyCharge,
        collCharge: data.collCharge,
        cpc: data.cpc,
        otherCharge: data.otherCharge,
        total: totals.total,
        cgstAmt: totals.cgstAmt,
        sgstAmt: totals.sgstAmt,
        igstAmt: totals.igstAmt,
        advance: data.advance,
        advanceBank: data.advanceBank || null,
        grandTotal: totals.grandTotal,
      };

      const items = data.items.map((i) => ({
        tenantId: session.tenantId,
        productId: i.productId || null,
        productName: i.productName,
        description: i.description || null,
        qty: i.qty,
        actualWt: i.actualWt,
        chargeWt: i.chargeWt,
        unit: i.unit || "MT",
        rate: i.rate,
        rateBasis: i.rateBasis,
        amount: itemAmount(i),
      }));

      let savedId: string;
      if (data.id) {
        const before = await tx.lr.findUniqueOrThrow({
          where: { id: data.id },
          include: { items: true },
        });
        if (before.deletedAt) throw new Error("LR has been deleted");
        await tx.lrItem.deleteMany({ where: { lrId: data.id } });
        const updated = await tx.lr.update({
          where: { id: data.id },
          data: { ...lrData, items: { create: items } },
          include: { items: true },
        });
        savedId = updated.id;
        await audit(tx, session, {
          entity: "Lr",
          entityId: savedId,
          action: "UPDATE",
          before,
          after: updated,
        });
      } else {
        const created = await tx.lr.create({
          data: {
            tenantId: session.tenantId,
            firmId: session.firmId,
            fyId: session.fyId,
            createdById: session.userId,
            ...lrData,
            items: { create: items },
          },
          include: { items: true },
        });
        savedId = created.id;
        await audit(tx, session, {
          entity: "Lr",
          entityId: savedId,
          action: "CREATE",
          after: created,
        });
      }

      await syncSequenceTo(tx, {
        tenantId: session.tenantId,
        firmId: session.firmId,
        fyId: session.fyId,
        docType: "LR",
        savedNumber: lrNo,
      });

      return savedId;
    });

    revalidatePath("/lr/register");
    return { ok: true, id };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, error: "LR number already exists" };
    }
    return { ok: false, error: err instanceof Error ? err.message : "Failed to save LR" };
  }
}

export async function deleteLr(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = requireSession();
  if (session.role !== "ADMIN" && session.role !== "OWNER") {
    return { ok: false, error: "Only Admin/Owner may delete LRs" };
  }
  await authorize(session, "lr", "delete");
  try {
    await withTenant(session.tenantId, async (tx) => {
      const before = await tx.lr.findUniqueOrThrow({ where: { id } });
      // cascade: detach from every dependent module so the LR vanishes there too
      await tx.chalanLr.deleteMany({ where: { lrId: id } });
      await tx.invoiceLr.deleteMany({ where: { lrId: id } });
      await tx.pod.deleteMany({ where: { lrId: id } });
      await tx.lr.update({ where: { id }, data: { deletedAt: new Date() } });
      await audit(tx, session, { entity: "Lr", entityId: id, action: "DELETE", before });
    });
    revalidatePath("/lr/register");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to delete LR" };
  }
}

export interface LrLifecycle {
  booking: {
    lrNo: string;
    lrDate: string;
    status: string;
    lrType: string;
    route: string;
    consignor: string;
    consignee: string;
    vehicle: string;
    freight: number;
    grandTotal: number;
    items: string;
  };
  chalans: {
    chalanNo: string;
    chalanDate: string;
    broker: string;
    vehicle: string;
    driver: string;
    freight: number;
    unloadDate: string | null;
  }[];
  pods: {
    docNo: string;
    docDate: string;
    unloadDate: string | null;
    ackNo: string;
    recWt: number | null;
    shortageWt: number | null;
    status: string;
  }[];
  invoices: {
    invoiceNo: string;
    invoiceDate: string;
    kind: string;
    party: string;
    netTotal: number;
    balance: number;
  }[];
}

/** Complete lifecycle of one LR: booking -> chalan -> POD -> billing. */
export async function getLrLifecycle(id: string): Promise<LrLifecycle | null> {
  const session = requireSession();
  return withTenant(session.tenantId, async (tx) => {
    const lr = await tx.lr.findFirst({
      where: { id, firmId: session.firmId, deletedAt: null },
      include: {
        items: true,
        chalanLrs: { include: { chalan: true } },
        pods: true,
        invoiceLrs: { include: { invoice: true } },
      },
    });
    if (!lr) return null;
    const [cities, parties, vehicles] = await Promise.all([
      tx.city.findMany(),
      tx.party.findMany(),
      tx.vehicle.findMany(),
    ]);
    const cityName = (cid: string | null) => cities.find((c) => c.id === cid)?.name ?? "";
    const partyName = (pid: string | null) => parties.find((p) => p.id === pid)?.name ?? "";
    const vehicleNo = (vid: string | null) => vehicles.find((v) => v.id === vid)?.number ?? "";
    const n = (v: unknown) => toNum(String(v));
    return {
      booking: {
        lrNo: lr.lrNo,
        lrDate: lr.lrDate.toISOString(),
        status: lr.status,
        lrType: lr.lrType,
        route: `${cityName(lr.sourceCityId)} → ${cityName(lr.destCityId)}`,
        consignor: partyName(lr.consignorId),
        consignee: partyName(lr.consigneeId),
        vehicle: (lr.vehicleId && vehicleNo(lr.vehicleId)) || lr.vehicleText || "",
        freight: n(lr.freight),
        grandTotal: n(lr.grandTotal),
        items: lr.items.map((i) => i.productName).join(", "),
      },
      chalans: lr.chalanLrs.map(({ chalan }) => ({
        chalanNo: chalan.chalanNo,
        chalanDate: chalan.chalanDate.toISOString(),
        broker: partyName(chalan.brokerId),
        vehicle: vehicleNo(chalan.vehicleId),
        driver: chalan.driverName ?? "",
        freight: n(chalan.freight),
        unloadDate: chalan.unloadDate ? chalan.unloadDate.toISOString() : null,
      })),
      pods: lr.pods.map((pod) => ({
        docNo: pod.docNo,
        docDate: pod.docDate.toISOString(),
        unloadDate: pod.unloadDate ? pod.unloadDate.toISOString() : null,
        ackNo: pod.ackNo ?? "",
        recWt: pod.recWt == null ? null : n(pod.recWt),
        shortageWt: pod.shortageWt == null ? null : n(pod.shortageWt),
        status: pod.status,
      })),
      invoices: lr.invoiceLrs.map(({ invoice }) => ({
        invoiceNo: invoice.invoiceNo,
        invoiceDate: invoice.invoiceDate.toISOString(),
        kind: invoice.kind,
        party: partyName(invoice.partyId),
        netTotal: n(invoice.netTotal),
        balance: n(invoice.balance),
      })),
    };
  });
}
