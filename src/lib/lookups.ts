"use server";

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
      where: { isActive: true, ...(groups?.length ? { ledgerGroup: { in: groups } } : {}) },
      orderBy: { name: "asc" },
    })
  );
  return parties.map((p) => ({
    value: p.id,
    label: p.name,
    meta: [p.gstin, p.pan].filter(Boolean).join(" · ") || undefined,
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
    meta: v.isOwn ? `Owned${v.ownerNames ? " — " + v.ownerNames : ""}` : `Broker — ${v.owner?.name ?? "?"}`,
  }));
}

export async function getProductOptions(): Promise<Option[]> {
  const s = requireSession();
  const products = await withTenant(s.tenantId, (tx) =>
    tx.product.findMany({ include: { group: true }, orderBy: { name: "asc" } })
  );
  return products.map((p) => ({ value: p.id, label: p.name, meta: p.group.name }));
}

export async function getBankOptions(): Promise<Option[]> {
  return getPartyOptions(["BANK", "CASH"]);
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

// ---------- inline creates (the "+" pattern) ----------

export async function createCityInline(input: {
  name: string;
  stateId: string;
  district?: string;
  pincode?: string;
}): Promise<Option> {
  const s = requireSession();
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
  tdsMode?: "TDS_APPLICABLE" | "DECLARATION";
}): Promise<Option> {
  const s = requireSession();
  const party = await withTenant(s.tenantId, (tx) =>
    tx.party.create({
      data: { tenantId: s.tenantId, ...input, name: input.name.toUpperCase().trim() },
    })
  );
  return { value: party.id, label: party.name, meta: [party.gstin, party.pan].filter(Boolean).join(" · ") || undefined };
}

export async function createVehicleInline(input: {
  number: string;
  ownerId?: string;
  isOwn?: boolean;
  vehicleType?: string;
}): Promise<Option> {
  const s = requireSession();
  const v = await withTenant(s.tenantId, (tx) =>
    tx.vehicle.create({
      data: {
        tenantId: s.tenantId,
        number: input.number.toUpperCase().replace(/\s+/g, ""),
        ownerId: input.ownerId || null,
        isOwn: input.isOwn ?? false,
        vehicleType: input.vehicleType,
      },
    })
  );
  return { value: v.id, label: v.number, meta: input.isOwn ? "Own vehicle" : undefined };
}

export async function createProductInline(input: {
  name: string;
  groupId?: string;
  unit?: string;
  hsnCode?: string;
  gstPct?: number;
}): Promise<Option> {
  const s = requireSession();
  const p = await withTenant(s.tenantId, async (tx) => {
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
        unit: input.unit ?? "MT",
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
