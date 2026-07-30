"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { authorize } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { ensureAccountHead, postLedger, reverseLedger, type LedgerPostEntry } from "@/lib/ledger";
import { round2 } from "@/lib/calc/tds";
import { toNum } from "@/lib/utils";

/**
 * Driver Salary — separate from trip settlement and driver advance.
 * Pending shortages surface at processing time; the user CHOOSES whether to
 * adjust them (never forced). Posting (refType DRIVER_SALARY):
 *   DR "Driver Salary Expense" gross
 *   CR driver party (net + advance recovery)   [advance recovery nets against
 *                                               the existing advance debit]
 *   CR "Shortage Recovery (Driver)" shortage   + mark shortages ADJUSTED
 *   CR "Salary Deductions (Driver)" other deductions
 * On payment: CR cash/bank net, DR driver party net.
 */

const REVALIDATE = "/vehicle/driver-salary";

// ---------------------------------------------------------------- shortage entry

const shortageSchema = z.object({
  date: z.string().min(1, "Date is required"),
  driverId: z.string().min(1, "Driver is required"),
  tripRef: z.string().nullish(),
  amount: z.number().min(0.01, "Amount is required"),
  remarks: z.string().nullish(),
});

export async function saveDriverShortage(
  input: unknown
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = requireSession();
  const parsed = shortageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;
  await authorize(session, "maintenance", "create");
  try {
    await withTenant(session.tenantId, async (tx) => {
      const created = await tx.driverShortage.create({
        data: {
          tenantId: session.tenantId,
          firmId: session.firmId,
          fyId: session.fyId,
          date: new Date(`${d.date}T00:00:00`),
          driverId: d.driverId,
          tripRef: d.tripRef?.trim() || null,
          amount: d.amount,
          remarks: d.remarks || null,
        },
      });
      await audit(tx, session, {
        entity: "DriverShortage",
        entityId: created.id,
        action: "CREATE",
        after: created,
      });
    });
    revalidatePath(REVALIDATE);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Save failed" };
  }
}

/** Pending shortages of a driver — shown before salary is processed. */
export async function getPendingShortages(driverId: string): Promise<{
  total: number;
  rows: { id: string; date: string; tripRef: string; amount: number; remarks: string }[];
}> {
  const session = requireSession();
  return withTenant(session.tenantId, async (tx) => {
    const rows = await tx.driverShortage.findMany({
      where: { firmId: session.firmId, driverId, status: "PENDING", deletedAt: null },
      orderBy: { date: "asc" },
    });
    const out = rows.map((r) => ({
      id: r.id,
      date: r.date.toISOString(),
      tripRef: r.tripRef ?? "",
      amount: toNum(String(r.amount)),
      remarks: r.remarks ?? "",
    }));
    return { total: round2(out.reduce((s, r) => s + r.amount, 0)), rows: out };
  });
}

// ---------------------------------------------------------------- process salary

const salarySchema = z.object({
  id: z.string().nullish(),
  driverId: z.string().min(1, "Driver is required"),
  month: z.string().regex(/^\d{4}-\d{2}$/, "Salary month is required"),
  salaryAmount: z.number().min(0),
  incentive: z.number().min(0).default(0),
  bonus: z.number().min(0).default(0),
  otherAllowance: z.number().min(0).default(0),
  advanceAdjust: z.number().min(0).default(0),
  adjustShortage: z.boolean().default(false), // user's Yes / No — never forced
  otherDeductions: z.number().min(0).default(0),
  remarks: z.string().nullish(),
});

export async function processDriverSalary(
  input: unknown
): Promise<{ ok: true; id: string; netPayable: number } | { ok: false; error: string }> {
  const session = requireSession();
  const parsed = salarySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;
  await authorize(session, "maintenance", d.id ? "edit" : "create");

  try {
    return await withTenant(session.tenantId, async (tx) => {
      const driver = await tx.driver.findFirst({ where: { id: d.driverId, deletedAt: null } });
      if (!driver?.partyId) return { ok: false as const, error: "Driver (or its ledger party) not found" };

      const dup = await tx.driverSalary.findFirst({
        where: {
          firmId: session.firmId,
          fyId: session.fyId,
          driverId: d.driverId,
          month: d.month,
          deletedAt: null,
          ...(d.id ? { id: { not: d.id } } : {}),
        },
      });
      if (dup) return { ok: false as const, error: `Salary for ${d.month} already processed for this driver.` };

      // shortages: adjust only when the user said Yes
      const pending = await tx.driverShortage.findMany({
        where: { firmId: session.firmId, driverId: d.driverId, status: "PENDING", deletedAt: null },
      });
      const shortageDeduction = d.adjustShortage
        ? round2(pending.reduce((s, r) => s + toNum(String(r.amount)), 0))
        : 0;

      const gross = round2(d.salaryAmount + d.incentive + d.bonus + d.otherAllowance);
      const netPayable = round2(gross - d.advanceAdjust - shortageDeduction - d.otherDeductions);
      if (netPayable < 0) {
        return { ok: false as const, error: "Deductions exceed the gross salary." };
      }

      const values = {
        driverId: d.driverId,
        month: d.month,
        salaryAmount: d.salaryAmount,
        incentive: d.incentive,
        bonus: d.bonus,
        otherAllowance: d.otherAllowance,
        advanceAdjust: d.advanceAdjust,
        shortageDeduction,
        otherDeductions: d.otherDeductions,
        netPayable,
        remarks: d.remarks || null,
      };

      let id: string;
      if (d.id) {
        const before = await tx.driverSalary.findFirstOrThrow({ where: { id: d.id, deletedAt: null } });
        if (before.paymentStatus === "PAID") {
          return { ok: false as const, error: "Salary already paid — cannot edit." };
        }
        // release shortages previously adjusted by this salary
        await tx.driverShortage.updateMany({
          where: { salaryId: d.id },
          data: { status: "PENDING", salaryId: null },
        });
        const updated = await tx.driverSalary.update({ where: { id: d.id }, data: values });
        id = updated.id;
        await reverseLedger(tx, "DRIVER_SALARY", id);
        await audit(tx, session, { entity: "DriverSalary", entityId: id, action: "UPDATE", before, after: updated });
      } else {
        const created = await tx.driverSalary.create({
          data: {
            tenantId: session.tenantId,
            firmId: session.firmId,
            fyId: session.fyId,
            createdById: session.userId,
            ...values,
          },
        });
        id = created.id;
        await audit(tx, session, { entity: "DriverSalary", entityId: id, action: "CREATE", after: created });
      }

      if (d.adjustShortage && pending.length) {
        await tx.driverShortage.updateMany({
          where: { id: { in: pending.map((p) => p.id) } },
          data: { status: "ADJUSTED", salaryId: id },
        });
      }

      // ledger accrual
      const salaryDate = new Date(`${d.month}-01T00:00:00`);
      const common = { date: salaryDate, refType: "DRIVER_SALARY", refId: id, refNo: `DSAL-${d.month}` };
      const expenseHead = await ensureAccountHead(tx, session, "Driver Salary Expense", "EXPENSE");
      const entries: LedgerPostEntry[] = [
        {
          ...common,
          accountHeadId: expenseHead,
          side: "DEBIT" as const,
          amount: gross,
          narration: `Driver salary ${d.month} — ${driver.name}`,
        },
        {
          ...common,
          partyId: driver.partyId,
          side: "CREDIT" as const,
          amount: round2(netPayable + d.advanceAdjust),
          narration: `Salary payable ${d.month}${d.advanceAdjust ? " (incl. advance recovery)" : ""}`,
        },
      ];
      if (shortageDeduction > 0) {
        const head = await ensureAccountHead(tx, session, "Shortage Recovery (Driver)", "INCOME");
        entries.push({
          ...common,
          accountHeadId: head,
          side: "CREDIT" as const,
          amount: shortageDeduction,
          narration: `Shortage adjusted in salary ${d.month} — ${driver.name}`,
        });
      }
      if (d.otherDeductions > 0) {
        const head = await ensureAccountHead(tx, session, "Salary Deductions (Driver)", "INCOME");
        entries.push({
          ...common,
          accountHeadId: head,
          side: "CREDIT" as const,
          amount: d.otherDeductions,
          narration: `Salary deductions ${d.month} — ${driver.name}`,
        });
      }
      await postLedger(tx, session, entries);

      revalidatePath(REVALIDATE);
      return { ok: true as const, id, netPayable };
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Save failed" };
  }
}

// ---------------------------------------------------------------- pay salary

const paySchema = z.object({
  id: z.string().min(1),
  paymentDate: z.string().min(1, "Payment date is required"),
  paymentHeadId: z.string().min(1, "Cash / Bank account is required"),
});

export async function payDriverSalary(
  input: unknown
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = requireSession();
  const parsed = paySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;
  await authorize(session, "vouchers", "create");
  try {
    return await withTenant(session.tenantId, async (tx) => {
      const sal = await tx.driverSalary.findFirst({
        where: { id: d.id, firmId: session.firmId, deletedAt: null },
      });
      if (!sal) return { ok: false as const, error: "Salary record not found" };
      if (sal.paymentStatus === "PAID") return { ok: false as const, error: "Already paid." };
      const driver = await tx.driver.findFirst({ where: { id: sal.driverId } });
      if (!driver?.partyId) return { ok: false as const, error: "Driver ledger party missing" };

      const net = toNum(String(sal.netPayable));
      const paymentDate = new Date(`${d.paymentDate}T00:00:00`);
      const after = await tx.driverSalary.update({
        where: { id: sal.id },
        data: { paymentStatus: "PAID", paymentDate, paymentHeadId: d.paymentHeadId },
      });
      if (net > 0) {
        const common = {
          date: paymentDate,
          refType: "DRIVER_SALARY_PAY",
          refId: sal.id,
          refNo: `DSAL-${sal.month}`,
        };
        await postLedger(tx, session, [
          {
            ...common,
            partyId: d.paymentHeadId,
            side: "CREDIT",
            amount: net,
            narration: `Driver salary paid ${sal.month} — ${driver.name}`,
          },
          {
            ...common,
            partyId: driver.partyId,
            side: "DEBIT",
            amount: net,
            narration: `Salary paid ${sal.month}`,
          },
        ]);
      }
      await audit(tx, session, {
        entity: "DriverSalary",
        entityId: sal.id,
        action: "UPDATE",
        before: sal,
        after,
      });
      revalidatePath(REVALIDATE);
      return { ok: true as const };
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Payment failed" };
  }
}

export async function deleteDriverSalary(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = requireSession();
  if (session.role !== "ADMIN" && session.role !== "OWNER") {
    return { ok: false, error: "Only Admin/Owner may delete salary records" };
  }
  await authorize(session, "maintenance", "delete");
  try {
    await withTenant(session.tenantId, async (tx) => {
      const before = await tx.driverSalary.findFirstOrThrow({ where: { id, deletedAt: null } });
      if (before.paymentStatus === "PAID") throw new Error("Paid salary cannot be deleted.");
      await tx.driverShortage.updateMany({
        where: { salaryId: id },
        data: { status: "PENDING", salaryId: null },
      });
      await tx.driverSalary.update({ where: { id }, data: { deletedAt: new Date() } });
      await reverseLedger(tx, "DRIVER_SALARY", id);
      await audit(tx, session, { entity: "DriverSalary", entityId: id, action: "DELETE", before });
    });
    revalidatePath(REVALIDATE);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Delete failed" };
  }
}
