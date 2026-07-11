import type { Prisma } from "@prisma/client";
import { requireSession } from "@/lib/session";
import { authorize } from "@/lib/authz";
import { withTenant } from "@/lib/db";
import { toNum } from "@/lib/utils";
import { RatesClient } from "@/components/masters/rates-client";

export const dynamic = "force-dynamic";

export default async function RatesPage({
  searchParams,
}: {
  searchParams: { party?: string; source?: string; dest?: string };
}) {
  const session = requireSession();
  await authorize(session, "masters", "view");

  const { rows, parties, products, cities } = await withTenant(session.tenantId, async (tx) => {
    const where: Prisma.RateMasterWhereInput = {};
    if (searchParams.party) where.partyId = searchParams.party;
    if (searchParams.source) where.sourceCityId = searchParams.source;
    if (searchParams.dest) where.destCityId = searchParams.dest;
    const [rows, parties, products, cities] = await Promise.all([
      tx.rateMaster.findMany({ where }),
      tx.party.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
      tx.product.findMany({ orderBy: { name: "asc" } }),
      tx.city.findMany({ orderBy: { name: "asc" } }),
    ]);
    return { rows, parties, products, cities };
  });

  const partyById = new Map(parties.map((p) => [p.id, p.name]));
  const productById = new Map(products.map((p) => [p.id, p.name]));
  const cityById = new Map(cities.map((c) => [c.id, c.name]));

  const canDelete = session.role === "ADMIN" || session.role === "OWNER";
  const n = (v: unknown) => toNum(String(v));
  return (
    <RatesClient
      rows={rows
        .map((r) => ({
          id: r.id,
          partyId: r.partyId,
          partyName: partyById.get(r.partyId) ?? "",
          productId: r.productId,
          productName: (r.productId && productById.get(r.productId)) || "ALL",
          sourceCityId: r.sourceCityId,
          sourceName: cityById.get(r.sourceCityId) ?? "",
          destCityId: r.destCityId,
          destName: cityById.get(r.destCityId) ?? "",
          rate: n(r.rate),
          rateBasis: r.rateBasis,
          hamali: n(r.hamali),
          hamaliBasis: r.hamaliBasis,
          preBhada: n(r.preBhada),
          preBhadaBasis: r.preBhadaBasis,
          dCharge: n(r.dCharge),
          dChargeBasis: r.dChargeBasis,
          stationery: n(r.stationery),
          stationeryBasis: r.stationeryBasis,
          crossing: n(r.crossing),
          crossingBasis: r.crossingBasis,
        }))
        .sort((a, b) => a.partyName.localeCompare(b.partyName))}
      partyOptions={parties.map((p) => ({ value: p.id, label: p.name }))}
      productOptions={products.map((p) => ({ value: p.id, label: p.name }))}
      cityOptions={cities.map((c) => ({ value: c.id, label: c.name }))}
      canDelete={canDelete}
    />
  );
}
