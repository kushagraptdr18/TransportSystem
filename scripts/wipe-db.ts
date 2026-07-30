/**
 * Wipe ALL rows from every table in the public schema, keeping the tables,
 * sequences (reset to 1) and _prisma_migrations history intact.
 * Uses DIRECT_DATABASE_URL (table owner) so RLS/privileges don't interfere.
 */
import { PrismaClient } from "@prisma/client";

const url = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
if (!url) throw new Error("No DIRECT_DATABASE_URL / DATABASE_URL in environment");

const prisma = new PrismaClient({ datasources: { db: { url } } });

async function main() {
  const tables = await prisma.$queryRawUnsafe<{ tablename: string }[]>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' ORDER BY tablename`
  );
  if (!tables.length) {
    console.log("No tables found.");
    return;
  }
  const list = tables.map((t) => `"${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  console.log(`Truncated ${tables.length} tables.`);

  // verify a few key tables are empty
  const counts = await prisma.$queryRawUnsafe<{ relname: string; n: bigint }[]>(
    `SELECT c.relname, (SELECT count(*) FROM pg_catalog.pg_class x WHERE false)::bigint AS n FROM pg_class c WHERE false`
  );
  void counts;
  for (const t of ["Tenant", "Party", "Lr", "Invoice", "LedgerEntry", "Voucher"]) {
    try {
      const [{ count }] = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
        `SELECT count(*)::bigint AS count FROM "${t}"`
      );
      console.log(`${t}: ${count} rows`);
    } catch {
      /* table may not exist under this name */
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
