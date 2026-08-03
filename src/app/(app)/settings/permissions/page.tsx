import { requireSession } from "@/lib/session";
import { authorize } from "@/lib/authz";
import { withTenant } from "@/lib/db";
import { RolePermissionsClient } from "@/components/settings/role-permissions-client";

export const dynamic = "force-dynamic";

/**
 * Role -> Permission dashboard. Admin/Owner only: what each role may do in
 * each module of the software. OWNER is not editable — it always has
 * everything, so an admin can never lock the firm out of its own system.
 */
export default async function RolePermissionsPage() {
  const session = requireSession();
  await authorize(session, "settings", "view");
  if (session.role !== "ADMIN" && session.role !== "OWNER") {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Only Admin/Owner may manage role permissions.
      </div>
    );
  }

  const rows = await withTenant(session.tenantId, (tx) =>
    tx.rolePermission.findMany({ where: { tenantId: session.tenantId } })
  );

  return (
    <RolePermissionsClient
      saved={rows.map((r) => ({
        role: r.role,
        module: r.module,
        canView: r.canView,
        canCreate: r.canCreate,
        canEdit: r.canEdit,
        canDelete: r.canDelete,
        canPrint: r.canPrint,
        canExport: r.canExport,
      }))}
    />
  );
}
