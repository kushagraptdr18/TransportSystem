"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/session";
import { withTenant, type Tx } from "@/lib/db";
import { authorize } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { postLedger, reverseLedger, type LedgerPostEntry } from "@/lib/ledger";
import { round2 } from "@/lib/calc/tds";
import { toNum } from "@/lib/utils";

/**
 * Vehicle Expenses — office-I&E-style accounting voucher with vehicle-wise
 * allocation. One voucher, unlimited vehicles. Posting (refType
 * VEHICLE_EXPENSE):
 *   EXPENSE: DR head total; supplier / cash-bank per the office rules
 *            (credit / direct / immediate payment).
 *   Relative vehicles: each relative share auto-transfers to the relative
 *   owner's ledger — DR owner party / CR head — so the company's final
 *   expense reduces and the amount sits against the vehicle owner.
 * Trip sheets only FETCH Diesel / Toll rows from here; they never write.
 */

const REVALIDATE = "/vehicle/expenses";

async function nextVoucherNo(tx: Tx, firmId: string, fyId: string, txnType: string) {
  const prefix = txnType === "INCOME" ? "VIN-" : "VEX-";
  const rows = await tx.$queryRaw<{ max: bigint | null }[]>`
    SELECT MAX(NULLIF(regexp_replace("voucherNo", '\\D', '', 'g'), '')::bigint) AS max
    FROM "VehicleExpenseVoucher"
    WHERE "firmId" = ${firmId} AND "fyId" = ${fyId} AND "txnType" = ${txnType}`;
  const max = rows[0]?.max ? Number(rows[0].max) : 0;
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

const schema = z.object({
  id: z.string().nullish(),
  date: z.string().min(1, "Date is required"),
  txnType: z.enum(["EXPENSE", "INCOME"]).default("EXPENSE"),
  headId: z.string().min(1, "Expense head is required"),
  partyId: z.string().nullish(),
  paymentMode: z.enum(["CASH", "BANK"]).nullish(), // blank = on credit
  bankPartyId: z.string().nullish(),
  paymentDate: z.string().nullish(), // may differ from the bill date
  refNo: z.string().nullish(),
  remarks: z.string().nullish(),
  attachmentPath: z.string().nullish(),
  attachmentName: z.string().nullish(),
  // what was bought, for bulk purchases allocated later
  itemName: z.string().nullish(),
  qty: z.number().min(0).nullish(),
  /** total of the bill when no vehicle is named yet (bulk purchase) */
  amount: z.number().min(0).nullish(),
  // A purchase does NOT have to name a vehicle: bulk stock (tyres, chains,
  // batteries, spares) is bought first and allocated to vehicles as they consume
  // it, from the Expense Allocation tab.
  items: z
    .array(
      z.object({
        vehicleId: z.string().min(1),
        amount: z.number().min(0.01),
        allocDate: z.string().nullish(),
        qty: z.number().min(0).nullish(),
        remarks: z.string().nullish(),
      })
    )
    .default([]),
});

export async function saveVehicleExpenseTxn(
  input: unknown
): Promise<{ ok: true; id: string; voucherNo: string } | { ok: false; error: string }> {
  const session = requireSession();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;
  await authorize(session, "maintenance", d.id ? "edit" : "create");
  if (d.attachmentPath && !d.attachmentPath.startsWith(`${session.tenantId}/`)) {
    return { ok: false, error: "Invalid attachment path" };
  }
  if (d.paymentMode && !d.bankPartyId) {
    return { ok: false, error: "Cash / Bank account is required when a payment mode is selected." };
  }
  if (!d.paymentMode && !d.partyId) {
    return {
      ok: false,
      error: "Select a Supplier/Party (credit entry) or a Payment Mode with Cash/Bank account.",
    };
  }
  const uniqVehicles = new Set(d.items.map((i) => i.vehicleId));
  if (uniqVehicles.size !== d.items.length) {
    return { ok: false, error: "The same vehicle is selected more than once." };
  }
  // A vehicle-wise entry totals its splits; a bulk purchase carries its own
  // amount and stays unallocated until vehicles consume it.
  const itemsTotal = round2(d.items.reduce((s, i) => s + i.amount, 0));
  const amount = d.items.length ? itemsTotal : round2(d.amount ?? 0);
  if (amount <= 0) {
    return { ok: false, error: "Enter the purchase amount, or split it across vehicles." };
  }
  if (d.items.length && d.amount != null && round2(d.amount) < itemsTotal - 0.009) {
    return { ok: false, error: "Vehicle splits exceed the purchase amount." };
  }

  try {
    return await withTenant(session.tenantId, async (tx) => {
      const head = await tx.accountHead.findFirst({ where: { id: d.headId } });
      if (!head) return { ok: false as const, error: "Head not found" };

      const vehicles = await tx.vehicle.findMany({
        where: { id: { in: Array.from(uniqVehicles) } },
        select: { id: true, number: true, ownershipType: true, ownerId: true },
      });
      if (vehicles.length !== uniqVehicles.size) {
        return { ok: false as const, error: "One or more vehicles were not found." };
      }

      const values = {
        date: new Date(`${d.date}T00:00:00`),
        txnType: d.txnType,
        headId: d.headId,
        partyId: d.partyId || null,
        paymentMode: d.paymentMode || null,
        bankPartyId: d.paymentMode ? d.bankPartyId || null : null,
        paymentDate: d.paymentMode
          ? new Date(`${d.paymentDate || d.date}T00:00:00`)
          : null,
        amount,
        itemName: d.itemName?.trim() || null,
        qty: d.qty ?? null,
        refNo: d.refNo?.trim() || null,
        remarks: d.remarks || null,
        attachmentPath: d.attachmentPath || null,
        attachmentName: d.attachmentName || null,
      };

      let id: string;
      let voucherNo: string;
      if (d.id) {
        const before = await tx.vehicleExpenseVoucher.findFirstOrThrow({
          where: { id: d.id, deletedAt: null },
          include: { items: true },
        });
        // An edit that names no vehicle is a bulk purchase being corrected — its
        // allocations were made later, on their own dates, and must survive; the
        // amount just may not drop below what vehicles have already taken.
        if (!d.items.length) {
          const allocated = round2(
            before.items.reduce((s, i) => s + toNum(String(i.amount)), 0)
          );
          if (amount < allocated - 0.009) {
            return {
              ok: false as const,
              error: `${allocated} is already allocated to vehicles — the purchase cannot be reduced to ${amount}.`,
            };
          }
        }
        // a blank reference means "use the voucher number" — stored, not derived,
        // so the payment voucher, the register and the ledger all name the bill
        // the same way
        const updated = await tx.vehicleExpenseVoucher.update({
          where: { id: d.id },
          data: { ...values, refNo: values.refNo || before.voucherNo },
        });
        id = updated.id;
        voucherNo = updated.voucherNo;
        // an edit that names vehicles replaces the split it owns
        if (d.items.length) {
          await tx.vehicleExpenseItem.deleteMany({ where: { voucherId: id } });
        }
        await reverseLedger(tx, "VEHICLE_EXPENSE", id);
        await audit(tx, session, {
          entity: "VehicleExpenseVoucher",
          entityId: id,
          action: "UPDATE",
          before,
          after: { ...updated, items: d.items },
        });
      } else {
        voucherNo = await nextVoucherNo(tx, session.firmId, session.fyId, d.txnType);
        const created = await tx.vehicleExpenseVoucher.create({
          data: {
            tenantId: session.tenantId,
            firmId: session.firmId,
            fyId: session.fyId,
            voucherNo,
            createdById: session.userId,
            ...values,
            refNo: values.refNo || voucherNo,
          },
        });
        id = created.id;
        await audit(tx, session, {
          entity: "VehicleExpenseVoucher",
          entityId: id,
          action: "CREATE",
          after: { ...created, items: d.items },
        });
      }
      await tx.vehicleExpenseItem.createMany({
        data: d.items.map((i) => ({
          tenantId: session.tenantId,
          voucherId: id,
          vehicleId: i.vehicleId,
          amount: i.amount,
          // split at purchase time = allocated on the purchase date
          allocDate: i.allocDate ? new Date(`${i.allocDate}T00:00:00`) : values.date,
          qty: i.qty ?? null,
          remarks: i.remarks || null,
        })),
      });

      // ---- single accounting voucher (office-I&E rules) ----
      const paid = !!values.paymentMode && !!values.bankPartyId;
      const common = {
        date: values.date,
        refType: "VEHICLE_EXPENSE",
        refId: id,
        refNo: values.refNo || voucherNo,
      };
      const label = `${head.name}${values.remarks ? " — " + values.remarks : ""}`;
      const entries: LedgerPostEntry[] = [];
      const headSide = d.txnType === "EXPENSE" ? ("DEBIT" as const) : ("CREDIT" as const);
      const moneySide = d.txnType === "EXPENSE" ? ("CREDIT" as const) : ("DEBIT" as const);
      entries.push({
        ...common,
        accountHeadId: d.headId,
        side: headSide,
        amount,
        narration: `Vehicle ${d.txnType.toLowerCase()} ${voucherNo}: ${label}`,
      });
      if (values.partyId) {
        entries.push({
          ...common,
          partyId: values.partyId,
          side: moneySide,
          amount,
          narration: `${d.txnType === "EXPENSE" ? "Supplier bill" : "Accrual"} ${common.refNo} — ${head.name}`,
        });
        if (paid) {
          entries.push({
            ...common,
            date: values.paymentDate ?? values.date,
            partyId: values.partyId,
            side: headSide,
            amount,
            narration: `${d.txnType === "EXPENSE" ? "Payment to supplier" : "Received"} (${values.paymentMode!.toLowerCase()}) ${voucherNo}`,
          });
        }
      }
      if (paid) {
        // money moves on the PAYMENT date, which may differ from the bill date
        entries.push({
          ...common,
          date: values.paymentDate ?? values.date,
          partyId: values.bankPartyId!,
          side: moneySide,
          amount,
          narration: `Vehicle ${d.txnType.toLowerCase()} ${voucherNo}: ${label}`,
        });
      }
      // relative-vehicle shares transfer to the relative owner's ledger
      if (d.txnType === "EXPENSE") {
        for (const item of d.items) {
          const v = vehicles.find((x) => x.id === item.vehicleId);
          if (v?.ownershipType === "RELATIVE" && v.ownerId) {
            entries.push(
              {
                ...common,
                partyId: v.ownerId,
                side: "DEBIT",
                amount: item.amount,
                narration: `${head.name} for relative vehicle ${v.number} — transferred to owner`,
              },
              {
                ...common,
                accountHeadId: d.headId,
                side: "CREDIT",
                amount: item.amount,
                narration: `${head.name} ${v.number} — shifted to relative owner ledger`,
              }
            );
          }
        }
      }
      await postLedger(tx, session, entries);

      revalidatePath(REVALIDATE);
      return { ok: true as const, id, voucherNo };
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Save failed" };
  }
}

export async function deleteVehicleExpenseTxn(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = requireSession();
  if (session.role !== "ADMIN" && session.role !== "OWNER") {
    return { ok: false, error: "Only Admin/Owner may delete vehicle expenses" };
  }
  await authorize(session, "maintenance", "delete");
  try {
    await withTenant(session.tenantId, async (tx) => {
      const before = await tx.vehicleExpenseVoucher.findFirstOrThrow({
        where: { id, deletedAt: null },
        include: { items: true },
      });
      await tx.vehicleExpenseVoucher.update({ where: { id }, data: { deletedAt: new Date() } });
      await reverseLedger(tx, "VEHICLE_EXPENSE", id);
      // bulk-purchase allocations post relative-owner transfers under their
      // own item ids — reverse those too, or the owner keeps a phantom debit
      for (const item of before.items) {
        await reverseLedger(tx, "VEH_EXP_ALLOC", item.id);
      }
      await audit(tx, session, { entity: "VehicleExpenseVoucher", entityId: id, action: "DELETE", before });
    });
    revalidatePath(REVALIDATE);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Delete failed" };
  }
}

// ------------------------------------------------- trip sheet fetch (read-only)

export interface TripFetchedExpenseRow {
  date: string;
  head: string;
  supplier: string;
  amount: number;
  voucherNo: string;
  remarks: string;
}

/**
 * Every OTHER vehicle expense booked in the range — everything the diesel/toll
 * fetch above deliberately skips (tyres, repairs, parking, RTO, spares...).
 *
 * Deliberately a separate action rather than a flag on the fetch above: that
 * one feeds the Diesel and Toll detail popups, and widening it would put
 * unrelated heads into them. The "Actual Income − Actual Expenses" method is
 * the only caller — the other two methods must keep seeing exactly what they
 * see today.
 */
export async function fetchOperatingExpensesForTrip(input: {
  vehicleId: string;
  dateFrom: string;
  dateTo: string;
}): Promise<{ total: number; rows: TripFetchedExpenseRow[] }> {
  const session = requireSession();
  return withTenant(session.tenantId, async (tx) => {
    const items = await tx.vehicleExpenseItem.findMany({
      where: {
        vehicleId: input.vehicleId,
        // the trip sees costs ALLOCATED to the vehicle in its dates, not stock
        // purchased in that window and fitted to some other vehicle later
        allocDate: {
          gte: new Date(`${input.dateFrom}T00:00:00`),
          lte: new Date(`${input.dateTo}T23:59:59`),
        },
        voucher: {
          firmId: session.firmId,
          txnType: "EXPENSE",
          deletedAt: null,
        },
      },
      include: { voucher: true },
    });
    if (!items.length) return { total: 0, rows: [] };
    const partyIds = Array.from(
      new Set(items.map((i) => i.voucher.partyId).filter(Boolean))
    ) as string[];
    const [heads, suppliers] = await Promise.all([
      tx.accountHead.findMany({
        where: { id: { in: Array.from(new Set(items.map((i) => i.voucher.headId))) } },
      }),
      partyIds.length
        ? tx.party.findMany({ where: { id: { in: partyIds } }, select: { id: true, name: true } })
        : Promise.resolve([]),
    ]);
    const headName = new Map(heads.map((h) => [h.id, h.name]));
    const supplierName = new Map(suppliers.map((p) => [p.id, p.name]));
    let total = 0;
    const rows: TripFetchedExpenseRow[] = [];
    for (const it of items) {
      const name = headName.get(it.voucher.headId) ?? "";
      const lower = name.toLowerCase();
      // diesel and toll are shown on their own lines already — counting them
      // here too would double the actual cost
      if (lower.includes("diesel") || lower.includes("toll")) continue;
      const amt = toNum(String(it.amount));
      total += amt;
      rows.push({
        date: it.voucher.date.toISOString(),
        head: name,
        supplier: it.voucher.partyId ? supplierName.get(it.voucher.partyId) ?? "" : "",
        amount: amt,
        voucherNo: it.voucher.voucherNo,
        remarks: it.voucher.remarks ?? "",
      });
    }
    return { total: round2(total), rows: rows.sort((a, b) => a.date.localeCompare(b.date)) };
  });
}

/**
 * Diesel / Toll booked for a vehicle in a date range — for the trip sheet's
 * settlement view only. Nothing else is fetched; nothing is ever created.
 */
export async function fetchVehicleExpensesForTrip(input: {
  vehicleId: string;
  dateFrom: string;
  dateTo: string;
}): Promise<{ dieselTotal: number; tollTotal: number; rows: TripFetchedExpenseRow[] }> {
  const session = requireSession();
  return withTenant(session.tenantId, async (tx) => {
    const items = await tx.vehicleExpenseItem.findMany({
      where: {
        vehicleId: input.vehicleId,
        // the trip sees costs ALLOCATED to the vehicle in its dates, not stock
        // purchased in that window and fitted to some other vehicle later
        allocDate: {
          gte: new Date(`${input.dateFrom}T00:00:00`),
          lte: new Date(`${input.dateTo}T23:59:59`),
        },
        voucher: {
          firmId: session.firmId,
          txnType: "EXPENSE",
          deletedAt: null,
        },
      },
      include: { voucher: true },
    });
    if (!items.length) return { dieselTotal: 0, tollTotal: 0, rows: [] };
    const partyIds = Array.from(
      new Set(items.map((i) => i.voucher.partyId).filter(Boolean))
    ) as string[];
    const [heads, suppliers] = await Promise.all([
      tx.accountHead.findMany({
        where: { id: { in: Array.from(new Set(items.map((i) => i.voucher.headId))) } },
      }),
      partyIds.length
        ? tx.party.findMany({ where: { id: { in: partyIds } }, select: { id: true, name: true } })
        : Promise.resolve([]),
    ]);
    const headName = new Map(heads.map((h) => [h.id, h.name]));
    const supplierName = new Map(suppliers.map((p) => [p.id, p.name]));
    let dieselTotal = 0;
    let tollTotal = 0;
    const rows: TripFetchedExpenseRow[] = [];
    for (const it of items) {
      const name = headName.get(it.voucher.headId) ?? "";
      const lower = name.toLowerCase();
      const isDiesel = lower.includes("diesel");
      const isToll = lower.includes("toll");
      if (!isDiesel && !isToll) continue; // only Diesel / Toll reach the trip sheet
      const amt = toNum(String(it.amount));
      if (isDiesel) dieselTotal += amt;
      else tollTotal += amt;
      rows.push({
        date: it.voucher.date.toISOString(),
        head: name,
        supplier: it.voucher.partyId ? supplierName.get(it.voucher.partyId) ?? "" : "",
        amount: amt,
        voucherNo: it.voucher.voucherNo,
        remarks: it.voucher.remarks ?? "",
      });
    }
    return {
      dieselTotal: round2(dieselTotal),
      tollTotal: round2(tollTotal),
      rows: rows.sort((a, b) => a.date.localeCompare(b.date)),
    };
  });
}
