import { Session } from "./session";
import { withTenant } from "./db";

export type Action = "view" | "create" | "edit" | "delete" | "print" | "export";

const ROLE_DEFAULTS: Record<Session["role"], Action[]> = {
  OWNER: ["view", "create", "edit", "delete", "print", "export"],
  ADMIN: ["view", "create", "edit", "delete", "print", "export"],
  OPERATOR: ["view", "create", "edit", "print", "export"],
  ACCOUNTANT: ["view", "create", "edit", "print", "export"],
  VIEWER: ["view", "print", "export"],
};

/**
 * Authorize `action` on `module` for the session user.
 * Per-user overrides (UserPermission rows) take precedence over role defaults.
 */
export async function authorize(
  session: Session,
  module: string,
  action: Action
): Promise<void> {
  const override = await withTenant(session.tenantId, (tx) =>
    tx.userPermission.findUnique({
      where: { userId_module: { userId: session.userId, module } },
    })
  );
  let allowed: boolean;
  if (override) {
    const map: Record<Action, boolean> = {
      view: override.canView,
      create: override.canCreate,
      edit: override.canEdit,
      delete: override.canDelete,
      print: override.canPrint,
      export: override.canExport,
    };
    allowed = map[action];
  } else {
    allowed = ROLE_DEFAULTS[session.role].includes(action);
  }
  if (!allowed) throw new Error(`FORBIDDEN: ${module}.${action}`);
}
