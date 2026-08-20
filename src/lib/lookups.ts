"use server";

import { authorize } from "@/lib/authz";
import { requireSession } from "./session";
import { withTenant } from "./db";
import { LedgerGroup } from "@prisma/client";

export interface Option {
  value: string;
  label: string;
  meta?: string;
}

export async function getCityOptions(): Promise<Option[]> {
  const s = requireSession();
  const cities = await withTenant(s.tenantId, (tx) =>
    tx.city.findMany({ include: { state: true }, orderBy: { name: "asc" } })
  );
  return cities.map((c) => ({ value: c.id, label: c.name, meta: c.state.name }));
}

export async function getPartyOptions(groups?: LedgerGroup[]): Promise<Option[]> {
  const s = requireSession();
  const parties = await withTenant(s.tenantId, (tx) =>
    tx.party.findMany({
      where: {
        isActive: true,
        // Bank & Cash are maintained in their own master; never offer them as parties
        // unless a caller (getBankOptions) asks for those groups explicitly.
        ...(groups?.length
          ? { ledgerGroup: { in: groups } }
          : { ledgerGroup: { notIn: ["BANK", "CASH", "CARD"] } }),
      },
      orderBy: { name: "asc" },
    })
  );
  return parties.map((p) => ({
    value: p.id,
    label: p.name,
    // alias & transport name first: the combobox searches label+meta, so the
    // short name or the transport's trade name both find the party
    meta: [p.alias, p.transportName, p.gstin, p.pan].filter(Boolean).join(" · ") || undefined,
  }));
}

export async function getVehicleOptions(): Promise<Option[]> {
  const s = requireSession();
  const vehicles = await withTenant(s.tenantId, (tx) =>
    tx.vehicle.findMany({ where: { isActive: true }, include: { owner: true }, orderBy: { number: "asc" } })
  );
  return vehicles.map((v) => ({
    value: v.id,
    label: v.number,
    meta: vehicleMeta(v),
  }));
}

function vehicleMeta(v: { isOwn: boolean; ownershipType: string; ownerNames: string | null; owner: { name: string } | null }) {
  if (v.isOwn) return `Owned${v.ownerNames ? " — " + v.ownerNames : v.owner ? " — " + v.owner.name : ""}`;
  const kind = v.ownershipType === "RELATIVE" ? "Relative" : "Broker";
  return `${kind} — ${v.owner?.name ?? "?"}`;
}

export async function getProductOptions(): Promise<Option[]> {
  const s = requireSession();
  const products = await withTenant(s.tenantId, (tx) =>
    tx.product.findMany({ include: { group: true }, orderBy: { name: "asc" } })
  );
  return products.map((p) => ({ value: p.id, label: p.name, meta: p.group.name }));
}

/**
 * Bank & Cash heads. `meta` carries the ledger group ("BANK" | "CASH") so
 * callers can filter the list by the selected payment mode.
 */
export async function getBankOptions(): Promise<Option[]> {
  const s = requireSession();
  const heads = await withTenant(s.tenantId, (tx) =>
    tx.party.findMany({
      where: { isActive: true, ledgerGroup: { in: ["BANK", "CASH", "CARD"] } },
      orderBy: { name: "asc" },
    })
  );
  return heads.map((p) => ({ value: p.id, label: p.name, meta: p.ledgerGroup }));
}

export async function getStateOptions(): Promise<Option[]> {
  const s = requireSession();
  const states = await withTenant(s.tenantId, (tx) =>
    tx.state.findMany({ orderBy: { name: "asc" } })
  );
  return states.map((st) => ({ value: st.id, label: st.name, meta: st.gstCode }));
}

export async function getUnitOptions(): Promise<Option[]> {
  const s = requireSession();
  const units = await withTenant(s.tenantId, (tx) => tx.unit.findMany({ orderBy: { name: "asc" } }));
  return units.map((u) => ({ value: u.id, label: u.name }));
}

/** Unit options keyed by NAME — for fields that store the unit name (e.g. Product.unit). */
export async function getUnitNameOptions(): Promise<Option[]> {
  const s = requireSession();
  const units = await withTenant(s.tenantId, (tx) => tx.unit.findMany({ orderBy: { name: "asc" } }));
  return units.map((u) => ({ value: u.name, label: u.name }));
}

// ---------- inline creates (the "+" pattern) ----------

export async function createCityInline(input: {
  name: string;
  stateId: string;
  district?: string;
  pincode?: string;
}): Promise<Option> {
  const s = requireSession();
  await authorize(s, "masters", "create");
  const city = await withTenant(s.tenantId, (tx) =>
    tx.city.create({
      data: { tenantId: s.tenantId, name: input.name.toUpperCase().trim(), stateId: input.stateId, district: input.district, pincode: input.pincode },
      include: { state: true },
    })
  );
  return { value: city.id, label: city.name, meta: city.state.name };
}

export async function createPartyInline(input: {
  name: string;
  ledgerGroup: LedgerGroup;
  address1?: string;
  gstin?: string;
  pan?: string;
  mobile?: string;
  stateId?: string;
  cityId?: string;
  /** owner/broker parties: the transport firm name printed on documents */
  transportName?: string;
  tdsMode?: "TDS_APPLICABLE" | "DECLARATION";
}): Promise<Option & { transportName?: string | null; ownerName?: string | null }> {
  const s = requireSession();
  await authorize(s, "masters", "create");
  const party = await withTenant(s.tenantId, (tx) =>
    tx.party.create({
      data: { tenantId: s.tenantId, ...input, name: input.name.toUpperCase().trim() },
    })
  );
  return {
    value: party.id,
    label: party.name,
    meta: [party.alias, party.gstin, party.pan].filter(Boolean).join(" · ") || undefined,
    // chalan / broker-slip keep their own broker lists — the created option
    // carries the two-way name-link data so it links without a page reload
    transportName: party.transportName ?? null,
    ownerName: party.name,
  };
}

export async function createVehicleInline(input: {
  number: string;
  ownershipType?: "OWNER" | "BROKER" | "RELATIVE";
  ownerId?: string;
  isOwn?: boolean;
  ownerNames?: string;
  vehicleType?: string;
  chassisNo?: string;
  engineNo?: string;
  permitNo?: string;
  insuranceNo?: string;
}): Promise<Option> {
  const s = requireSession();
  await authorize(s, "masters", "create");
  const v = await withTenant(s.tenantId, async (tx) => {
    const created = await tx.vehicle.create({
      data: {
        tenantId: s.tenantId,
        number: input.number.toUpperCase().replace(/\s+/g, ""),
        ownershipType: input.ownershipType ?? (input.isOwn ? "OWNER" : "BROKER"),
        ownerId: input.ownerId || null,
        isOwn: input.ownershipType ? input.ownershipType === "OWNER" : input.isOwn ?? false,
        ownerNames: input.isOwn ? input.ownerNames || null : null,
        vehicleType: input.vehicleType || null,
        chassisNo: input.chassisNo ? input.chassisNo.toUpperCase() : null,
        engineNo: input.engineNo ? input.engineNo.toUpperCase() : null,
        permitNo: input.permitNo || null,
        insuranceNo: input.insuranceNo || null,
      },
      include: { owner: true },
    });
    return created;
  });
  return { value: v.id, label: v.number, meta: vehicleMeta(v) };
}

export async function createProductInline(input: {
  name: string;
  groupId?: string;
  unit?: string;
  hsnCode?: string;
  gstPct?: number;
}): Promise<Option> {
  const s = requireSession();
  await authorize(s, "masters", "create");
  const p = await withTenant(s.tenantId, async (tx) => {
    if (input.unit) {
      const unit = await tx.unit.findFirst({
        where: { name: { equals: input.unit, mode: "insensitive" } },
      });
      if (!unit) throw new Error(`Unit "${input.unit}" is not in the Unit Master`);
      input.unit = unit.name;
    }
    let groupId = input.groupId;
    if (!groupId) {
      const g = await tx.productGroup.upsert({
        where: { tenantId_name: { tenantId: s.tenantId, name: "GENERAL" } },
        create: { tenantId: s.tenantId, name: "GENERAL" },
        update: {},
      });
      groupId = g.id;
    }
    return tx.product.create({
      data: {
        tenantId: s.tenantId,
        name: input.name.toUpperCase().trim(),
        groupId,
        unit: input.unit ?? null,
        hsnCode: input.hsnCode,
        gstPct: input.gstPct ?? 0,
      },
      include: { group: true },
    });
  });
  return { value: p.id, label: p.name, meta: p.group.name };
}

/** Rate lookup for LR entry: party + product + source + destination */
export async function lookupRate(input: {
  partyId: string;
  productId?: string | null;
  sourceCityId: string;
  destCityId: string;
}) {
  const s = requireSession();
  return withTenant(s.tenantId, (tx) =>
    tx.rateMaster.findFirst({
      where: {
        partyId: input.partyId,
        sourceCityId: input.sourceCityId,
        destCityId: input.destCityId,
        OR: [{ productId: input.productId ?? undefined }, { productId: null }],
      },
      orderBy: { productId: { sort: "desc", nulls: "last" } },
    })
  );
}
