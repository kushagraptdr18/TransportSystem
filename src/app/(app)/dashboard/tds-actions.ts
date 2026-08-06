"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { toNum } from "@/lib/utils";
import { round2 } from "@/lib/calc/tds";
import { audit } from "@/lib/audit";

/**
 * TDS Threshold Monitor — supplier-wise FY totals per TDS section (heads are
 * connected in the TDS Master). Sources: Vehicle Expenses, Office Expenses and
 * AdBlue purchases. Chalan / broker-slip / hire TDS is NOT tracked here — it
 * has its own reports.
 */

export interface TdsMonitorDoc {
  refNo: string;
  date: string;
  head: string;
  source: string;
  amount: number;
}

export interface TdsMonitorRow {
  partyId: string | null;
  party: string;
  pan: string | null;
  sectionId: string;
  sectionCode: string;
  sectionOldCode: string | null;
  sectionName: string;
  basis: "FULL" | "EXCESS";
  annualLimit: number;
  total: number;
  remaining: number; // till the limit (0 when crossed)
  crossed: boolean;
  nearLimit: boolean; // >= 90% of the limit, not yet crossed
  singleBillHit: boolean;
  suggestedRate: number | null; // null = no PAN
  tdsBase: number;
  tdsDue: number;
  deducted: number;
  toDeduct: number;
  docs: TdsMonitorDoc[];
  deductions: { id: string; date: string; amount: number; remarks: string | null }[];
}

export interface TdsMonitorData {
  rows: TdsMonitorRow[];
  crossedCount: number;
  nearCount: number;
  toDeductTotal: number;
}

const isIndividualPan = (pan: string) => ["P", "H"].includes(pan[3]?.toUpperCase() ?? "");

export async function getTdsMonitor(): Promise<
  { ok: true; data: TdsMonitorData } | { ok: false; error: string }
> {
  const session = requireSession();
  try {
    const scope = { firmId: session.firmId, fyId: session.fyId };
    const data = await withTenant(session.tenantId, async (tx) => {
      const [sections, heads, parties, office, vehicle, adblue, deductions] = await Promise.all([
        tx.tdsSection.findMany({ where: { deletedAt: null } }),
        tx.accountHead.findMany({ select: { id: true, name: true } }),
        tx.party.findMany({ select: { id: true, name: true, pan: true } }),
        tx.officeTransaction.findMany({
          where: { ...scope, deletedAt: null, txnType: "EXPENSE" },
          include: { lines: true },
        }),
        tx.vehicleExpenseVoucher.findMany({
          where: { ...scope, deletedAt: null, txnType: "EXPENSE" },
          include: { lines: true },
        }),
        tx.adblueTxn.findMany({
          where: { ...scope, deletedAt: null, type: "REFILL", amount: { gt: 0 } },
        }),
        tx.tdsDeduction.findMany({ where: { ...scope, deletedAt: null }, orderBy: { date: "asc" } }),
      ]);

      const headName = new Map(heads.map((h) => [h.id, h.name]));
      const sectionOfHead = new Map<string, (typeof sections)[number]>();
      for (const s of sections) for (const h of s.headIds) sectionOfHead.set(h, s);
      // AdBlue posts to the "Urea Expense" head — resolve it by name
      const ureaHeadId = heads.find((h) => h.name.toLowerCase() === "urea expense")?.id ?? null;
      const partyById = new Map(parties.map((p) => [p.id, p]));

      type Acc = {
        row: TdsMonitorRow;
        billMax: number;
      };
      const acc = new Map<string, Acc>();
      const add = (
        partyId: string | null,
        headId: string,
        amount: number,
        doc: { refNo: string; date: Date; source: string }
      ) => {
        if (amount <= 0) return;
        const section = sectionOfHead.get(headId);
        if (!section) return; // head not connected to any section
        const key = `${partyId ?? "none"}|${section.id}`;
        let a = acc.get(key);
        if (!a) {
          const p = partyId ? partyById.get(partyId) : null;
          a = {
            row: {
              partyId,
              party: p?.name ?? "(No Supplier)",
              pan: p?.pan ?? null,
              sectionId: section.id,
              sectionCode: section.code,
              sectionOldCode: section.oldCode,
              sectionName: section.name,
              basis: section.basis as "FULL" | "EXCESS",
              annualLimit: toNum(String(section.annualLimit)),
              total: 0,
              remaining: 0,
              crossed: false,
              nearLimit: false,
              singleBillHit: false,
              suggestedRate: null,
              tdsBase: 0,
              tdsDue: 0,
              deducted: 0,
              toDeduct: 0,
              docs: [],
              deductions: [],
            },
            billMax: 0,
          };
          acc.set(key, a);
        }
        a.row.total += amount;
        a.billMax = Math.max(a.billMax, amount);
        a.row.docs.push({
          refNo: doc.refNo,
          date: doc.date.toISOString(),
          head: headName.get(headId) ?? "",
          source: doc.source,
          amount: round2(amount),
        });
      };

      for (const t of office) {
        const contributions = t.lines.length
          ? t.lines.map((l) => ({ headId: l.headId, amount: toNum(String(l.amount)) }))
          : [{ headId: t.headId, amount: toNum(String(t.amount)) }];
        for (const c of contributions)
          add(t.partyId, c.headId, c.amount, { refNo: t.voucherNo, date: t.date, source: "Office" });
      }
      for (const v of vehicle) {
        const contributions = v.lines.length
          ? v.lines.map((l) => ({ headId: l.headId, amount: toNum(String(l.amount)) }))
          : [{ headId: v.headId, amount: toNum(String(v.amount)) }];
        for (const c of contributions)
          add(v.partyId, c.headId, c.amount, { refNo: v.voucherNo, date: v.date, source: "Vehicle" });
      }
      if (ureaHeadId) {
        for (const a of adblue) {
          add(a.supplierId, ureaHeadId, toNum(String(a.amount)), {
            refNo: a.billNo || a.refNo || "ADBLUE",
            date: a.billDate ?? a.date,
            source: "AdBlue",
          });
        }
      }

      // deducted amounts per party+section
      for (const d of deductions) {
        const key = `${d.partyId}|${d.sectionId}`;
        const a = acc.get(key);
        if (!a) continue;
        a.row.deducted += toNum(String(d.amount));
        a.row.deductions.push({
          id: d.id,
          date: d.date.toISOString(),
          amount: round2(toNum(String(d.amount))),
          remarks: d.remarks,
        });
      }

      const rows: TdsMonitorRow[] = [];
      for (const { row, billMax } of Array.from(acc.values())) {
        const section = sections.find((s) => s.id === row.sectionId)!;
        const singleLimit = toNum(String(section.singleBillLimit));
        row.total = round2(row.total);
        row.singleBillHit = singleLimit > 0 && billMax > singleLimit;
        row.crossed = (row.annualLimit > 0 && row.total > row.annualLimit) || row.singleBillHit;
        row.remaining = row.crossed ? 0 : round2(Math.max(0, row.annualLimit - row.total));
        row.nearLimit = !row.crossed && row.annualLimit > 0 && row.total >= 0.9 * row.annualLimit;
        if (row.pan && row.pan.length >= 4) {
          row.suggestedRate = isIndividualPan(row.pan)
            ? toNum(String(section.rateIndividual))
            : toNum(String(section.rateCompany));
        }
        if (row.crossed) {
          row.tdsBase =
            row.basis === "EXCESS" ? round2(Math.max(0, row.total - row.annualLimit)) : row.total;
          if (row.suggestedRate !== null) {
            row.tdsDue = round2((row.tdsBase * row.suggestedRate) / 100);
          }
        }
        row.deducted = round2(row.deducted);
        row.toDeduct = round2(row.tdsDue - row.deducted);
        row.docs.sort((a, b) => (a.date < b.date ? 1 : -1));
        rows.push(row);
      }
      rows.sort((a, b) => Number(b.crossed) - Number(a.crossed) || b.total - a.total);
      return {
        rows,
        crossedCount: rows.filter((r) => r.crossed).length,
        nearCount: rows.filter((r) => r.nearLimit).length,
        toDeductTotal: round2(rows.reduce((s, r) => s + Math.max(0, r.toDeduct), 0)),
      };
    });
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to load TDS monitor" };
  }
}

export async function recordTdsDeduction(input: {
  partyId: string;
  sectionId: string;
  date: string;
  amount: number;
  remarks?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = requireSession();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { ok: false, error: "Valid date is required" };
  if (!(input.amount > 0)) return { ok: false, error: "Amount must be positive" };
  try {
    await withTenant(session.tenantId, async (tx) => {
      const created = await tx.tdsDeduction.create({
        data: {
          tenantId: session.tenantId,
          firmId: session.firmId,
          fyId: session.fyId,
          partyId: input.partyId,
          sectionId: input.sectionId,
          date: new Date(`${input.date}T00:00:00`),
          amount: input.amount,
          remarks: input.remarks || null,
          createdById: session.userId,
        },
      });
      await audit(tx, session, {
        entity: "TdsDeduction",
        entityId: created.id,
        action: "CREATE",
        after: created,
      });
    });
    revalidatePath("/dashboard/tds-monitor");
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to record deduction" };
  }
}

export async function deleteTdsDeduction(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = requireSession();
  if (session.role !== "ADMIN" && session.role !== "OWNER") {
    return { ok: false, error: "Only Admin/Owner may delete deduction records" };
  }
  try {
    await withTenant(session.tenantId, async (tx) => {
      const before = await tx.tdsDeduction.findUniqueOrThrow({ where: { id } });
      await tx.tdsDeduction.update({ where: { id }, data: { deletedAt: new Date() } });
      await audit(tx, session, { entity: "TdsDeduction", entityId: id, action: "DELETE", before });
    });
    revalidatePath("/dashboard/tds-monitor");
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to delete record" };
  }
}
