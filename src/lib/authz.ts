import { Session } from "./session";
import { getPermissionRow } from "./cached-auth";
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

  // cached (5 min TTL + tag revalidated by the permission screens) — this
  // used to be its own DB transaction on every authorized page view
  const row = await getPermissionRow(session.tenantId, session.userId, session.role, module);
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
