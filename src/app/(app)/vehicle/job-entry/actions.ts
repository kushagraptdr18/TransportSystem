"use server";

import { z } from "zod";
import { requireSession } from "@/lib/session";
import { authorize } from "@/lib/authz";
import { saveDocRow, deleteDocRow, type ActionResult, type DocCrudConfig } from "@/lib/doc-crud";
import { parseDateInput, optStr } from "../../masters/_lib/util";
import { round2 } from "@/lib/calc/tds";

const CFG: DocCrudConfig = {
  delegate: "jobEntry",
  entity: "JobEntry",
  path: "/vehicle/job-entry",
  docType: "JOB_ENTRY",
  numberField: "invoiceNo",
  scope: "firmfy",
  softDelete: true,
};

const schema = z.object({
  id: z.string().optional(),
  invoiceNo: z.string().trim().default(""),
  refNo: optStr,
  invoiceDate: z.string().min(1, "Invoice date is required"),
  billType: z.enum(["ESTIMATE", "INVOICE"]).default("INVOICE"),
  invType: z.enum(["CASH", "CREDIT"]).default("CREDIT"),
  supplierId: optStr,
  vehicleId: optStr,
  attenderName: optStr,
  challanNo: optStr,
  challanDate: optStr,
  currKm: z.coerce.number().nullable().optional(),
  kmInterval: z.coerce.number().nullable().optional(),
  daysInterval: z.coerce.number().nullable().optional(),
  dueDate: optStr,
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

export async function saveJobEntry(input: unknown): Promise<ActionResult> {
  const session = requireSession();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { id, invoiceDate, challanDate, dueDate, ...data } = parsed.data;
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
    currKm: data.currKm || null,
    kmInterval: data.kmInterval || null,
    daysInterval: data.daysInterval ? Math.round(data.daysInterval) : null,
    invoiceDate: date,
    challanDate: parseDateInput(challanDate),
    dueDate: parseDateInput(dueDate),
    grandTotal,
    balance,
    remindType: data.kmInterval ? "KM" : data.daysInterval ? "DAYS" : null,
    ...(id ? {} : { lines: [] }),
  });
}

export async function deleteJobEntry(id: string): Promise<ActionResult> {
  const session = requireSession();
  await authorize(session, "maintenance", "delete");
  return deleteDocRow(session, CFG, id);
}
