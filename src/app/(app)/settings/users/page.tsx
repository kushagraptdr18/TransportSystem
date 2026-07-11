import { requireSession } from "@/lib/session";
import { authorize } from "@/lib/authz";
import { withTenant } from "@/lib/db";
import { formatDate } from "@/lib/utils";
import { UsersClient } from "@/components/settings/users-client";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const session = requireSession();
  await authorize(session, "settings", "view");

  const users = await withTenant(session.tenantId, (tx) =>
    tx.user.findMany({ orderBy: { name: "asc" } })
  );

  const canManage = session.role === "ADMIN" || session.role === "OWNER";
  return (
    <UsersClient
      rows={users.map((u) => ({
        id: u.id,
        name: u.name,
        username: u.username,
        role: u.role,
        isActive: u.isActive,
        createdAt: formatDate(u.createdAt),
      }))}
      canDelete={canManage}
    />
  );
}
