"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { requireSession } from "@/lib/session";
import { authorize } from "@/lib/authz";
import { withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";
import { actionError, zodError, type ActionResult } from "../../masters/_lib/util";

const schema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Name is required"),
  username: z.string().trim().min(1, "Username is required"),
  password: z.string().optional(),
  role: z.nativeEnum(Role),
  isActive: z.boolean().default(true),
});

export async function saveUser(input: unknown): Promise<ActionResult> {
  const session = requireSession();
  await authorize(session, "settings", "edit");
  if (session.role !== "OWNER" && session.role !== "ADMIN") {
    return { ok: false, error: "Only Admin/Owner may manage users." };
  }
  const parsed = schema.safeParse(input);
  if (!parsed.success) return zodError(parsed.error);
  const data = parsed.data;
  if (!data.id && !data.password?.trim()) {
    return { ok: false, error: "Password is required for a new user." };
  }
  try {
    const id = await withTenant(session.tenantId, async (tx) => {
      const values: Record<string, unknown> = {
        name: data.name,
        username: data.username,
        role: data.role,
        isActive: data.isActive,
      };
      if (data.password?.trim()) {
        values.passwordHash = await bcrypt.hash(data.password.trim(), 10);
      }
      if (data.id) {
        const before = await tx.user.findUniqueOrThrow({ where: { id: data.id } });
        const row = await tx.user.update({ where: { id: data.id }, data: values });
        await audit(tx, session, {
          entity: "User",
          entityId: row.id,
          action: "UPDATE",
          before: { ...before, passwordHash: "***" },
          after: { ...row, passwordHash: "***" },
        });
        return row.id;
      }
      const row = await tx.user.create({
        data: {
          tenantId: session.tenantId,
          name: data.name,
          username: data.username,
          role: data.role,
          isActive: data.isActive,
          passwordHash: values.passwordHash as string,
        },
      });
      await audit(tx, session, {
        entity: "User",
        entityId: row.id,
        action: "CREATE",
        after: { ...row, passwordHash: "***" },
      });
      return row.id;
    });
    revalidatePath("/settings/users");
    return { ok: true, id };
  } catch (e) {
    return actionError(e);
  }
}

export async function deleteUser(id: string): Promise<ActionResult> {
  const session = requireSession();
  await authorize(session, "settings", "delete");
  if (session.role !== "OWNER" && session.role !== "ADMIN") {
    return { ok: false, error: "Only Admin/Owner may manage users." };
  }
  if (id === session.userId) {
    return { ok: false, error: "You cannot deactivate your own account." };
  }
  try {
    await withTenant(session.tenantId, async (tx) => {
      const before = await tx.user.findUniqueOrThrow({ where: { id } });
      await tx.user.update({ where: { id }, data: { isActive: false } });
      await audit(tx, session, {
        entity: "User",
        entityId: id,
        action: "DELETE",
        before: { ...before, passwordHash: "***" },
      });
    });
    revalidatePath("/settings/users");
    return { ok: true, id };
  } catch (e) {
    return actionError(e);
  }
}
