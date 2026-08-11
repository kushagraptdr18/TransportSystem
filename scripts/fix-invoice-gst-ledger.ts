/**
 * One-time repair: GST missing from the party ledger on GST-applicable bills.
 *
 * Until Aug 2026 saveInvoice debited the customer `grandTotal` (GST-exclusive
 * for PART_TRUCK / FULL_TRUCK / MANUAL bills) while settlement and the
 * Outstanding register work on `netTotal` (grandTotal + GST). Every such bill
 * left the GST off the party ledger — once the customer paid in full, the
 * ledger showed a phantom credit of exactly the GST, and no GST Output
 * liability was ever booked (GST-kind bills carried their tax inside the
 * freight-income remainder instead of a statutory ledger).
 *
 * saveInvoice now posts: party DEBIT netTotal · CREDIT "GST Output" (tax)
 * · CREDIT charge heads · CREDIT Freight Income (pre-tax remainder). This
 * script rebuilds the INVOICE ledger legs of historical bills to that shape.
 *
 * Idempotent: an invoice whose posted party debit already equals netTotal and
 * whose GST leg exists (when tax > 0) is recognized and skipped.
 *
 * Run with:  npx tsx scripts/fix-invoice-gst-ledger.ts        (applies)
 *            npx tsx scripts/fix-invoice-gst-ledger.ts --dry  (report only)
 */
import { withPlatform } from "../src/lib/db";
import { resolveHead } from "../src/lib/account-heads";

const DRY = process.argv.includes("--dry");
const round2 = (n: number) => Math.round(n * 100) / 100;
const near = (a: number, b: number) => Math.abs(a - b) < 0.011;

async function main() {
  await withPlatform(async (tx) => {
    const invoices = await tx.invoice.findMany({
      where: { deletedAt: null },
      include: { charges: true },
    });

    // head cache per tenant+name
    const headCache = new Map<string, string>();
    const headId = async (tenantId: string, rawName: string, kind: "INCOME" | "EXPENSE") => {
      const head = resolveHead(rawName, kind);
      const key = `${tenantId}:${head.name}`;
      const hit = headCache.get(key);
      if (hit) return hit;
      const existing = await tx.accountHead.findFirst({
        where: { tenantId, name: head.name },
        select: { id: true },
      });
      const id =
        existing?.id ??
        (
          await tx.accountHead.create({
            data: { tenantId, name: head.name, kind: head.kind === "ADJUSTMENT" ? "EXPENSE" : head.kind },
          })
        ).id;
      headCache.set(key, id);
      return id;
    };

    let fixed = 0;
    let clean = 0;
    let skipped = 0;

    for (const inv of invoices) {
      const netTotal = round2(Number(inv.netTotal));
      if (netTotal <= 0) {
        skipped++;
        continue;
      }
      const gstTotal = round2(Number(inv.cgstAmt) + Number(inv.sgstAmt) + Number(inv.igstAmt));
      const label = `${inv.kind} ${inv.invoiceNo} (${inv.id})`;

      const existing = await tx.ledgerEntry.findMany({
        where: { refType: "INVOICE", refId: inv.id },
      });
      const partyDebit = round2(
        existing
          .filter((e) => e.partyId === inv.partyId && e.side === "DEBIT")
          .reduce((s, e) => s + Number(e.amount), 0)
      );
      const gstOutputId = await headId(inv.tenantId, "GST Output", "INCOME");
      const hasGstLeg = existing.some((e) => e.accountHeadId === gstOutputId);

      if (near(partyDebit, netTotal) && (gstTotal <= 0.009 || hasGstLeg)) {
        clean++;
        continue; // already the repaired shape (saved after the fix)
      }

      // rebuild the full INVOICE posting, mirroring saveInvoice exactly
      const common = {
        tenantId: inv.tenantId,
        firmId: inv.firmId,
        fyId: inv.fyId,
        date: inv.invoiceDate,
        refType: "INVOICE",
        refId: inv.id,
        refNo: inv.invoiceNo,
      };
      type Row = typeof common & {
        partyId?: string | null;
        accountHeadId?: string | null;
        side: "DEBIT" | "CREDIT";
        amount: number;
        narration: string;
      };
      const rows: Row[] = [
        {
          ...common,
          partyId: inv.partyId,
          side: "DEBIT",
          amount: netTotal,
          narration: `Invoice ${inv.invoiceNo} (${inv.kind.replace(/_/g, " ")})`,
        },
      ];
      if (gstTotal > 0.009) {
        rows.push({
          ...common,
          accountHeadId: gstOutputId,
          side: "CREDIT",
          amount: gstTotal,
          narration: `GST on invoice ${inv.invoiceNo}`,
        });
      }
      const billedCharges = inv.charges.filter((c) => round2(Number(c.amount)) > 0);
      const preTax = round2(netTotal - gstTotal);
      const splittable =
        round2(billedCharges.reduce((s, c) => s + Number(c.amount), 0)) < preTax - 0.009;
      let chargesTotal = 0;
      for (const c of splittable ? billedCharges : []) {
        const amount = round2(Number(c.amount));
        chargesTotal = round2(chargesTotal + amount);
        rows.push({
          ...common,
          accountHeadId: await headId(inv.tenantId, c.chargeType, "INCOME"),
          side: "CREDIT",
          amount,
          narration: `${c.chargeType}${c.description ? ` (${c.description})` : ""} — invoice ${inv.invoiceNo}`,
        });
      }
      const freight = round2(preTax - chargesTotal);
      if (freight > 0) {
        rows.push({
          ...common,
          accountHeadId: await headId(inv.tenantId, "Freight Income", "INCOME"),
          side: "CREDIT",
          amount: freight,
          narration: `Freight income — invoice ${inv.invoiceNo}`,
        });
      }

      console.log(
        `  ${DRY ? "WOULD FIX" : "FIX"} ${label}: party debit ${partyDebit} -> ${netTotal}` +
          (gstTotal > 0.009 ? `, GST leg ${hasGstLeg ? "present" : "missing"} ${gstTotal}` : "")
      );
      if (!DRY) {
        await tx.ledgerEntry.deleteMany({ where: { refType: "INVOICE", refId: inv.id } });
        await tx.ledgerEntry.createMany({ data: rows });
      }
      fixed++;
    }

    console.log(
      `\n${DRY ? "[dry run] " : ""}invoices: ${invoices.length}, repaired: ${fixed}, ` +
        `already consistent: ${clean}, zero-value skipped: ${skipped}`
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
