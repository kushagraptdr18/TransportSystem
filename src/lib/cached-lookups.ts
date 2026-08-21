import { unstable_cache } from "next/cache";
import { withTenant } from "./db";

/**
 * Tenant-scoped master-data lookups (dropdown fodder) cached across requests.
 * Forms like LR Entry used to re-read every city, party, vehicle and product
 * from Postgres on every single visit; these rows change rarely, so the
 * masters actions revalidate the tag on every mutation and the TTL is only a
 * multi-instance backstop.
 *
 * Only plain-string fields are selected: unstable_cache serializes results,
 * so Decimal/Date fields would come back as strings and lie to the caller.
 */

const TTL = 600; // seconds

export const lookupTag = {
  cities: (tenantId: string) => `lookup:cities:${tenantId}`,
  parties: (tenantId: string) => `lookup:parties:${tenantId}`,
  vehicles: (tenantId: string) => `lookup:vehicles:${tenantId}`,
  products: (tenantId: string) => `lookup:products:${tenantId}`,
};

export interface CityLookup {
  id: string;
  name: string;
  stateName: string;
}

export function getCityLookup(tenantId: string): Promise<CityLookup[]> {
  return unstable_cache(
    async () => {
      const cities = await withTenant(tenantId, (tx) =>
        tx.city.findMany({
          select: { id: true, name: true, state: { select: { name: true } } },
          orderBy: { name: "asc" },
        })
      );
      return cities.map((c) => ({ id: c.id, name: c.name, stateName: c.state.name }));
    },
    ["lookup-cities", tenantId],
    { revalidate: TTL, tags: [lookupTag.cities(tenantId)] }
  )();
}

export interface PartyLookup {
  id: string;
  name: string;
  alias: string | null;
  gstin: string | null;
  pan: string | null;
  address1: string | null;
  address2: string | null;
  ledgerGroup: string;
}

/** Active parties across ledger groups; filter by group at the call site. */
export function getPartyLookup(tenantId: string): Promise<PartyLookup[]> {
  return unstable_cache(
    async () =>
      withTenant(tenantId, (tx) =>
        tx.party.findMany({
          where: { isActive: true },
          select: {
            id: true,
            name: true,
            alias: true,
            gstin: true,
            pan: true,
            address1: true,
            address2: true,
            ledgerGroup: true,
          },
          orderBy: { name: "asc" },
        })
      ),
    ["lookup-parties", tenantId],
    { revalidate: TTL, tags: [lookupTag.parties(tenantId)] }
  )();
}

export interface VehicleLookup {
  id: string;
  number: string;
  isOwn: boolean;
  ownerNames: string | null;
  ownerName: string | null;
}

export function getVehicleLookup(tenantId: string): Promise<VehicleLookup[]> {
  return unstable_cache(
    async () => {
      const vehicles = await withTenant(tenantId, (tx) =>
        tx.vehicle.findMany({
          where: { isActive: true },
          select: {
            id: true,
            number: true,
            isOwn: true,
            ownerNames: true,
            owner: { select: { name: true } },
          },
          orderBy: { number: "asc" },
        })
      );
      return vehicles.map((v) => ({
        id: v.id,
        number: v.number,
        isOwn: v.isOwn,
        ownerNames: v.ownerNames,
        ownerName: v.owner?.name ?? null,
      }));
    },
    ["lookup-vehicles", tenantId],
    { revalidate: TTL, tags: [lookupTag.vehicles(tenantId)] }
  )();
}

export interface ProductLookup {
  id: string;
  name: string;
  unit: string | null;
  productType: string;
  groupName: string;
}

export function getProductLookup(tenantId: string): Promise<ProductLookup[]> {
  return unstable_cache(
    async () => {
      const products = await withTenant(tenantId, (tx) =>
        tx.product.findMany({
          select: {
            id: true,
            name: true,
            unit: true,
            productType: true,
            group: { select: { name: true } },
          },
          orderBy: { name: "asc" },
        })
      );
      return products.map((p) => ({
        id: p.id,
        name: p.name,
        unit: p.unit,
        productType: p.productType,
        groupName: p.group.name,
      }));
    },
    ["lookup-products", tenantId],
    { revalidate: TTL, tags: [lookupTag.products(tenantId)] }
  )();
}
