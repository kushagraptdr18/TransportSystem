import type { LedgerGroup, Prisma } from "@prisma/client";
import { requireSession } from "@/lib/session";
import { authorize } from "@/lib/authz";
import { withTenant } from "@/lib/db";
import { toNum } from "@/lib/utils";
import { PartiesClient } from "@/components/masters/parties-client";

export const dynamic = "force-dynamic";

export default async function PartiesPage({
  searchParams,
}: {
  searchParams: { q?: string; group?: string; status?: string };
}) {
  const session = requireSession();
  await authorize(session, "masters", "view");
  const q = searchParams.q?.trim();

  const { rows, states, cities } = await withTenant(session.tenantId, async (tx) => {
    const where: Prisma.PartyWhereInput = {};
    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { gstin: { contains: q, mode: "insensitive" } },
        { pan: { contains: q, mode: "insensitive" } },
        { alias: { contains: q, mode: "insensitive" } },
      ];
    }
    if (searchParams.group) where.ledgerGroup = searchParams.group as LedgerGroup;
    if (searchParams.status === "active") where.isActive = true;
    if (searchParams.status === "inactive") where.isActive = false;
    const [rows, states, cities] = await Promise.all([
      tx.party.findMany({ where, orderBy: { name: "asc" } }),
      tx.state.findMany({ orderBy: { name: "asc" } }),
      tx.city.findMany({ orderBy: { name: "asc" } }),
    ]);
    return { rows, states, cities };
  });

  const canDelete = session.role === "ADMIN" || session.role === "OWNER";
  return (
    <PartiesClient
      rows={rows.map((r) => ({
        id: r.id,
        name: r.name,
        ledgerGroup: r.ledgerGroup,
        alias: r.alias,
        address1: r.address1,
        address2: r.address2,
        stateId: r.stateId,
        cityId: r.cityId,
        gstin: r.gstin,
        pan: r.pan,
        mobile: r.mobile,
        phone: r.phone,
        email: r.email,
        ownerName: r.ownerName,
        vendorCode: r.vendorCode,
        openingBalance: toNum(String(r.openingBalance)),
        openingSide: r.openingSide,
        tdsMode: r.tdsMode,
        bankName: r.bankName,
        bankAccount: r.bankAccount,
        bankIfsc: r.bankIfsc,
        isActive: r.isActive,
      }))}
      stateOptions={states.map((s) => ({ value: s.id, label: s.name, meta: s.gstCode }))}
      cityOptions={cities.map((c) => ({ value: c.id, label: c.name }))}
      canDelete={canDelete}
    />
  );
}
