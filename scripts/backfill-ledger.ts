/**
 * One-time backfill: posts the ledger accruals introduced on 2026-07-29 for
 * documents saved before the fix.
 *
 *  - Invoices        -> DEBIT customer / CREDIT "Freight Income"        (INVOICE)
 *  - Chalans         -> DEBIT "Lorry Hire Expense" / CREDIT broker      (CHALAN)
 *  - Chalan advances -> re-posted for all types (bank/cash/in-kind)     (CHALAN_ADVANCE)
 *  - Broker slips    -> party & owner accruals + advances               (BROKER_SLIP / BROKER_SLIP_ADVANCE)
 *
 * Idempotent: accruals are only posted where no entry of that refType exists;
 * chalan advances are reversed and re-posted (deterministic recreate).
 *
 * Run with: npx tsx scripts/backfill-ledger.ts
 */
import { prisma, withPlatform, type Tx } from "../src/lib/db";

type Side = "DEBIT" | "CREDIT";

interface Row {
  tenantId: string;
  firmId: string;
  fyId: string;
  date: Date;
  partyId?: string | null;
  accountHeadId?: string | null;
  side: Side;
  amount: number;
  refType: string;
  refId: string;
  refNo: string;
  narration: string;
}

const n = (v: unknown) => (v == null ? 0 : Number(String(v)) || 0);

const headCache = new Map<string, string>();
async function ensureHead(
  tx: Tx,
  tenantId: string,
  name: string,
  kind: "INCOME" | "EXPENSE"
): Promise<string> {
  const key = `${tenantId}:${name}`;
  const cached = headCache.get(key);
  if (cached) return cached;
  let head = await tx.accountHead.findFirst({ where: { tenantId, name }, select: { id: true } });
  if (!head) head = await tx.accountHead.create({ data: { tenantId, name, kind }, select: { id: true } });
  headCache.set(key, head.id);
  return head.id;
}

async function existingRefIds(tx: Tx, refTypes: string[]): Promise<Set<string>> {
  const rows = await tx.ledgerEntry.findMany({
    where: { refType: { in: refTypes } },
    select: { refId: true },
    distinct: ["refId"],
  });
  return new Set(rows.map((r) => r.refId));
}

async function post(tx: Tx, rows: Row[]) {
  const data = rows.filter((r) => r.amount > 0);
  if (data.length) await tx.ledgerEntry.createMany({ data });
}

async function main() {
  let invoices = 0;
  let chalans = 0;
  let chalanAdv = 0;
  let slips = 0;

  // ---- invoices ----
  await withPlatform(async (tx) => {
    const done = await existingRefIds(tx, ["INVOICE"]);
    const list = await tx.invoice.findMany({ where: { deletedAt: null } });
    for (const inv of list) {
      const gross = n(inv.grandTotal);
      if (done.has(inv.id) || gross <= 0) continue;
      const incomeHeadId = await ensureHead(tx, inv.tenantId, "Freight Income", "INCOME");
      const common = {
        tenantId: inv.tenantId,
        firmId: inv.firmId,
        fyId: inv.fyId,
        date: inv.invoiceDate,
        refType: "INVOICE",
        refId: inv.id,
        refNo: inv.invoiceNo,
      };
      await post(tx, [
        { ...common, partyId: inv.partyId, side: "DEBIT", amount: gross, narration: `Invoice ${inv.invoiceNo} (${inv.kind.replace(/_/g, " ")})` },
        { ...common, accountHeadId: incomeHeadId, side: "CREDIT", amount: gross, narration: `Freight income — invoice ${inv.invoiceNo}` },
      ]);
      invoices++;
    }
  });

  // ---- chalans: accrual + advances ----
  await withPlatform(async (tx) => {
    const done = await existingRefIds(tx, ["CHALAN"]);
    const list = await tx.chalan.findMany({ where: { deletedAt: null }, include: { advances: true } });
    const cashPartyByTenant = new Map<string, string | null>();
    for (const ch of list) {
      const gross = n(ch.grandTotal);
      if (!done.has(ch.id) && gross > 0) {
        const hireHeadId = await ensureHead(tx, ch.tenantId, "Lorry Hire Expense", "EXPENSE");
        const common = {
          tenantId: ch.tenantId,
          firmId: ch.firmId,
          fyId: ch.fyId,
          date: ch.chalanDate,
          refType: "CHALAN",
          refId: ch.id,
          refNo: ch.chalanNo,
        };
        await post(tx, [
          { ...common, accountHeadId: hireHeadId, side: "DEBIT", amount: gross, narration: `Lorry hire — chalan ${ch.chalanNo}` },
          { ...common, partyId: ch.brokerId, side: "CREDIT", amount: gross, narration: `Hire payable against chalan ${ch.chalanNo}` },
        ]);
        chalans++;
      }

      if (!ch.advances.length) continue;
      if (!cashPartyByTenant.has(ch.tenantId)) {
        const cash = await tx.party.findFirst({
          where: { tenantId: ch.tenantId, ledgerGroup: "CASH", isActive: true },
          orderBy: { name: "asc" },
          select: { id: true },
        });
        cashPartyByTenant.set(ch.tenantId, cash?.id ?? null);
      }
      const cashPartyId = cashPartyByTenant.get(ch.tenantId) ?? null;

      await tx.ledgerEntry.deleteMany({ where: { refType: "CHALAN_ADVANCE", refId: ch.id } });
      const rows: Row[] = [];
      for (const a of ch.advances) {
        const amount = n(a.amount);
        if (amount <= 0) continue;
        let creditLeg: { partyId?: string; accountHeadId?: string } | null = null;
        if (a.type === "BANK") {
          creditLeg = a.bankPartyId ? { partyId: a.bankPartyId } : null;
        } else if (a.type === "CASH" && cashPartyId) {
          creditLeg = { partyId: cashPartyId };
        } else if (a.type !== "CASH") {
          const label = a.type.charAt(0) + a.type.slice(1).toLowerCase().replace(/_/g, " ");
          creditLeg = { accountHeadId: await ensureHead(tx, ch.tenantId, `${label} Advance (Chalan)`, "EXPENSE") };
        }
        if (!creditLeg) continue;
        const common = {
          tenantId: ch.tenantId,
          firmId: ch.firmId,
          fyId: ch.fyId,
          date: a.date ?? ch.chalanDate,
          refType: "CHALAN_ADVANCE",
          refId: ch.id,
          refNo: ch.chalanNo,
          narration: `${a.type === "BANK" ? "Bank" : a.type === "CASH" ? "Cash" : a.type.replace(/_/g, " ")} advance against chalan ${ch.chalanNo}${a.remarks ? " — " + a.remarks : ""}`,
        };
        rows.push(
          { ...common, ...creditLeg, side: "CREDIT", amount },
          { ...common, partyId: ch.brokerId, side: "DEBIT", amount }
        );
      }
      await post(tx, rows);
      if (rows.length) chalanAdv++;
    }
  });

  // ---- broker slips: accruals + advances ----
  await withPlatform(async (tx) => {
    const doneAccrual = await existingRefIds(tx, ["BROKER_SLIP"]);
    const doneAdv = await existingRefIds(tx, ["BROKER_SLIP_ADVANCE"]);
    const list = await tx.brokerSlip.findMany({ where: { deletedAt: null } });
    for (const s of list) {
      const rows: Row[] = [];
      const base = { tenantId: s.tenantId, firmId: s.firmId, fyId: s.fyId, refId: s.id, refNo: s.slipNo };
      if (!doneAccrual.has(s.id)) {
        const common = { ...base, date: s.slipDate, refType: "BROKER_SLIP" };
        const pNet = n(s.pNetAmt);
        const vNet = n(s.vNetAmt);
        if (s.partyId && pNet > 0) {
          const incomeHeadId = await ensureHead(tx, s.tenantId, "Freight Income", "INCOME");
          rows.push(
            { ...common, partyId: s.partyId, side: "DEBIT", amount: pNet, narration: `Freight receivable — broker slip ${s.slipNo}` },
            { ...common, accountHeadId: incomeHeadId, side: "CREDIT", amount: pNet, narration: `Freight income — broker slip ${s.slipNo}` }
          );
        }
        if (s.ownerId && vNet > 0) {
          const hireHeadId = await ensureHead(tx, s.tenantId, "Lorry Hire Expense", "EXPENSE");
          rows.push(
            { ...common, accountHeadId: hireHeadId, side: "DEBIT", amount: vNet, narration: `Lorry hire — broker slip ${s.slipNo}` },
            { ...common, partyId: s.ownerId, side: "CREDIT", amount: vNet, narration: `Hire payable — broker slip ${s.slipNo}` }
          );
        }
      }
      if (!doneAdv.has(s.id) && Array.isArray(s.advances)) {
        for (const raw of s.advances as unknown[]) {
          const a = raw as { side?: string; type?: string; headKind?: string | null; headId?: string | null; amount?: number; date?: string | null; remarks?: string | null };
          const amount = n(a.amount);
          if (amount <= 0 || !a.headId) continue;
          const counterPartyId = a.side === "P" ? s.partyId : s.ownerId;
          if (!counterPartyId) continue;
          const headLeg =
            a.headKind === "BANK" || a.headKind === "CASH"
              ? { partyId: a.headId }
              : { accountHeadId: a.headId };
          const common = {
            ...base,
            date: a.date ? new Date(a.date.includes("T") ? a.date : `${a.date}T00:00:00`) : s.slipDate,
            refType: "BROKER_SLIP_ADVANCE",
            narration: `${(a.type ?? "").replace(/_/g, " ")} advance (${a.side === "P" ? "received" : "paid"}) — broker slip ${s.slipNo}${a.remarks ? " — " + a.remarks : ""}`,
          };
          rows.push(
            { ...common, ...headLeg, side: a.side === "P" ? "DEBIT" : "CREDIT", amount },
            { ...common, partyId: counterPartyId, side: a.side === "P" ? "CREDIT" : "DEBIT", amount }
          );
        }
      }
      if (rows.length) {
        await post(tx, rows);
        slips++;
      }
    }
  });

  console.log(
    `Backfill complete: ${invoices} invoice(s), ${chalans} chalan accrual(s), ${chalanAdv} chalan advance set(s), ${slips} broker slip(s) posted.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
