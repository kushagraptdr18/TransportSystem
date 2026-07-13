"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { RateBasis } from "@prisma/client";
import { requireSession } from "@/lib/session";
import { authorize } from "@/lib/authz";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { actionError, zodError, type ActionResult } from "../_lib/util";

const basis = z.nativeEnum(RateBasis);

const schema = z.object({
  id: z.string().optional(),
  partyId: z.string().min(1, "Party is required"),
  productId: z.string().nullable().optional(),
  sourceCityId: z.string().min(1, "Source city is required"),
  destCityId: z.string().min(1, "Destination city is required"),
  rate: z.coerce.number().default(0),
  rateBasis: basis.default("CHARGE_WT"),
  hamali: z.coerce.number().default(0),
  hamaliBasis: basis.default("FIXED"),
  preBhada: z.coerce.number().default(0),
  preBhadaBasis: basis.default("FIXED"),
  dCharge: z.coerce.number().default(0),
  dChargeBasis: basis.default("FIXED"),
  stationery: z.coerce.number().default(0),
  stationeryBasis: basis.default("FIXED"),
  crossing: z.coerce.number().default(0),
  crossingBasis: basis.default("FIXED"),
});

export async function saveRate(input: unknown): Promise<ActionResult> {
  const session = requireSession();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return zodError(parsed.error);
  const data = parsed.data;
  await authorize(session, "masters", data.id ? "edit" : "create");
  try {
    const id = await withTenant(session.tenantId, async (tx) => {
      const { id: rowId, ...values } = data;
      const payload = { ...values, productId: values.productId || null };
      if (rowId) {
        const before = await tx.rateMaster.findUniqueOrThrow({ where: { id: rowId } });
        const row = await tx.rateMaster.update({ where: { id: rowId }, data: payload });
        await audit(tx, session, { entity: "RateMaster", entityId: row.id, action: "UPDATE", before, after: row });
        return row.id;
      }
      const row = await tx.rateMaster.create({ data: { tenantId: session.tenantId, ...payload } });
      await audit(tx, session, { entity: "RateMaster", entityId: row.id, action: "CREATE", after: row });
      return row.id;
    });
    revalidatePath("/masters/rates");
    return { ok: true, id };
  } catch (e) {
    return actionError(e);
  }
}

export async function deleteRate(id: string): Promise<ActionResult> {
  const session = requireSession();
  await authorize(session, "masters", "delete");
  try {
    await withTenant(session.tenantId, async (tx) => {
      const before = await tx.rateMaster.findUniqueOrThrow({ where: { id } });
      await tx.rateMaster.delete({ where: { id } });
      await audit(tx, session, { entity: "RateMaster", entityId: id, action: "DELETE", before });
    });
    revalidatePath("/masters/rates");
    return { ok: true, id };
  } catch (e) {
    return actionError(e);
  }
}

export interface RateImportResult {
  ok: boolean;
  created: number;
  updated: number;
  errors: string[];
}

const BASIS_ALIASES: Record<string, RateBasis> = {
  QTY: "QTY",
  QUANTITY: "QTY",
  ACTUAL: "ACTUAL_WT",
  ACTUAL_WT: "ACTUAL_WT",
  "ACTUAL WT": "ACTUAL_WT",
  CHARGE: "CHARGE_WT",
  CHARGE_WT: "CHARGE_WT",
  "CHARGE WT": "CHARGE_WT",
  FIXED: "FIXED",
};

/**
 * Import rates from an .xlsx file. Expected headers in row 1 (case-insensitive):
 * Party | Product | Source | Destination | Rate | Basis | Hamali | Pre Bhada |
 * D Charge | Stationery | Crossing. Party, Source, Destination, Rate required;
 * names are matched against master records — unknown names are reported, not created.
 */
export async function importRatesFromExcel(formData: FormData): Promise<RateImportResult> {
  const session = requireSession();
  await authorize(session, "masters", "create");
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, created: 0, updated: 0, errors: ["No file uploaded."] };

  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(await file.arrayBuffer());
  } catch {
    return { ok: false, created: 0, updated: 0, errors: ["Could not read the file — upload a valid .xlsx."] };
  }
  const ws = wb.worksheets[0];
  if (!ws) return { ok: false, created: 0, updated: 0, errors: ["Workbook has no sheets."] };

  // header map
  const headers = new Map<string, number>();
  ws.getRow(1).eachCell((cell, col) => {
    headers.set(String(cell.value ?? "").trim().toUpperCase(), col);
  });
  const col = (...names: string[]) => {
    for (const n of names) {
      const c = headers.get(n);
      if (c) return c;
    }
    return 0;
  };
  const cParty = col("PARTY", "PARTY NAME");
  const cProduct = col("PRODUCT", "PRODUCT NAME");
  const cSource = col("SOURCE", "FROM", "SOURCE CITY");
  const cDest = col("DESTINATION", "TO", "DEST", "DESTINATION CITY");
  const cRate = col("RATE", "FREIGHT RATE");
  const cBasis = col("BASIS", "RATE BASIS");
  const cHamali = col("HAMALI");
  const cPreBhada = col("PRE BHADA", "PREBHADA", "PRE-BHADA");
  const cDCharge = col("D CHARGE", "DCHARGE", "DELIVERY CHARGE");
  const cStationery = col("STATIONERY");
  const cCrossing = col("CROSSING");
  if (!cParty || !cSource || !cDest || !cRate) {
    return {
      ok: false,
      created: 0,
      updated: 0,
      errors: ["Missing required headers. Need at least: Party, Source, Destination, Rate."],
    };
  }

  const text = (r: import("exceljs").Row, c: number) =>
    c ? String(r.getCell(c).value ?? "").trim() : "";
  const num = (r: import("exceljs").Row, c: number) => {
    if (!c) return 0;
    const v = r.getCell(c).value;
    const n = typeof v === "number" ? v : parseFloat(String(v ?? "0").replace(/[^\d.-]/g, ""));
    return isNaN(n) ? 0 : n;
  };

  return withTenant(session.tenantId, async (tx) => {
    const [parties, products, cities] = await Promise.all([
      tx.party.findMany({ where: { isActive: true } }),
      tx.product.findMany(),
      tx.city.findMany(),
    ]);
    const byName = <T extends { name: string }>(rows: T[]) =>
      new Map(rows.map((x) => [x.name.trim().toUpperCase(), x]));
    const partyMap = byName(parties);
    const productMap = byName(products);
    const cityMap = byName(cities);

    let created = 0;
    let updated = 0;
    const errors: string[] = [];

    for (let i = 2; i <= ws.rowCount; i++) {
      const row = ws.getRow(i);
      const partyName = text(row, cParty);
      if (!partyName && !text(row, cSource)) continue; // blank row
      const party = partyMap.get(partyName.toUpperCase());
      const source = cityMap.get(text(row, cSource).toUpperCase());
      const dest = cityMap.get(text(row, cDest).toUpperCase());
      const productName = text(row, cProduct);
      const product = productName ? productMap.get(productName.toUpperCase()) : undefined;
      if (!party) { errors.push(`Row ${i}: party "${partyName}" not found in masters.`); continue; }
      if (!source) { errors.push(`Row ${i}: source city "${text(row, cSource)}" not found.`); continue; }
      if (!dest) { errors.push(`Row ${i}: destination city "${text(row, cDest)}" not found.`); continue; }
      if (productName && !product) { errors.push(`Row ${i}: product "${productName}" not found.`); continue; }

      const basisText = text(row, cBasis).toUpperCase();
      const rateBasis = BASIS_ALIASES[basisText] ?? "CHARGE_WT";
      const values = {
        rate: num(row, cRate),
        rateBasis,
        hamali: num(row, cHamali),
        preBhada: num(row, cPreBhada),
        dCharge: num(row, cDCharge),
        stationery: num(row, cStationery),
        crossing: num(row, cCrossing),
      };

      const existing = await tx.rateMaster.findFirst({
        where: {
          partyId: party.id,
          productId: product?.id ?? null,
          sourceCityId: source.id,
          destCityId: dest.id,
        },
      });
      if (existing) {
        await tx.rateMaster.update({ where: { id: existing.id }, data: values });
        updated++;
      } else {
        await tx.rateMaster.create({
          data: {
            tenantId: session.tenantId,
            partyId: party.id,
            productId: product?.id ?? null,
            sourceCityId: source.id,
            destCityId: dest.id,
            ...values,
          },
        });
        created++;
      }
    }

    await audit(tx, session, {
      entity: "RateMaster",
      entityId: "excel-import",
      action: "CREATE",
      after: { created, updated, errors: errors.length },
    });
    revalidatePath("/masters/rates");
    return { ok: errors.length === 0, created, updated, errors };
  });
}
