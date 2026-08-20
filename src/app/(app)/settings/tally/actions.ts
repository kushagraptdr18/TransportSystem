"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { authorize } from "@/lib/authz";
import { audit } from "@/lib/audit";

const rowSchema = z.object({
  module: z.string().min(1),
  sourceKey: z.string().min(1),
  tallyName: z.string(),
});

/** Replace the firm's whole Tally ledger mapping (blank names are dropped —
 *  the export then falls back to the software-side name). */
export async function saveTallyMapping(
  input: unknown
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = requireSession();
  const parsed = z.array(rowSchema).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid mapping rows" };
  await authorize(session, "masters", "edit");
  try {
    await withTenant(session.tenantId, async (tx) => {
      await tx.tallyLedgerMap.deleteMany({ where: { firmId: session.firmId } });
      const rows = parsed.data.filter((r) => r.tallyName.trim());
      if (rows.length) {
        await tx.tallyLedgerMap.createMany({
          data: rows.map((r) => ({
            tenantId: session.tenantId,
            firmId: session.firmId,
            module: r.module,
            sourceKey: r.sourceKey,
            tallyName: r.tallyName.trim().toUpperCase(),
          })),
        });
      }
      await audit(tx, session, {
        entity: "TallyLedgerMap",
        entityId: session.firmId,
        action: "UPDATE",
        after: { count: rows.length },
      });
    });
    revalidatePath("/settings/tally");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Save failed" };
  }
}
