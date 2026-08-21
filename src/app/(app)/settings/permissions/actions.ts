"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { Role } from "@prisma/client";
import { requireSession } from "@/lib/session";
import { authorize } from "@/lib/authz";
import { permsTag } from "@/lib/cached-auth";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { EDITABLE_ROLES, MODULES } from "@/lib/permissions";
import { actionError, zodError, type ActionResult } from "../../masters/_lib/util";

const rowSchema = z.object({
  module: z.string().min(1),
  canView: z.boolean(),
  canCreate: z.boolean(),
  canEdit: z.boolean(),
  canDelete: z.boolean(),
  canPrint: z.boolean(),
  canExport: z.boolean(),
});

const schema = z.object({
  role: z.nativeEnum(Role),
  rows: z.array(rowSchema),
});

const KNOWN_MODULES = new Set(MODULES.map((m) => m.key));

function guardAdminSession(session: ReturnType<typeof requireSession>) {
  if (session.role !== "OWNER" && session.role !== "ADMIN") {
    return "Only Admin/Owner may manage role permissions.";
  }
  return null;
}

export async function saveRolePermissions(input: unknown): Promise<ActionResult> {
  const session = requireSession();
  await authorize(session, "settings", "edit");
  const guard = guardAdminSession(session);
  if (guard) return { ok: false, error: guard };
  const parsed = schema.safeParse(input);
  if (!parsed.success) return zodError(parsed.error);
  const data = parsed.data;
  if (!EDITABLE_ROLES.includes(data.role)) {
    return { ok: false, error: "OWNER permissions are fixed and cannot be edited." };
  }
  for (const r of data.rows) {
    if (!KNOWN_MODULES.has(r.module)) {
      return { ok: false, error: `Unknown module: ${r.module}` };
    }
  }
  try {
    await withTenant(session.tenantId, async (tx) => {
      for (const r of data.rows) {
        // an Admin can never lock Admins out of this screen — the Settings
        // module stays fully open for the ADMIN role no matter what was sent
        const row =
          data.role === "ADMIN" && r.module === "settings"
            ? {
                ...r,
                canView: true,
                canCreate: true,
                canEdit: true,
                canDelete: true,
                canPrint: true,
                canExport: true,
              }
            : r;
        await tx.rolePermission.upsert({
          where: {
            tenantId_role_module: {
              tenantId: session.tenantId,
              role: data.role,
              module: row.module,
            },
          },
          update: {
            canView: row.canView,
            canCreate: row.canCreate,
            canEdit: row.canEdit,
            canDelete: row.canDelete,
            canPrint: row.canPrint,
            canExport: row.canExport,
          },
          create: {
            tenantId: session.tenantId,
            role: data.role,
            module: row.module,
            canView: row.canView,
            canCreate: row.canCreate,
            canEdit: row.canEdit,
            canDelete: row.canDelete,
            canPrint: row.canPrint,
            canExport: row.canExport,
          },
        });
      }
      await audit(tx, session, {
        entity: "RolePermission",
        entityId: data.role,
        action: "UPDATE",
        after: { role: data.role, rows: data.rows },
      });
    });
    revalidatePath("/settings/permissions");
    revalidateTag(permsTag(session.tenantId));
    return { ok: true, id: data.role };
  } catch (e) {
    return actionError(e);
  }
}

/** Remove every stored row for the role, falling back to the hard-coded defaults. */
export async function resetRolePermissions(role: Role): Promise<ActionResult> {
  const session = requireSession();
  await authorize(session, "settings", "edit");
  const guard = guardAdminSession(session);
  if (guard) return { ok: false, error: guard };
  if (!EDITABLE_ROLES.includes(role)) {
    return { ok: false, error: "OWNER permissions are fixed and cannot be edited." };
  }
  try {
    await withTenant(session.tenantId, async (tx) => {
      await tx.rolePermission.deleteMany({
        where: { tenantId: session.tenantId, role },
      });
      await audit(tx, session, {
        entity: "RolePermission",
        entityId: role,
        action: "DELETE",
        after: { role, reset: "defaults" },
      });
    });
    revalidatePath("/settings/permissions");
    revalidateTag(permsTag(session.tenantId));
    return { ok: true, id: role };
  } catch (e) {
    return actionError(e);
  }
}
