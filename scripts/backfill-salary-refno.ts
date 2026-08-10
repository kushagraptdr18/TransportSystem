/**
 * One-time backfill: staff salary references become "SUNIL KUMAR/08/2026".
 *
 * New salaries already save refNo as NAME/MM/YYYY (voucherNo keeps the
 * PAY-#### sequence). This renames the history to match, in all three places
 * the reference is shown:
 *
 *   1. StaffSalary.refNo
 *   2. LedgerEntry.refNo for that salary's STAFF_SALARY entries
 *   3. VoucherAllocation.refNo of payment-voucher allocations against it
 *      (the copied reference a voucher register displays)
 *
 * Idempotent — rows already in the new format are skipped.
 *
 * Run with:  npx tsx scripts/backfill-salary-refno.ts        (applies)
 *            npx tsx scripts/backfill-salary-refno.ts --dry  (report only)
 */
import { prisma, withPlatform } from "../src/lib/db";

const DRY = process.argv.includes("--dry");

function salaryRefNo(partyName: string, month: string): string {
  const [y, m] = month.split("-");
  return `${partyName.trim().toUpperCase()}/${m}/${y}`;
}

async function main() {
  await withPlatform(async (tx) => {
    const salaries = await tx.staffSalary.findMany({
      select: { id: true, partyId: true, month: true, refNo: true, voucherNo: true },
    });
    if (!salaries.length) {
      console.log("No staff salaries found.");
      return;
    }
    const parties = await tx.party.findMany({
      where: { id: { in: Array.from(new Set(salaries.map((s) => s.partyId))) } },
      select: { id: true, name: true },
    });
    const nameById = new Map(parties.map((p) => [p.id, p.name]));

    let updated = 0;
    let skipped = 0;
    for (const s of salaries) {
      const name = nameById.get(s.partyId);
      if (!name) {
        console.log(`  SKIP ${s.id} (${s.month}): party not found`);
        skipped++;
        continue;
      }
      const target = salaryRefNo(name, s.month);
      if (s.refNo === target) {
        skipped++;
        continue;
      }
      console.log(
        `  ${DRY ? "WOULD SET" : "SET"} ${s.voucherNo ?? s.id} (${s.month}): "${s.refNo ?? ""}" -> "${target}"`
      );
      updated++;
      if (DRY) continue;

      await tx.staffSalary.update({ where: { id: s.id }, data: { refNo: target } });
      await tx.ledgerEntry.updateMany({
        where: { refType: "STAFF_SALARY", refId: s.id },
        data: { refNo: target },
      });
      await tx.voucherAllocation.updateMany({
        where: { refType: "STAFF_PAYROLL", refId: s.id },
        data: { refNo: target },
      });
    }
    console.log(
      `\n${DRY ? "Would update" : "Updated"} ${updated} salary reference(s); ${skipped} already current or skipped.`
    );
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
