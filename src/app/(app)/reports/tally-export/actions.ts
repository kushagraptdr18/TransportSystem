"use server";

import { z } from "zod";
import { requireSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { authorize } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { buildMastersXml, buildVouchersXml, voucherHash } from "@/lib/tally";
import { buildChalanVouchers } from "./build";

const exportSchema = z.object({
  dateFrom: z.string().nullish(), // ISO yyyy-mm-dd
  dateTo: z.string().nullish(),
  chalanIds: z.array(z.string()).min(1, "Select at least one chalan"),
  /** false (default): only NEW / CHANGED vouchers; true: everything selected */
  includeExported: z.boolean().default(false),
});

/**
 * Generate the Tally vouchers XML for the selected chalans and stamp the
 * export register (firm+key → content hash) so the next run skips them.
 */
export async function runTallyChalanExport(
  input: unknown
): Promise<
  | { ok: true; xml: string; fileName: string; exported: number; skipped: number }
  | { ok: false; error: string }
> {
  const session = requireSession();
  const parsed = exportSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;
  await authorize(session, "reports", "view");

  try {
    return await withTenant(session.tenantId, async (tx) => {
      const { docs } = await buildChalanVouchers(tx, session, {
        dateFrom: data.dateFrom ? new Date(`${data.dateFrom}T00:00:00`) : null,
        dateTo: data.dateTo ? new Date(`${data.dateTo}T23:59:59`) : null,
      });
      const wanted = docs.filter((d) => data.chalanIds.includes(d.chalanId));
      const keys = wanted.flatMap((d) => d.vouchers.map((v) => v.key));
      const registry = new Map(
        (
          await tx.tallyExportEntry.findMany({
            where: { firmId: session.firmId, key: { in: keys } },
          })
        ).map((r) => [r.key, r.hash])
      );

      const out: typeof wanted[number]["vouchers"] = [];
      let skipped = 0;
      for (const d of wanted) {
        for (const v of d.vouchers) {
          const hash = voucherHash(v);
          const prev = registry.get(v.key);
          if (!data.includeExported && prev === hash) {
            skipped += 1; // unchanged and already in Tally — never send twice
            continue;
          }
          out.push(v);
          await tx.tallyExportEntry.upsert({
            where: { firmId_key: { firmId: session.firmId, key: v.key } },
            create: { tenantId: session.tenantId, firmId: session.firmId, key: v.key, hash },
            update: { hash, exportedAt: new Date() },
          });
        }
      }
      if (out.length === 0) {
        return {
          ok: false as const,
          error: "Sab kuch pehle se exported hai — naya kuch nahi mila. (Full re-export chahiye toh 'include already exported' tick karo.)",
        };
      }
      await audit(tx, session, {
        entity: "TallyExport",
        entityId: session.firmId,
        action: "CREATE",
        after: { module: "CHALAN", vouchers: out.length, skipped },
      });
      const range = [data.dateFrom, data.dateTo].filter(Boolean).join("_to_") || "all";
      return {
        ok: true as const,
        xml: buildVouchersXml(out),
        fileName: `tally-chalan-${range}.xml`,
        exported: out.length,
        skipped,
      };
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Export failed" };
  }
}

/** Party ledger masters (brokers on the period's chalans) — first-time import. */
export async function runTallyChalanMasters(
  input: unknown
): Promise<{ ok: true; xml: string; fileName: string; count: number } | { ok: false; error: string }> {
  const session = requireSession();
  const parsed = z
    .object({ dateFrom: z.string().nullish(), dateTo: z.string().nullish() })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  await authorize(session, "reports", "view");
  try {
    return await withTenant(session.tenantId, async (tx) => {
      const { masters } = await buildChalanVouchers(tx, session, {
        dateFrom: parsed.data.dateFrom ? new Date(`${parsed.data.dateFrom}T00:00:00`) : null,
        dateTo: parsed.data.dateTo ? new Date(`${parsed.data.dateTo}T23:59:59`) : null,
      });
      if (!masters.length) return { ok: false as const, error: "Is period mein koi broker nahi mila." };
      return {
        ok: true as const,
        xml: buildMastersXml(masters),
        fileName: "tally-party-masters.xml",
        count: masters.length,
      };
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Masters export failed" };
  }
}
