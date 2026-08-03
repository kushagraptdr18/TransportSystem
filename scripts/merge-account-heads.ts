/**
 * One-time consolidation for the Common Accounting Ledger Framework.
 *
 * Modules used to name a head per direction — "Detention Charges" on a chalan,
 * "Detention Income" on a broker slip, "Commission Allowed" vs "Commission
 * Income", "LD Charge Allowed" vs "LD Charge Recovered", a voucher's
 * adjustment-only "TDS" / "DEDUCTION" / "ROUND OFF" heads. Code now resolves
 * every one of those to a single canonical head (`src/lib/account-heads.ts`);
 * this repoints the history that was already posted to the old ones.
 *
 * For each tenant: every head whose name is an alias of a common head is merged
 * into the canonical head (created if missing) — ledger entries, voucher
 * adjustments, office transactions, vehicle expenses and chalan-advance rows are
 * repointed, then the now-empty duplicate head is deleted. Amounts and sides are
 * never touched, so Trial Balance and P&L totals are unchanged; they just stop
 * being split across two lines.
 *
 * Idempotent — running it twice is a no-op.
 *
 * Run with: npx tsx scripts/merge-account-heads.ts
 */
import { prisma, withPlatform } from "../src/lib/db";
import { commonHead } from "../src/lib/account-heads";

async function main() {
  await withPlatform(async (tx) => {
    const heads = await tx.accountHead.findMany({ orderBy: { name: "asc" } });

    // tenant -> canonical name -> head ids that must become one
    const groups = new Map<string, Map<string, string[]>>();
    for (const head of heads) {
      const canonical = commonHead(head.name);
      if (!canonical) continue;
      const byName = groups.get(head.tenantId) ?? new Map<string, string[]>();
      byName.set(canonical.name, [...(byName.get(canonical.name) ?? []), head.id]);
      groups.set(head.tenantId, byName);
    }

    let merged = 0;
    for (const [tenantId, byName] of Array.from(groups.entries())) {
      for (const [name, ids] of Array.from(byName.entries())) {
        const canonical = commonHead(name)!;
        const target = await tx.accountHead.upsert({
          where: { tenantId_name: { tenantId, name: canonical.name } },
          create: { tenantId, name: canonical.name, kind: canonical.kind },
          // a head that already exists under the canonical name may still carry
          // the old kind (an ADJUSTMENT "ROUND OFF", say) — fix its class too
          update: { kind: canonical.kind },
        });
        const stale = ids.filter((id) => id !== target.id);
        if (!stale.length) continue;

        await tx.ledgerEntry.updateMany({
          where: { accountHeadId: { in: stale } },
          data: { accountHeadId: target.id },
        });
        await tx.voucherAdjustment.updateMany({
          where: { accountHeadId: { in: stale } },
          data: { accountHeadId: target.id },
        });
        await tx.officeTransaction.updateMany({
          where: { headId: { in: stale } },
          data: { headId: target.id },
        });
        await tx.vehicleExpenseVoucher.updateMany({
          where: { headId: { in: stale } },
          data: { headId: target.id },
        });
        await tx.chalanAdvance.updateMany({
          where: { headId: { in: stale } },
          data: { headId: target.id },
        });
        await tx.accountHead.deleteMany({ where: { id: { in: stale } } });
        merged += stale.length;
        console.log(`  ${tenantId}: ${stale.length} head(s) merged into "${canonical.name}"`);
      }
    }
    console.log(merged ? `\nMerged ${merged} duplicate head(s).` : "\nNothing to merge.");
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
