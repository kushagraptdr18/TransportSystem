import { unstable_cache } from "next/cache";
import { withTenant } from "./db";
import type { Session } from "./session";

/**
 * Short-TTL caches for the two DB checks that used to run as separate
 * transactions on EVERY page view (app layout's isActive re-validation and
 * authorize()'s permission lookup). Each round-trip to a remote Postgres
 * costs tens to hundreds of ms, multiplied by every navigation.
 *
 * Correctness: mutations revalidate the tags immediately (settings/users and
 * settings/permissions actions), so a deactivated user or a permission edit
 * still takes effect right away on the instance that made the change; the
 * TTL is only the upper bound for other instances.
 */

export const userActiveTag = (userId: string) => `user-active:${userId}`;
export const permsTag = (tenantId: string) => `perms:${tenantId}`;

export function isUserActive(tenantId: string, userId: string): Promise<boolean> {
  return unstable_cache(
    async () => {
      const row = await withTenant(tenantId, (tx) =>
        tx.user.findFirst({ where: { id: userId, isActive: true }, select: { id: true } })
      );
      return Boolean(row);
    },
    ["user-active", tenantId, userId],
    { revalidate: 60, tags: [userActiveTag(userId)] }
  )();
}

export interface PermissionRow {
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canPrint: boolean;
  canExport: boolean;
}

/**
 * Resolve the effective permission row for (user, role, module):
 * per-user override first, then the tenant's role matrix, else null
 * (caller falls back to hard-coded role defaults).
 */
export function getPermissionRow(
  tenantId: string,
  userId: string,
  role: Session["role"],
  module: string
): Promise<PermissionRow | null> {
  return unstable_cache(
    async () => {
      const { override, roleRow } = await withTenant(tenantId, async (tx) => ({
        override: await tx.userPermission.findUnique({
          where: { userId_module: { userId, module } },
        }),
        roleRow: await tx.rolePermission.findUnique({
          where: { tenantId_role_module: { tenantId, role, module } },
        }),
      }));
      const row = override ?? roleRow;
      if (!row) return null;
      return {
        canView: row.canView,
        canCreate: row.canCreate,
        canEdit: row.canEdit,
        canDelete: row.canDelete,
        canPrint: row.canPrint,
        canExport: row.canExport,
      };
    },
    ["perm-row", tenantId, userId, role, module],
    { revalidate: 300, tags: [permsTag(tenantId)] }
  )();
}
