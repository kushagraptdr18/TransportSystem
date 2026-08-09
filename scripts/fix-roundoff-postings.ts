/**
 * One-time repair for round-off double-posting on money vouchers.
 *
 * Until Aug 2026 the voucher entry screen packed allocation round-off into the
 * header `amount` (gross) AND `deduction`, while the server ALSO posted the
 * round-off pair (party leg + Round Off head). The result, per affected
 * receipt/payment voucher, was:
 *
 *   - the party settled for gross + round-off (a phantom balance of exactly
 *     the round-off left open the other way on the party ledger), and
 *   - the round-off amount misfiled under the Shortage head as well as being
 *     correctly posted to the Round Off head.
 *
 * The entry screen no longer sends round-off inside the header figures, so the
 * pair is the single posting of it. This script repairs history to match:
 *
 *   For every live RECEIPT/PAYMENT voucher whose allocations carry a net
 *   round-off `ro`:
 *     1. header: amount -= ro, deduction -= ro (netAmount is unchanged);
 *     2. ledger: the main counter leg(s) posted at the old gross come down by
 *        `ro`, and the Shortage-head leg posted from the old header deduction
 *        comes down by `ro` (deleted when nothing real remains).
 *
 * Expected values are derived from netAmount + the allocation rows (the ground
 * truth), so the script is idempotent: an already-consistent voucher is
 * recognized and skipped. Anything that matches neither the broken nor the
 * repaired shape is reported and left untouched for manual review.
 *
 * Run with:  npx tsx scripts/fix-roundoff-postings.ts        (applies)
 *            npx tsx scripts/fix-roundoff-postings.ts --dry  (report only)
 */
import { prisma, withPlatform } from "../src/lib/db";

const DRY = process.argv.includes("--dry");
const round2 = (n: number) => Math.round(n * 100) / 100;
const near = (a: number, b: number) => Math.abs(a - b) < 0.011;

async function main() {
  await withPlatform(async (tx) => {
    const vouchers = await tx.voucher.findMany({
      where: { deletedAt: null, type: { in: ["RECEIPT", "PAYMENT"] } },
      include: { allocations: true },
    });

    let fixed = 0;
    let clean = 0;
    let manual = 0;

    for (const v of vouchers) {
      const ro = round2(v.allocations.reduce((s, a) => s + Number(a.roundOff), 0));
      if (Math.abs(ro) <= 0.009) continue;

      const label = `${v.type} ${v.voucherNo} (${v.id})`;
      const net = round2(Number(v.netAmount));
      const allocDed = round2(
        v.allocations.reduce((s, a) => s + Number(a.deduction) + Number(a.otherAmt), 0)
      );
      if (Number(v.otherAmt) > 0.009) {
        console.log(`  MANUAL ${label}: header otherAmt ${v.otherAmt} — review by hand`);
        manual++;
        continue;
      }
      // target header shape (round-off excluded), anchored on the invariant
      // netAmount = amount − tds − deduction
      const dedTarget = allocDed;
      const amtTarget = round2(net + Number(v.tdsAmt) + dedTarget);
      const amtOld = round2(Number(v.amount));
      const dedOld = round2(Number(v.deduction));

      if (near(amtOld, amtTarget) && near(dedOld, dedTarget)) {
        clean++;
        continue; // already consistent (saved after the fix, or repaired earlier)
      }
      if (!near(amtOld, round2(amtTarget + ro)) || !near(dedOld, round2(dedTarget + ro))) {
        console.log(
          `  MANUAL ${label}: header amount ${amtOld}/deduction ${dedOld} match neither the ` +
            `broken (+${ro}) nor the repaired shape (expected ${amtTarget}/${dedTarget})`
        );
        manual++;
        continue;
      }

      const counterSide = v.type === "PAYMENT" ? "DEBIT" : "CREDIT";
      const bankSide = v.type === "PAYMENT" ? "CREDIT" : "DEBIT";
      const entries = await tx.ledgerEntry.findMany({
        where: { refType: "VOUCHER", refId: v.id },
      });
      // the gross counter leg(s): party and/or vehicle, posted at the old
      // header amount — the round-off pair's leg is excluded by its narration
      const grossLegs = entries.filter(
        (e) =>
          e.side === counterSide &&
          near(Number(e.amount), amtOld) &&
          !(e.narration ?? "").startsWith("Round off") &&
          ((v.partyId && e.partyId === v.partyId) ||
            (!v.partyId && v.accountHeadId && e.accountHeadId === v.accountHeadId) ||
            (v.vehicleId && e.vehicleId === v.vehicleId))
      );
      // the Shortage-head leg posted from the old header deduction
      const shortageLegs = entries.filter(
        (e) =>
          e.side === bankSide &&
          near(Number(e.amount), dedOld) &&
          (e.narration ?? "").startsWith("Shortage on")
      );
      if (!grossLegs.length || !shortageLegs.length) {
        console.log(
          `  MANUAL ${label}: expected ledger legs not found ` +
            `(gross ${grossLegs.length}, shortage ${shortageLegs.length}) — review by hand`
        );
        manual++;
        continue;
      }

      console.log(
        `  ${DRY ? "WOULD FIX" : "FIX"} ${label}: round-off ${ro} — ` +
          `amount ${amtOld} -> ${amtTarget}, deduction ${dedOld} -> ${dedTarget}, ` +
          `${grossLegs.length} gross leg(s), ${shortageLegs.length} shortage leg(s)`
      );
      fixed++;
      if (DRY) continue;

      for (const e of grossLegs) {
        // zero-value legs are never posted, so a gross that repairs to zero
        // (pure round-off settlement) removes the leg rather than zeroing it
        if (amtTarget > 0.009) {
          await tx.ledgerEntry.update({ where: { id: e.id }, data: { amount: amtTarget } });
        } else {
          await tx.ledgerEntry.delete({ where: { id: e.id } });
        }
      }
      for (const e of shortageLegs) {
        if (dedTarget > 0.009) {
          await tx.ledgerEntry.update({ where: { id: e.id }, data: { amount: dedTarget } });
        } else {
          await tx.ledgerEntry.delete({ where: { id: e.id } });
        }
      }
      await tx.voucher.update({
        where: { id: v.id },
        data: { amount: amtTarget, deduction: dedTarget },
      });
    }

    console.log(
      `\n${DRY ? "Would fix" : "Fixed"} ${fixed} voucher(s); ` +
        `${clean} already consistent; ${manual} need manual review.`
    );
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
