import { Session } from "./session";
import { withTenant } from "./db";
import { ROLE_DEFAULTS, type Action } from "./permissions";

export type { Action };

/**
 * Authorize `action` on `module` for the session user.
 *
 * Resolution order:
 *  1. OWNER always passes — the recovery path can never be configured away.
 *  2. Per-user override (UserPermission row) — most specific wins.
 *  3. Per-tenant role matrix (RolePermission, edited from Settings -> Role
 *     Permissions).
 *  4. Hard-coded role defaults.
 */
export async function authorize(
  session: Session,
  module: string,
  action: Action
): Promise<void> {
  if (session.role === "OWNER") return;

  const { override, roleRow } = await withTenant(session.tenantId, async (tx) => ({
    override: await tx.userPermission.findUnique({
      where: { userId_module: { userId: session.userId, module } },
    }),
    roleRow: await tx.rolePermission.findUnique({
      where: {
        tenantId_role_module: { tenantId: session.tenantId, role: session.role, module },
      },
    }),
  }));

  const row = override ?? roleRow;
  let allowed: boolean;
  if (row) {
    const map: Record<Action, boolean> = {
      view: row.canView,
      create: row.canCreate,
      edit: row.canEdit,
      delete: row.canDelete,
      print: row.canPrint,
      export: row.canExport,
    };
    allowed = map[action];
  } else {
    allowed = ROLE_DEFAULTS[session.role].includes(action);
  }
  if (!allowed) throw new Error(`FORBIDDEN: ${module}.${action}`);
}
