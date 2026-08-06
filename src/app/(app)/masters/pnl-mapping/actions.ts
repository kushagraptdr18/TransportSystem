"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { authorize } from "@/lib/authz";
import { audit } from "@/lib/audit";

const SCOPES = ["AUTO", "COMPANY", "VEHICLE", "EXCLUDE"] as const;
export type PnlScope = (typeof SCOPES)[number];

export async function setPnlScope(
  headId: string,
  scope: PnlScope
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = requireSession();
  await authorize(session, "masters", "edit");
  if (!SCOPES.includes(scope)) return { ok: false, error: "Invalid scope" };
  try {
    await withTenant(session.tenantId, async (tx) => {
      const before = await tx.accountHead.findUniqueOrThrow({ where: { id: headId } });
      const after = await tx.accountHead.update({ where: { id: headId }, data: { pnlScope: scope } });
      await audit(tx, session, { entity: "AccountHead", entityId: headId, action: "UPDATE", before, after });
    });
    revalidatePath("/masters/pnl-mapping");
    revalidatePath("/accounts/operational-pnl");
    revalidatePath("/accounts/vehicle-operational-pnl");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to save" };
  }
}
