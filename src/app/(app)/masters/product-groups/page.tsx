import { requireSession } from "@/lib/session";
import { authorize } from "@/lib/authz";
import { withTenant } from "@/lib/db";
import { ProductGroupsClient } from "@/components/masters/product-groups-client";

export default async function ProductGroupsPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const session = requireSession();
  await authorize(session, "masters", "view");
  const q = searchParams.q?.trim();

  const rows = await withTenant(session.tenantId, (tx) =>
    tx.productGroup.findMany({
      where: q ? { name: { contains: q, mode: "insensitive" } } : undefined,
      include: { _count: { select: { products: true } } },
      orderBy: { name: "asc" },
    })
  );

  const canDelete = session.role === "ADMIN" || session.role === "OWNER";
  return (
    <ProductGroupsClient
      rows={rows.map((r) => ({ id: r.id, name: r.name, products: r._count.products }))}
      canDelete={canDelete}
    />
  );
}
