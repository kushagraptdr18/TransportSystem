import { requireSession } from "@/lib/session";
import { authorize } from "@/lib/authz";
import { withTenant } from "@/lib/db";
import { StatesClient } from "@/components/masters/states-client";

export default async function StatesPage({ searchParams }: { searchParams: { q?: string } }) {
  const session = requireSession();
  await authorize(session, "masters", "view");
  const q = searchParams.q?.trim();

  const rows = await withTenant(session.tenantId, (tx) =>
    tx.state.findMany({
      where: q ? { name: { contains: q, mode: "insensitive" } } : undefined,
      orderBy: { name: "asc" },
    })
  );

  const canDelete = session.role === "ADMIN" || session.role === "OWNER";
  return <StatesClient rows={rows} canDelete={canDelete} />;
}
