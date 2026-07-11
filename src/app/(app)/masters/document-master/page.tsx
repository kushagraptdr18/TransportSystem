import { requireSession } from "@/lib/session";
import { authorize } from "@/lib/authz";
import { withTenant } from "@/lib/db";
import { DocumentMasterClient } from "@/components/masters/document-master-client";

export default async function DocumentMasterPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const session = requireSession();
  await authorize(session, "masters", "view");
  const q = searchParams.q?.trim();

  const rows = await withTenant(session.tenantId, (tx) =>
    tx.documentType.findMany({
      where: q ? { name: { contains: q, mode: "insensitive" } } : undefined,
      orderBy: { name: "asc" },
    })
  );

  const canDelete = session.role === "ADMIN" || session.role === "OWNER";
  return <DocumentMasterClient rows={rows} canDelete={canDelete} />;
}
