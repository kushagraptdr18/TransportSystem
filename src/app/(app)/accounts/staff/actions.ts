"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/session";
import { withTenant, type Tx } from "@/lib/db";
import { authorize } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { postLedger, reverseLedger, type LedgerPostEntry } from "@/lib/ledger";
import { settledByRef } from "@/lib/settlement";
import { round2 } from "@/lib/calc/tds";
import { toNum } from "@/lib/utils";

/**
 * Staff Payroll & Advance Management. Every transaction posts to the ledger
 * with its own refType (STAFF_ADVANCE / STAFF_LOAN / STAFF_SALARY), so the
 * staff party ledger is always the single source of truth. Edits reverse and
 * re-post; history is never silently mutated (audit rows record every change).
 */

const REVALIDATE = "/accounts/staff";

async function salaryHead(tx: Tx, tenantId: string, name: string, kind: string): Promise<string> {
  const head = await tx.accountHead.upsert({
    where: { tenantId_name: { tenantId, name } },
    create: { tenantId, name, kind },
    update: {},
  });
  return head.id;
}

async function nextNo(tx: Tx, table: "staffAdvance" | "staffLoan", firmId: string, fyId: string, prefix: string) {
  const rows =
    table === "staffAdvance"
      ? await tx.$queryRaw<{ max: bigint | null }[]>`
          SELECT MAX(NULLIF(regexp_replace("advanceNo", '\\D', '', 'g'), '')::bigint) AS max
          FROM "StaffAdvance" WHERE "firmId" = ${firmId} AND "fyId" = ${fyId}`
      : await tx.$queryRaw<{ max: bigint | null }[]>`
          SELECT MAX(NULLIF(regexp_replace("loanNo", '\\D', '', 'g'), '')::bigint) AS max
          FROM "StaffLoan" WHERE "firmId" = ${firmId} AND "fyId" = ${fyId}`;
  const max = rows[0]?.max ? Number(rows[0].max) : 0;
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

/** Next PAY-#### for the firm + FY, following the advance / loan numbering. */
async function nextSalaryNo(tx: Tx, firmId: string, fyId: string): Promise<string> {
  const rows = await tx.$queryRaw<{ max: bigint | null }[]>`
    SELECT MAX(NULLIF(regexp_replace("voucherNo", '\\D', '', 'g'), '')::bigint) AS max
    FROM "StaffSalary" WHERE "firmId" = ${firmId} AND "fyId" = ${fyId}`;
  const max = rows[0]?.max ? Number(rows[0].max) : 0;
  return `PAY-${String(max + 1).padStart(4, "0")}`;
}

function toDate(s: string): Date {
  return new Date(s.includes("T") ? s : `${s}T00:00:00`);
}

// ---------------------------------------------------------------- profile

const profileSchema = z.object({
  partyId: z.string().min(1),
  employeeId: z.string().nullish(),
  department: z.string().nullish(),
  designation: z.string().nullish(),
  joiningDate: z.string().nullish(),
  basicSalary: z.number().min(0).default(0),
  allowances: z.number().min(0).default(0),
});

export async function saveStaffProfile(
  input: unknown
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = requireSession();
  await authorize(session, "vouchers", "edit");
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;
  try {
    await withTenant(session.tenantId, async (tx) => {
      const values = {
        employeeId: d.employeeId || null,
        department: d.department || null,
        designation: d.designation || null,
        joiningDate: d.joiningDate ? toDate(d.joiningDate) : null,
        basicSalary: d.basicSalary,
        allowances: d.allowances,
      };
      const profile = await tx.staffProfile.upsert({
        where: { partyId: d.partyId },
        create: { tenantId: session.tenantId, partyId: d.partyId, ...values },
        update: values,
      });
      await audit(tx, session, {
        entity: "StaffProfile",
        entityId: profile.id,
        action: "UPDATE",
        after: profile,
      });
    });
    revalidatePath(REVALIDATE);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Save failed" };
  }
}

// ---------------------------------------------------------------- advance

const advanceSchema = z.object({
  partyId: z.string().min(1, "Staff is required"),
  date: z.string().min(1, "Date is required"),
  amount: z.number().min(0.01, "Amount is required"),
  headId: z.string().min(1, "Bank/Cash head is required"),
  remarks: z.string().nullish(),
});

export async function saveStaffAdvance(
  input: unknown
): Promise<{ ok: true; advanceNo: string } | { ok: false; error: string }> {
  const session = requireSession();
  await authorize(session, "vouchers", "create");
  const parsed = advanceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;
  try {
    return await withTenant(session.tenantId, async (tx) => {
      const advanceNo = await nextNo(tx, "staffAdvance", session.firmId, session.fyId, "SADV-");
      const date = toDate(d.date);
      const created = await tx.staffAdvance.create({
        data: {
          tenantId: session.tenantId,
          firmId: session.firmId,
          fyId: session.fyId,
          advanceNo,
          partyId: d.partyId,
          date,
          amount: d.amount,
          headId: d.headId,
          remarks: d.remarks || null,
          createdById: session.userId,
        },
      });
      // money out of bank/cash, receivable on the staff party
      await postLedger(tx, session, [
        {
          date,
          partyId: d.headId,
          side: "CREDIT",
          amount: d.amount,
          refType: "STAFF_ADVANCE",
          refId: created.id,
          refNo: advanceNo,
          narration: `Staff advance ${advanceNo}${d.remarks ? " — " + d.remarks : ""}`,
        },
        {
          date,
          partyId: d.partyId,
          side: "DEBIT",
          amount: d.amount,
          refType: "STAFF_ADVANCE",
          refId: created.id,
          refNo: advanceNo,
          narration: `Advance given ${advanceNo}`,
        },
      ]);
      await audit(tx, session, {
        entity: "StaffAdvance",
        entityId: created.id,
        action: "CREATE",
        after: created,
      });
      revalidatePath(REVALIDATE);
      return { ok: true as const, advanceNo };
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Save failed" };
  }
}

// ---------------------------------------------------------------- loan

const loanSchema = z.object({
  partyId: z.string().min(1, "Staff is required"),
  date: z.string().min(1, "Date is required"),
  amount: z.number().min(0.01, "Loan amount is required"),
  emiAmount: z.number().min(0).default(0),
  headId: z.string().min(1, "Bank/Cash head is required"),
  remarks: z.string().nullish(),
});

export async function saveStaffLoan(
  input: unknown
): Promise<{ ok: true; loanNo: string } | { ok: false; error: string }> {
  const session = requireSession();
  await authorize(session, "vouchers", "create");
  const parsed = loanSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;
  try {
    return await withTenant(session.tenantId, async (tx) => {
      const loanNo = await nextNo(tx, "staffLoan", session.firmId, session.fyId, "SLN-");
      const date = toDate(d.date);
      const created = await tx.staffLoan.create({
        data: {
          tenantId: session.tenantId,
          firmId: session.firmId,
          fyId: session.fyId,
          loanNo,
          partyId: d.partyId,
          date,
          amount: d.amount,
          emiAmount: d.emiAmount,
          headId: d.headId,
          remarks: d.remarks || null,
          createdById: session.userId,
        },
      });
      await postLedger(tx, session, [
        {
          date,
          partyId: d.headId,
          side: "CREDIT",
          amount: d.amount,
          refType: "STAFF_LOAN",
          refId: created.id,
          refNo: loanNo,
          narration: `Staff loan ${loanNo}${d.remarks ? " — " + d.remarks : ""}`,
        },
        {
          date,
          partyId: d.partyId,
          side: "DEBIT",
          amount: d.amount,
          refType: "STAFF_LOAN",
          refId: created.id,
          refNo: loanNo,
          narration: `Loan given ${loanNo}`,
        },
      ]);
      await audit(tx, session, {
        entity: "StaffLoan",
        entityId: created.id,
        action: "CREATE",
        after: created,
      });
      revalidatePath(REVALIDATE);
      return { ok: true as const, loanNo };
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Save failed" };
  }
}

// ---------------------------------------------------------------- salary

const salarySchema = z.object({
  partyId: z.string().min(1, "Staff is required"),
  month: z.string().regex(/^\d{4}-\d{2}$/, "Month must be YYYY-MM"),
  basic: z.number().min(0).default(0),
  allowances: z.number().min(0).default(0),
  overtime: z.number().min(0).default(0),
  incentives: z.number().min(0).default(0),
  bonus: z.number().min(0).default(0),
  otherEarnings: z.number().min(0).default(0),
  attendanceAdj: z.number().min(0).default(0),
  leaveDeduction: z.number().min(0).default(0),
  penalties: z.number().min(0).default(0),
  otherDeductions: z.number().min(0).default(0),
  advanceId: z.string().nullish(),
  advanceRecovery: z.number().min(0).default(0),
  loanId: z.string().nullish(),
  loanRecovery: z.number().min(0).default(0),
  remarks: z.string().nullish(),
  // optional immediate payment
  markPaid: z.boolean().default(false),
  paymentDate: z.string().nullish(),
  paymentHeadId: z.string().nullish(),
});

async function advanceAdjustedTotal(tx: Tx, advanceId: string, excludeSalaryId?: string) {
  const rows = await tx.staffSalary.findMany({
    where: { advanceId, deletedAt: null, ...(excludeSalaryId ? { id: { not: excludeSalaryId } } : {}) },
    select: { advanceRecovery: true },
  });
  return round2(rows.reduce((s, r) => s + toNum(String(r.advanceRecovery)), 0));
}

async function loanRecoveredTotal(tx: Tx, loanId: string, excludeSalaryId?: string) {
  const rows = await tx.staffSalary.findMany({
    where: { loanId, deletedAt: null, ...(excludeSalaryId ? { id: { not: excludeSalaryId } } : {}) },
    select: { loanRecovery: true },
  });
  return round2(rows.reduce((s, r) => s + toNum(String(r.loanRecovery)), 0));
}

/** Create or update a month's salary; reverses + re-posts the ledger. */
export async function processStaffSalary(
  input: unknown
): Promise<{ ok: true; id: string; netSalary: number } | { ok: false; error: string }> {
  const session = requireSession();
  await authorize(session, "vouchers", "create");
  const parsed = salarySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;

  const grossSalary = round2(
    d.basic + d.allowances + d.overtime + d.incentives + d.bonus + d.otherEarnings
  );
  const totalDeductions = round2(
    d.attendanceAdj +
      d.leaveDeduction +
      d.penalties +
      d.otherDeductions +
      d.advanceRecovery +
      d.loanRecovery
  );
  const netSalary = round2(grossSalary - totalDeductions);
  if (netSalary < 0) return { ok: false, error: "Deductions exceed the gross salary" };
  if (d.markPaid && (!d.paymentDate || !d.paymentHeadId)) {
    return { ok: false, error: "Payment date and bank/cash head are required to mark paid" };
  }
  if (d.advanceRecovery > 0 && !d.advanceId) {
    return { ok: false, error: "Select the advance being recovered" };
  }
  if (d.loanRecovery > 0 && !d.loanId) {
    return { ok: false, error: "Select the loan being recovered" };
  }

  try {
    return await withTenant(session.tenantId, async (tx) => {
      const existing = await tx.staffSalary.findFirst({
        where: {
          firmId: session.firmId,
          fyId: session.fyId,
          partyId: d.partyId,
          month: d.month,
          deletedAt: null,
        },
      });

      // recoveries must not exceed the open balances
      if (d.advanceId && d.advanceRecovery > 0) {
        const adv = await tx.staffAdvance.findFirst({ where: { id: d.advanceId, deletedAt: null } });
        if (!adv) return { ok: false as const, error: "Advance not found" };
        const adjusted = await advanceAdjustedTotal(tx, d.advanceId, existing?.id);
        const balance = round2(toNum(String(adv.amount)) - adjusted);
        if (d.advanceRecovery > balance + 0.01) {
          return {
            ok: false as const,
            error: `Advance ${adv.advanceNo} balance is only ${balance.toFixed(2)}`,
          };
        }
      }
      if (d.loanId && d.loanRecovery > 0) {
        const loan = await tx.staffLoan.findFirst({ where: { id: d.loanId, deletedAt: null } });
        if (!loan) return { ok: false as const, error: "Loan not found" };
        const recovered = await loanRecoveredTotal(tx, d.loanId, existing?.id);
        const balance = round2(toNum(String(loan.amount)) - recovered);
        if (d.loanRecovery > balance + 0.01) {
          return {
            ok: false as const,
            error: `Loan ${loan.loanNo} outstanding is only ${balance.toFixed(2)}`,
          };
        }
      }

      const values = {
        basic: d.basic,
        allowances: d.allowances,
        overtime: d.overtime,
        incentives: d.incentives,
        bonus: d.bonus,
        otherEarnings: d.otherEarnings,
        attendanceAdj: d.attendanceAdj,
        leaveDeduction: d.leaveDeduction,
        penalties: d.penalties,
        otherDeductions: d.otherDeductions,
        advanceId: d.advanceId || null,
        advanceRecovery: d.advanceRecovery,
        loanId: d.loanId || null,
        loanRecovery: d.loanRecovery,
        grossSalary,
        totalDeductions,
        netSalary,
        remarks: d.remarks || null,
        ...(d.markPaid
          ? {
              paymentStatus: "PAID",
              paymentDate: toDate(d.paymentDate as string),
              paymentHeadId: d.paymentHeadId,
              // recorded as an amount, not just a flag: the payment voucher
              // needs to know how much of this salary is already settled here,
              // and a status cannot be netted against a partial allocation
              paidAmount: netSalary,
            }
          : {}),
      };

      let salaryId: string;
      if (existing) {
        const updated = await tx.staffSalary.update({ where: { id: existing.id }, data: values });
        salaryId = updated.id;
        await reverseLedger(tx, "STAFF_SALARY", salaryId);
        await audit(tx, session, {
          entity: "StaffSalary",
          entityId: salaryId,
          action: "UPDATE",
          before: existing,
          after: updated,
        });
      } else {
        // A salary needs a document number of its own before a payment voucher
        // can point at it — employee + month is not something an allocation can
        // reference. Blank refNo means "use the voucher number", the same rule
        // office transactions follow.
        const salaryNo = await nextSalaryNo(tx, session.firmId, session.fyId);
        const created = await tx.staffSalary.create({
          data: {
            tenantId: session.tenantId,
            firmId: session.firmId,
            fyId: session.fyId,
            partyId: d.partyId,
            month: d.month,
            voucherNo: salaryNo,
            refNo: salaryNo,
            createdById: session.userId,
            ...values,
          },
        });
        salaryId = created.id;
        await audit(tx, session, {
          entity: "StaffSalary",
          entityId: salaryId,
          action: "CREATE",
          after: created,
        });
      }

      await postSalaryLedger(tx, session, salaryId);
      await syncLoanStatus(tx, d.loanId);
      revalidatePath(REVALIDATE);
      return { ok: true as const, id: salaryId, netSalary };
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Save failed" };
  }
}

/** Pay (or re-pay after edit) a processed salary. */
export async function payStaffSalary(input: {
  salaryId: string;
  paymentDate: string;
  paymentHeadId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = requireSession();
  await authorize(session, "vouchers", "edit");
  if (!input.paymentDate || !input.paymentHeadId) {
    return { ok: false, error: "Payment date and bank/cash head are required" };
  }
  try {
    await withTenant(session.tenantId, async (tx) => {
      const before = await tx.staffSalary.findFirstOrThrow({
        where: { id: input.salaryId, deletedAt: null },
      });
      const after = await tx.staffSalary.update({
        where: { id: input.salaryId },
        data: {
          paymentStatus: "PAID",
          paymentDate: toDate(input.paymentDate),
          paymentHeadId: input.paymentHeadId,
          paidAmount: before.netSalary,
        },
      });
      await reverseLedger(tx, "STAFF_SALARY", input.salaryId);
      await postSalaryLedger(tx, session, input.salaryId);
      await audit(tx, session, {
        entity: "StaffSalary",
        entityId: input.salaryId,
        action: "UPDATE",
        before,
        after,
      });
    });
    revalidatePath(REVALIDATE);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Payment failed" };
  }
}

/**
 * Balanced salary posting:
 *   DEBIT  Staff Salary Expense    gross
 *   CREDIT staff party             net + advanceRecovery + loanRecovery
 *          (net stays payable until paid; recoveries clear the advance/loan
 *           debits already sitting on the party)
 *   CREDIT Penalty                 penalties
 *   CREDIT Salary Deductions (Staff)  attendance + leave + other deductions
 * and when PAID:
 *   CREDIT bank/cash               net,  DEBIT staff party net
 */
async function postSalaryLedger(
  tx: Tx,
  session: ReturnType<typeof requireSession>,
  salaryId: string
) {
  const s = await tx.staffSalary.findFirstOrThrow({ where: { id: salaryId } });
  const monthLabel = s.month;
  const common = {
    date: s.paymentDate ?? new Date(`${s.month}-01T00:00:00`),
    refType: "STAFF_SALARY",
    refId: s.id,
    refNo: `SAL-${s.month}`,
  };
  const gross = toNum(String(s.grossSalary));
  const net = toNum(String(s.netSalary));
  const advRec = toNum(String(s.advanceRecovery));
  const loanRec = toNum(String(s.loanRecovery));
  const penalties = toNum(String(s.penalties));
  const otherDed = round2(
    toNum(String(s.attendanceAdj)) + toNum(String(s.leaveDeduction)) + toNum(String(s.otherDeductions))
  );

  const entries: LedgerPostEntry[] = [];
  const expenseHead = await salaryHead(tx, session.tenantId, "Staff Salary Expense", "EXPENSE");
  entries.push({
    ...common,
    accountHeadId: expenseHead,
    side: "DEBIT",
    amount: gross,
    narration: `Salary for ${monthLabel}`,
  });
  entries.push({
    ...common,
    partyId: s.partyId,
    side: "CREDIT",
    amount: round2(net + advRec + loanRec),
    narration: `Salary ${monthLabel}${advRec ? ` (advance recovery ${advRec})` : ""}${loanRec ? ` (loan recovery ${loanRec})` : ""}`,
  });
  if (penalties > 0) {
    const h = await salaryHead(tx, session.tenantId, "Penalty", "EXPENSE");
    entries.push({ ...common, accountHeadId: h, side: "CREDIT", amount: penalties, narration: `Penalty — salary ${monthLabel}` });
  }
  if (otherDed > 0) {
    const h = await salaryHead(tx, session.tenantId, "Salary Deductions (Staff)", "INCOME");
    entries.push({ ...common, accountHeadId: h, side: "CREDIT", amount: otherDed, narration: `Deductions — salary ${monthLabel}` });
  }
  if (s.paymentStatus === "PAID" && s.paymentHeadId && net > 0) {
    entries.push({
      ...common,
      partyId: s.paymentHeadId,
      side: "CREDIT",
      amount: net,
      narration: `Salary payment ${monthLabel}`,
    });
    entries.push({
      ...common,
      partyId: s.partyId,
      side: "DEBIT",
      amount: net,
      narration: `Salary paid ${monthLabel}`,
    });
  }
  await postLedger(tx, session, entries);
}

async function syncLoanStatus(tx: Tx, loanId: string | null | undefined) {
  if (!loanId) return;
  const loan = await tx.staffLoan.findFirst({ where: { id: loanId, deletedAt: null } });
  if (!loan) return;
  const recovered = await loanRecoveredTotal(tx, loanId);
  const status = recovered + 0.01 >= toNum(String(loan.amount)) ? "CLOSED" : "OPEN";
  if (status !== loan.status) {
    await tx.staffLoan.update({ where: { id: loanId }, data: { status } });
  }
}

// ---------------------------------------------------------------- delete

/**
 * Deletes soft-delete the row and remove its ledger entries. A record that
 * something else already depends on (a salary recovery, a voucher allocation)
 * must be untangled first — the guard names what is blocking it.
 */
export async function deleteStaffAdvance(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = requireSession();
  await authorize(session, "vouchers", "delete");
  try {
    return await withTenant(session.tenantId, async (tx) => {
      const adv = await tx.staffAdvance.findFirst({ where: { id, deletedAt: null } });
      if (!adv) return { ok: false as const, error: "Advance not found" };
      const adjusted = await advanceAdjustedTotal(tx, id);
      if (adjusted > 0) {
        return {
          ok: false as const,
          error: `Advance ${adv.advanceNo} has ${adjusted.toFixed(2)} recovered through salary — delete or edit those salaries first`,
        };
      }
      const settled = await settledByRef(tx, {
        firmId: session.firmId,
        fyId: session.fyId,
        refTypes: ["STAFF_ADVANCE"],
        refIds: [id],
      });
      if ((settled.get(id) ?? 0) > 0) {
        return {
          ok: false as const,
          error: `Advance ${adv.advanceNo} is settled by a receipt voucher — delete that voucher first`,
        };
      }
      await tx.staffAdvance.update({ where: { id }, data: { deletedAt: new Date() } });
      await reverseLedger(tx, "STAFF_ADVANCE", id);
      await audit(tx, session, { entity: "StaffAdvance", entityId: id, action: "DELETE", before: adv });
      revalidatePath(REVALIDATE);
      return { ok: true as const };
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Delete failed" };
  }
}

export async function deleteStaffLoan(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = requireSession();
  await authorize(session, "vouchers", "delete");
  try {
    return await withTenant(session.tenantId, async (tx) => {
      const loan = await tx.staffLoan.findFirst({ where: { id, deletedAt: null } });
      if (!loan) return { ok: false as const, error: "Loan not found" };
      const recovered = await loanRecoveredTotal(tx, id);
      if (recovered > 0) {
        return {
          ok: false as const,
          error: `Loan ${loan.loanNo} has ${recovered.toFixed(2)} recovered through salary — delete or edit those salaries first`,
        };
      }
      await tx.staffLoan.update({ where: { id }, data: { deletedAt: new Date() } });
      await reverseLedger(tx, "STAFF_LOAN", id);
      await audit(tx, session, { entity: "StaffLoan", entityId: id, action: "DELETE", before: loan });
      revalidatePath(REVALIDATE);
      return { ok: true as const };
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Delete failed" };
  }
}

/** Deletes the month's salary (paid or pending): ledger entries reversed, and
 *  any advance / loan recovered in it opens back up automatically. */
export async function deleteStaffSalary(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = requireSession();
  await authorize(session, "vouchers", "delete");
  try {
    return await withTenant(session.tenantId, async (tx) => {
      const s = await tx.staffSalary.findFirst({ where: { id, deletedAt: null } });
      if (!s) return { ok: false as const, error: "Salary not found" };
      const settled = await settledByRef(tx, {
        firmId: session.firmId,
        fyId: session.fyId,
        refTypes: ["STAFF_PAYROLL"],
        refIds: [id],
      });
      if ((settled.get(id) ?? 0) > 0) {
        return {
          ok: false as const,
          error: `Salary ${s.month} is settled by a payment voucher — delete that voucher first`,
        };
      }
      await tx.staffSalary.update({ where: { id }, data: { deletedAt: new Date() } });
      await reverseLedger(tx, "STAFF_SALARY", id);
      await syncLoanStatus(tx, s.loanId);
      await audit(tx, session, { entity: "StaffSalary", entityId: id, action: "DELETE", before: s });
      revalidatePath(REVALIDATE);
      return { ok: true as const };
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Delete failed" };
  }
}

// ---------------------------------------------------------------- details

export interface StaffDetails {
  partyId: string;
  name: string;
  profile: {
    employeeId: string;
    department: string;
    designation: string;
    joiningDate: string | null;
    basicSalary: number;
    allowances: number;
  };
  advances: {
    id: string;
    advanceNo: string;
    date: string;
    amount: number;
    adjusted: number;
    balance: number;
    remarks: string;
  }[];
  loans: {
    id: string;
    loanNo: string;
    date: string;
    amount: number;
    emiAmount: number;
    recovered: number;
    outstanding: number;
    status: string;
    remarks: string;
  }[];
  salaries: {
    id: string;
    month: string;
    basic: number;
    allowances: number;
    overtime: number;
    incentives: number;
    bonus: number;
    otherEarnings: number;
    attendanceAdj: number;
    leaveDeduction: number;
    penalties: number;
    otherDeductions: number;
    advanceId: string | null;
    loanId: string | null;
    grossSalary: number;
    totalDeductions: number;
    advanceRecovery: number;
    loanRecovery: number;
    netSalary: number;
    paymentStatus: string;
    paymentDate: string | null;
    paymentHeadId: string | null;
    remarks: string;
  }[];
  ledger: {
    date: string;
    refType: string;
    refNo: string;
    narration: string;
    debit: number;
    credit: number;
    balance: number;
  }[];
}

export async function getStaffDetails(
  partyId: string
): Promise<{ ok: true; data: StaffDetails } | { ok: false; error: string }> {
  const session = requireSession();
  return withTenant(session.tenantId, async (tx) => {
    const party = await tx.party.findFirst({ where: { id: partyId } });
    if (!party) return { ok: false as const, error: "Staff not found" };
    const scope = { firmId: session.firmId, fyId: session.fyId, partyId, deletedAt: null };
    const [profile, advances, loans, salaries, entries] = await Promise.all([
      tx.staffProfile.findUnique({ where: { partyId } }),
      tx.staffAdvance.findMany({ where: scope, orderBy: { date: "asc" } }),
      tx.staffLoan.findMany({ where: scope, orderBy: { date: "asc" } }),
      tx.staffSalary.findMany({ where: scope, orderBy: { month: "asc" } }),
      tx.ledgerEntry.findMany({
        where: { firmId: session.firmId, fyId: session.fyId, partyId },
        orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      }),
    ]);

    const advAdjusted = new Map<string, number>();
    const loanRecovered = new Map<string, number>();
    for (const s of salaries) {
      if (s.advanceId)
        advAdjusted.set(
          s.advanceId,
          round2((advAdjusted.get(s.advanceId) ?? 0) + toNum(String(s.advanceRecovery)))
        );
      if (s.loanId)
        loanRecovered.set(
          s.loanId,
          round2((loanRecovered.get(s.loanId) ?? 0) + toNum(String(s.loanRecovery)))
        );
    }

    let running =
      party.openingSide === "DEBIT"
        ? toNum(String(party.openingBalance))
        : -toNum(String(party.openingBalance));
    const ledger = entries.map((e) => {
      const amt = toNum(String(e.amount));
      const debit = e.side === "DEBIT" ? amt : 0;
      const credit = e.side === "CREDIT" ? amt : 0;
      running = round2(running + debit - credit);
      return {
        date: e.date.toISOString(),
        refType: e.refType,
        refNo: e.refNo,
        narration: e.narration ?? "",
        debit,
        credit,
        balance: running,
      };
    });

    return {
      ok: true as const,
      data: {
        partyId,
        name: party.name,
        profile: {
          employeeId: profile?.employeeId ?? "",
          department: profile?.department ?? "",
          designation: profile?.designation ?? "",
          joiningDate: profile?.joiningDate ? profile.joiningDate.toISOString() : null,
          basicSalary: toNum(String(profile?.basicSalary ?? 0)),
          allowances: toNum(String(profile?.allowances ?? 0)),
        },
        advances: advances.map((a) => {
          const adjusted = advAdjusted.get(a.id) ?? 0;
          return {
            id: a.id,
            advanceNo: a.advanceNo,
            date: a.date.toISOString(),
            amount: toNum(String(a.amount)),
            adjusted,
            balance: round2(toNum(String(a.amount)) - adjusted),
            remarks: a.remarks ?? "",
          };
        }),
        loans: loans.map((l) => {
          const recovered = loanRecovered.get(l.id) ?? 0;
          return {
            id: l.id,
            loanNo: l.loanNo,
            date: l.date.toISOString(),
            amount: toNum(String(l.amount)),
            emiAmount: toNum(String(l.emiAmount)),
            recovered,
            outstanding: round2(toNum(String(l.amount)) - recovered),
            status: l.status,
            remarks: l.remarks ?? "",
          };
        }),
        salaries: salaries.map((s) => ({
          id: s.id,
          month: s.month,
          basic: toNum(String(s.basic)),
          allowances: toNum(String(s.allowances)),
          overtime: toNum(String(s.overtime)),
          incentives: toNum(String(s.incentives)),
          bonus: toNum(String(s.bonus)),
          otherEarnings: toNum(String(s.otherEarnings)),
          attendanceAdj: toNum(String(s.attendanceAdj)),
          leaveDeduction: toNum(String(s.leaveDeduction)),
          penalties: toNum(String(s.penalties)),
          otherDeductions: toNum(String(s.otherDeductions)),
          advanceId: s.advanceId,
          loanId: s.loanId,
          grossSalary: toNum(String(s.grossSalary)),
          totalDeductions: toNum(String(s.totalDeductions)),
          advanceRecovery: toNum(String(s.advanceRecovery)),
          loanRecovery: toNum(String(s.loanRecovery)),
          netSalary: toNum(String(s.netSalary)),
          paymentStatus: s.paymentStatus,
          paymentDate: s.paymentDate ? s.paymentDate.toISOString() : null,
          paymentHeadId: s.paymentHeadId,
          remarks: s.remarks ?? "",
        })),
        ledger,
      },
    };
  });
}
