/**
 * Seed the State master with every Indian state / UT and its GST state code.
 * Idempotent: existing states are updated with the code, missing ones created.
 *
 * Run:  DIRECT_DATABASE_URL=<url> npx tsx scripts/seed-states.ts
 */
import { PrismaClient } from "@prisma/client";
import { INDIA_STATES } from "../src/lib/india-states";

const url = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("Set DIRECT_DATABASE_URL (or DATABASE_URL) first.");
  process.exit(1);
}
const prisma = new PrismaClient({ datasources: { db: { url } } });

const STATES: [string, string][] = INDIA_STATES.map((s) => [s.name, s.gstCode]);

async function main() {
  const tenants = await prisma.tenant.findMany();
  if (tenants.length === 0) {
    console.error("No tenant found — nothing to seed.");
    process.exit(1);
  }
  for (const t of tenants) {
    let created = 0;
    let updated = 0;
    for (const [name, gstCode] of STATES) {
      const existing = await prisma.state.findUnique({
        where: { tenantId_name: { tenantId: t.id, name } },
      });
      if (existing) {
        if (existing.gstCode !== gstCode) {
          await prisma.state.update({ where: { id: existing.id }, data: { gstCode } });
          updated++;
        }
      } else {
        await prisma.state.create({ data: { tenantId: t.id, name, gstCode } });
        created++;
      }
    }
    console.log(`Tenant ${t.id}: ${created} states created, ${updated} updated, ${STATES.length} total.`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
