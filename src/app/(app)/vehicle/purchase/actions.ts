"use server";

import { z } from "zod";
import { requireSession } from "@/lib/session";
import { authorize } from "@/lib/authz";
import { saveDocRow, deleteDocRow, type ActionResult, type DocCrudConfig } from "@/lib/doc-crud";
import { parseDateInput, optStr } from "../../masters/_lib/util";
import { round2 } from "@/lib/calc/tds";

const CFG: DocCrudConfig = {
  delegate: "purchase",
  entity: "Purchase",
  path: "/vehicle/purchase",
  docType: "PURCHASE",
  numberField: "invoiceNo",
  scope: "firmfy",
  softDelete: true,
};

const schema = z.object({
  id: z.string().optional(),
  invoiceNo: z.string().trim().default(""),
  refNo: optStr,
  invoiceDate: z.string().min(1, "Invoice date is required"),
  invType: z.enum(["CASH", "CREDIT"]).default("CREDIT"),
  buyerId: optStr,
  vehicleId: optStr,
  challanNo: optStr,
  challanDate: optStr,
  orderNo: optStr,
  orderDate: optStr,
  transMode: optStr,
  supplyPlace: optStr,
  totTaxable: z.coerce.number().default(0),
  discAmt: z.coerce.number().default(0),
  totCgst: z.coerce.number().default(0),
  totSgst: z.coerce.number().default(0),
  totIgst: z.coerce.number().default(0),
  freight: z.coerce.number().default(0),
  others: z.coerce.number().default(0),
  tcsAmt: z.coerce.number().default(0),
  advance: z.coerce.number().default(0),
  narration: optStr,
});

export async function savePurchase(input: unknown): Promise<ActionResult> {
  const session = requireSession();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { id, invoiceDate, challanDate, orderDate, ...data } = parsed.data;
  await authorize(session, "maintenance", id ? "edit" : "create");
  const date = parseDateInput(invoiceDate);
  if (!date) return { ok: false, error: "Invalid invoice date" };
  const grandTotal = round2(
    data.totTaxable - data.discAmt + data.totCgst + data.totSgst + data.totIgst +
      data.freight + data.others + data.tcsAmt
  );
  const balance = round2(grandTotal - data.advance);
  return saveDocRow(session, CFG, id, {
    ...data,
    invoiceDate: date,
    challanDate: parseDateInput(challanDate),
    orderDate: parseDateInput(orderDate),
    grandTotal,
    balance,
    ...(id ? {} : { kind: "PURCHASE", lines: [] }),
  });
}

export async function deletePurchase(id: string): Promise<ActionResult> {
  const session = requireSession();
  await authorize(session, "maintenance", "delete");
  return deleteDocRow(session, CFG, id);
}
