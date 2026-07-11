import { requireSession } from "@/lib/session";
import { authorize } from "@/lib/authz";
import { withTenant } from "@/lib/db";
import { AccountHeadsClient } from "@/components/masters/account-heads-client";

export default async function AccountHeadsPage({
  searchParams,
}: {
  searchParams: { q?: string; kind?: string };
}) {
  const session = requireSession();
  await authorize(session, "masters", "view");
  const q = searchParams.q?.trim();
  const kind = searchParams.kind;

  const rows = await withTenant(session.tenantId, (tx) =>
    tx.accountHead.findMany({
      where: {
        ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
        ...(kind ? { kind } : {}),
      },
      orderBy: { name: "asc" },
    })
  );

  const canDelete = session.role === "ADMIN" || session.role === "OWNER";
  return <AccountHeadsClient rows={rows} canDelete={canDelete} />;
}
