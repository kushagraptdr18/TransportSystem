"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/session";
import { withTenant, type Tx } from "@/lib/db";
import { authorize } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { postLedger, reverseLedger, type LedgerPostEntry } from "@/lib/ledger";

/**
 * Office Income & Expense — automatic double-entry posting (refType
 * OFFICE_TXN). Four cases:
 *   Expense + supplier: DR expense head → CR supplier (bill), DR supplier →
 *     CR bank/cash (payment) — supplier ledger shows both legs, nets to zero.
 *   Expense, no supplier: DR expense head, CR bank/cash.
 *   Income + party:  DR party → CR income head (accrual), DR bank → CR party.
 *   Income, no party: DR bank/cash, CR income head.
 * The editable external reference number (bill/invoice/receipt/challan/LR)
 * is carried as the ledger refNo so it appears in every ledger and register.
 * Edits reverse + re-post; deletes are soft — full audit trail either way.
 */

const REVALIDATE = "/accounts/office";

async function nextVoucherNo(tx: Tx, firmId: string, fyId: string, txnType: string) {
  const prefix = txnType === "INCOME" ? "OIN-" : "OEX-";
  const rows = await tx.$queryRaw<{ max: bigint | null }[]>`
    SELECT MAX(NULLIF(regexp_replace("voucherNo", '\\D', '', 'g'), '')::bigint) AS max
    FROM "OfficeTransaction"
    WHERE "firmId" = ${firmId} AND "fyId" = ${fyId} AND "txnType" = ${txnType}`;
  const max = rows[0]?.max ? Number(rows[0].max) : 0;
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

const schema = z.object({
  id: z.string().nullish(),
  date: z.string().min(1, "Date is required"),
  txnType: z.enum(["INCOME", "EXPENSE"]),
  headId: z.string().min(1, "Income / Expense head is required"),
  partyId: z.string().nullish(), // supplier / party — optional
  paymentMode: z.enum(["CASH", "BANK"]).nullish(), // blank = on credit (settle later)
  bankPartyId: z.string().nullish(),
  amount: z.number().min(0.01, "Amount is required"),
  gstPct: z.number().min(0).default(0),
  gstAmount: z.number().min(0).default(0),
  refNo: z.string().nullish(), // free alphanumeric external reference
  remarks: z.string().nullish(),
  attachmentPath: z.string().nullish(),
});

export async function saveOfficeTransaction(
  input: unknown
): Promise<{ ok: true; id: string; voucherNo: string } | { ok: false; error: string }> {
  const session = requireSession();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;
  await authorize(session, "vouchers", d.id ? "edit" : "create");
  if (d.attachmentPath && !d.attachmentPath.startsWith(`${session.tenantId}/`)) {
    return { ok: false, error: "Invalid attachment path" };
  }
  if (d.paymentMode && !d.bankPartyId) {
    return { ok: false, error: "Cash / Bank account is required when a payment mode is selected." };
  }
  if (!d.paymentMode && !d.partyId) {
    return {
      ok: false,
      error:
        "Select a Supplier/Party (for a credit entry) or a Payment Mode with Cash/Bank account.",
    };
  }

  try {
    return await withTenant(session.tenantId, async (tx) => {
      const head = await tx.accountHead.findFirst({ where: { id: d.headId } });
      if (!head) return { ok: false as const, error: "Head not found" };
      if (head.kind !== d.txnType) {
        return {
          ok: false as const,
          error: `"${head.name}" is a ${head.kind} head — select a matching ${d.txnType} head.`,
        };
      }

      const date = new Date(`${d.date}T00:00:00`);
      const values = {
        date,
        txnType: d.txnType,
        headId: d.headId,
        partyId: d.partyId || null,
        paymentMode: d.paymentMode || null,
        bankPartyId: d.paymentMode ? d.bankPartyId || null : null,
        amount: d.amount,
        gstPct: d.gstPct,
        gstAmount: d.gstAmount,
        refNo: d.refNo?.trim() || null,
        remarks: d.remarks || null,
        attachmentPath: d.attachmentPath || null,
      };

      let id: string;
      let voucherNo: string;
      if (d.id) {
        const before = await tx.officeTransaction.findFirstOrThrow({
          where: { id: d.id, deletedAt: null },
        });
        const updated = await tx.officeTransaction.update({ where: { id: d.id }, data: values });
        id = updated.id;
        voucherNo = updated.voucherNo;
        await reverseLedger(tx, "OFFICE_TXN", id);
        await audit(tx, session, {
          entity: "OfficeTransaction",
          entityId: id,
          action: "UPDATE",
          before,
          after: updated,
        });
      } else {
        voucherNo = await nextVoucherNo(tx, session.firmId, session.fyId, d.txnType);
        const created = await tx.officeTransaction.create({
          data: {
            tenantId: session.tenantId,
            firmId: session.firmId,
            fyId: session.fyId,
            voucherNo,
            createdById: session.userId,
            ...values,
          },
        });
        id = created.id;
        await audit(tx, session, {
          entity: "OfficeTransaction",
          entityId: id,
          action: "CREATE",
          after: created,
        });
      }

      // ---- automatic double-entry posting ----
      const common = {
        date,
        refType: "OFFICE_TXN",
        refId: id,
        // external document number (bill/invoice/receipt/challan/LR) if given,
        // else the auto voucher number — shown in every ledger & register
        refNo: values.refNo || voucherNo,
      };
      const label = `${head.name}${values.remarks ? " — " + values.remarks : ""}`;
      // paid = money moved now (cash/bank leg); otherwise the amount stays
      // outstanding on the supplier/party ledger until settled by a voucher
      const paid = !!values.paymentMode && !!values.bankPartyId;
      const entries: LedgerPostEntry[] = [];
      if (d.txnType === "EXPENSE") {
        entries.push({
          ...common,
          accountHeadId: d.headId,
          side: "DEBIT",
          amount: d.amount,
          narration: `Office expense ${voucherNo}: ${label}`,
        });
        if (values.partyId) {
          // supplier bill — stays outstanding unless paid immediately
          entries.push({
            ...common,
            partyId: values.partyId,
            side: "CREDIT",
            amount: d.amount,
            narration: `Supplier bill ${common.refNo} — ${head.name}`,
          });
          if (paid) {
            entries.push({
              ...common,
              partyId: values.partyId,
              side: "DEBIT",
              amount: d.amount,
              narration: `Payment to supplier (${values.paymentMode!.toLowerCase()}) ${voucherNo}`,
            });
          }
        }
        if (paid) {
          entries.push({
            ...common,
            partyId: values.bankPartyId!,
            side: "CREDIT",
            amount: d.amount,
            narration: `Office expense ${voucherNo}: ${label}`,
          });
        }
      } else {
        if (paid) {
          entries.push({
            ...common,
            partyId: values.bankPartyId!,
            side: "DEBIT",
            amount: d.amount,
            narration: `Office income ${voucherNo}: ${label}`,
          });
        }
        if (values.partyId) {
          // income accrual — stays outstanding unless received immediately
          entries.push({
            ...common,
            partyId: values.partyId,
            side: "DEBIT",
            amount: d.amount,
            narration: `Income accrual ${common.refNo} — ${head.name}`,
          });
          if (paid) {
            entries.push({
              ...common,
              partyId: values.partyId,
              side: "CREDIT",
              amount: d.amount,
              narration: `Received from party (${values.paymentMode!.toLowerCase()}) ${voucherNo}`,
            });
          }
        }
        entries.push({
          ...common,
          accountHeadId: d.headId,
          side: "CREDIT",
          amount: d.amount,
          narration: `Office income ${voucherNo}: ${label}`,
        });
      }
      await postLedger(tx, session, entries);

      revalidatePath(REVALIDATE);
      return { ok: true as const, id, voucherNo };
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Save failed" };
  }
}

export async function deleteOfficeTransaction(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = requireSession();
  if (session.role !== "ADMIN" && session.role !== "OWNER") {
    return { ok: false, error: "Only Admin/Owner may delete office transactions" };
  }
  await authorize(session, "vouchers", "delete");
  try {
    await withTenant(session.tenantId, async (tx) => {
      const before = await tx.officeTransaction.findFirstOrThrow({
        where: { id, deletedAt: null },
      });
      await tx.officeTransaction.update({ where: { id }, data: { deletedAt: new Date() } });
      await reverseLedger(tx, "OFFICE_TXN", id);
      await audit(tx, session, {
        entity: "OfficeTransaction",
        entityId: id,
        action: "DELETE",
        before,
      });
    });
    revalidatePath(REVALIDATE);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Delete failed" };
  }
}
