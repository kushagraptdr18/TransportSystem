/**
 * Clear operational data, keeping only what is needed to sign in and keep the
 * firm's identity: Tenant, Firm, User, UserFirm, UserPermission, FinancialYear.
 *
 * Everything else goes — masters (parties, cities, vehicles, products, drivers,
 * account heads) and every transaction (LRs, chalans, bills, vouchers, ledger,
 * trips, PODs, shortages, advances).
 *
 * Deliberately NOT the same thing as scripts/wipe-db.ts, which truncates
 * everything including the tenant and the logins. This one leaves a usable,
 * empty system.
 *
 *   npx tsx scripts/wipe-data.ts              # dry run, prints what it would do
 *   npx tsx scripts/wipe-data.ts --yes        # actually does it
 *
 * Runs against DIRECT_DATABASE_URL (falling back to DATABASE_URL). Set it in
 * the environment for the run — do not edit .env, or the next local command
 * quietly points at production too:
 *
 *   DIRECT_DATABASE_URL="postgresql://..." npx tsx scripts/wipe-data.ts --yes
 */
import { PrismaClient } from "@prisma/client";

const url = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
if (!url) throw new Error("No DIRECT_DATABASE_URL / DATABASE_URL in environment");

/** Tables whose rows survive. Everything else in `public` is truncated. */
const KEEP = [
  "_prisma_migrations",
  "Tenant",
  "Firm",
  "FinancialYear",
  "User",
  "UserFirm",
  "UserPermission",
  // document numbering: kept so a fresh LR does not reuse a number that was
  // already printed and handed to a customer before the wipe
  "DocumentSequence",
];

const CONFIRMED = process.argv.includes("--yes");

const prisma = new PrismaClient({ datasources: { db: { url } } });

function host(connectionString: string): string {
  try {
    return new URL(connectionString).host;
  } catch {
    return "unknown host";
  }
}

async function main() {
  const rows = await prisma.$queryRawUnsafe<{ tablename: string }[]>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
  );
  const targets = rows.map((r) => r.tablename).filter((t) => !KEEP.includes(t));
  const kept = rows.map((r) => r.tablename).filter((t) => KEEP.includes(t));

  // a KEEP entry that matches no table is almost always a typo, and a typo here
  // means silently deleting something that was meant to survive
  const missing = KEEP.filter((k) => !rows.some((r) => r.tablename === k));
  if (missing.length) {
    throw new Error(
      `KEEP lists tables that do not exist: ${missing.join(", ")}. ` +
        `Fix the list before running — a mistyped name deletes the table it was meant to protect.`
    );
  }

  console.log(`Database : ${host(url!)}`);
  console.log(`Keeping  : ${kept.join(", ")}`);
  console.log(`Clearing : ${targets.length} tables`);

  for (const t of ["Party", "Lr", "Chalan", "Invoice", "Voucher", "LedgerEntry", "Trip"]) {
    if (!targets.includes(t)) continue;
    const [{ count }] = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT count(*)::bigint AS count FROM "${t}"`
    );
    console.log(`  ${t}: ${count} rows`);
  }

  if (!CONFIRMED) {
    console.log("\nDry run. Nothing was changed. Re-run with --yes to apply.");
    return;
  }

  const list = targets.map((t) => `"${t}"`).join(", ");
  // one statement so it is one transaction: either every table is cleared or
  // none is, never a half-wiped database with dangling references
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  console.log(`\nTruncated ${targets.length} tables.`);

  for (const t of kept) {
    if (t === "_prisma_migrations") continue;
    const [{ count }] = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT count(*)::bigint AS count FROM "${t}"`
    );
    console.log(`  kept ${t}: ${count} rows`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
