/**
 * One-time repair: voucher shortage double-posting + misfiled "Other Ded.".
 *
 * Until Aug 2026 a money voucher with per-allocation shortage posted the
 * Shortage head TWICE — once as its own balanced header leg and again as the
 * shortage register's deliberately single-leg posting (SHORTAGE_REC credit on
 * payment / SHORTAGE debit on receipt). Every such voucher left the firm-wide
 * trial balance out by exactly the shortage, and doubled the Shortage head.
 * Separately, per-row "Other Ded." amounts were folded into the header
 * deduction and misfiled under the Shortage head instead of Other Charges.
 *
 * saveVoucher now posts:  Shortage head = header deduction − row other −
 * register-covered shortage (usually 0), Other Charges (deduction side) =
 * row other. This script rebuilds ONLY the VOUCHER-refType legs on the
 * Shortage and Other Charges heads of historical vouchers to that shape;
 * the register's SHORTAGE/SHORTAGE_REC legs were always correct and are
 * untouched.
 *
 * Idempotent: a voucher whose legs already match the repaired shape is
 * skipped.
 *
 * Run with:  npx tsx scripts/fix-voucher-shortage-postings.ts        (applies)
 *            npx tsx scripts/fix-voucher-shortage-postings.ts --dry  (report)
 */
import { withPlatform } from "../src/lib/db";

const DRY = process.argv.includes("--dry");
const round2 = (n: number) => Math.round(n * 100) / 100;
const near = (a: number, b: number) => Math.abs(a - b) < 0.011;

async function main() {
  await withPlatform(async (tx) => {
    const vouchers = await tx.voucher.findMany({
      where: { deletedAt: null, type: { in: ["PAYMENT", "RECEIPT", "JOURNAL"] } },
      include: { allocations: true },
    });

    // Shortage / Other Charges head ids per tenant
    const headCache = new Map<string, { shortage: string | null; other: string | null }>();
    const headsOf = async (tenantId: string) => {
      const hit = headCache.get(tenantId);
      if (hit) return hit;
      const [shortage, other] = await Promise.all([
        tx.accountHead.findFirst({ where: { tenantId, name: "Shortage" }, select: { id: true } }),
        tx.accountHead.findFirst({ where: { tenantId, name: "Other Charges" }, select: { id: true } }),
      ]);
      const ids = { shortage: shortage?.id ?? null, other: other?.id ?? null };
      headCache.set(tenantId, ids);
      return ids;
    };
    const ensureOther = async (tenantId: string) => {
      const ids = await headsOf(tenantId);
      if (ids.other) return ids.other;
      const created = await tx.accountHead.create({
        data: { tenantId, name: "Other Charges", kind: "EXPENSE" },
      });
      ids.other = created.id;
      return created.id;
    };

    let fixed = 0;
    let clean = 0;

    for (const v of vouchers) {
      const headerDed = round2(Number(v.deduction));
      const headerOther = round2(Number(v.otherAmt));
      const rowShortage = round2(v.allocations.reduce((s, a) => s + Number(a.deduction), 0));
      const rowOther = round2(v.allocations.reduce((s, a) => s + Number(a.otherAmt), 0));
      if (headerDed <= 0.009 && headerOther <= 0.009) continue;

      const registered =
        v.partyId && (v.type === "PAYMENT" || v.type === "RECEIPT") ? rowShortage : 0;
      const wantShortage = round2(Math.max(0, headerDed - rowOther - registered));
      const wantOtherBank = rowOther;
      const wantOtherCounter = headerOther;

      const ids = await headsOf(v.tenantId);
      const bankSide = v.type === "RECEIPT" ? "DEBIT" : "CREDIT";
      const counterSide = bankSide === "CREDIT" ? "DEBIT" : "CREDIT";

      const legs = await tx.ledgerEntry.findMany({
        where: {
          refType: "VOUCHER",
          refId: v.id,
          accountHeadId: { in: [ids.shortage, ids.other].filter(Boolean) as string[] },
        },
      });
      const sum = (headId: string | null, side: string) =>
        round2(
          legs
            .filter((e) => e.accountHeadId === headId && e.side === side)
            .reduce((s, e) => s + Number(e.amount), 0)
        );
      const haveShortage = sum(ids.shortage, bankSide);
      const haveOtherBank = sum(ids.other, bankSide);
      const haveOtherCounter = sum(ids.other, counterSide);

      if (
        near(haveShortage, wantShortage) &&
        near(haveOtherBank, wantOtherBank) &&
        near(haveOtherCounter, wantOtherCounter)
      ) {
        clean++;
        continue;
      }

      console.log(
        `  ${DRY ? "WOULD FIX" : "FIX"} ${v.type} ${v.voucherNo} (${v.id}): ` +
          `Shortage ${haveShortage} -> ${wantShortage}, Other(ded) ${haveOtherBank} -> ${wantOtherBank}` +
          (wantOtherCounter > 0 || haveOtherCounter > 0
            ? `, Other(charge) ${haveOtherCounter} -> ${wantOtherCounter}`
            : "")
      );
      if (!DRY) {
        await tx.ledgerEntry.deleteMany({ where: { id: { in: legs.map((e) => e.id) } } });
        const rows: {
          tenantId: string;
          firmId: string;
          fyId: string;
          date: Date;
          refType: string;
          refId: string;
          refNo: string;
          accountHeadId: string;
          side: "DEBIT" | "CREDIT";
          amount: number;
          narration: string;
        }[] = [];
        const base = {
          tenantId: v.tenantId,
          firmId: v.firmId,
          fyId: v.fyId,
          date: v.voucherDate,
          refType: "VOUCHER",
          refId: v.id,
          refNo: v.voucherNo,
        };
        if (wantShortage > 0.009 && ids.shortage) {
          rows.push({
            ...base,
            accountHeadId: ids.shortage,
            side: bankSide,
            amount: wantShortage,
            narration: `Shortage on ${v.type.toLowerCase()} voucher ${v.voucherNo}`,
          });
        }
        if (wantOtherBank > 0.009) {
          rows.push({
            ...base,
            accountHeadId: await ensureOther(v.tenantId),
            side: bankSide,
            amount: wantOtherBank,
            narration: `Other Charges on ${v.type.toLowerCase()} voucher ${v.voucherNo}`,
          });
        }
        if (wantOtherCounter > 0.009) {
          rows.push({
            ...base,
            accountHeadId: await ensureOther(v.tenantId),
            side: counterSide,
            amount: wantOtherCounter,
            narration: `Other Charges on ${v.type.toLowerCase()} voucher ${v.voucherNo}`,
          });
        }
        if (rows.length) await tx.ledgerEntry.createMany({ data: rows });
      }
      fixed++;
    }

    console.log(
      `\n${DRY ? "[dry run] " : ""}vouchers with deductions scanned, repaired: ${fixed}, already consistent: ${clean}`
    );
  });
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  }
);
