"use server";

import { z } from "zod";
import { requireSession } from "@/lib/session";
import { authorize } from "@/lib/authz";
import { saveDocRow, deleteDocRow, type ActionResult, type DocCrudConfig } from "@/lib/doc-crud";
import { parseDateInput, optStr } from "../../masters/_lib/util";
import { EXPENSE_CATEGORIES } from "@/lib/expense-categories";

const CFG: DocCrudConfig = {
  delegate: "vehicleExpense",
  entity: "VehicleExpense",
  path: "/vehicle/expenses",
  scope: "firmfy",
  softDelete: false,
};

const schema = z.object({
  id: z.string().optional(),
  date: z.string().min(1, "Date is required"),
  vehicleId: z.string().min(1, "Vehicle is required"),
  category: z.enum(EXPENSE_CATEGORIES),
  amount: z.coerce.number().min(0.01, "Amount is required"),
  remarks: optStr,
});

export async function saveVehicleExpense(input: unknown): Promise<ActionResult> {
  const session = requireSession();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { id, date, ...data } = parsed.data;
  await authorize(session, "maintenance", id ? "edit" : "create");
  const d = parseDateInput(date);
  if (!d) return { ok: false, error: "Invalid date" };
  return saveDocRow(session, CFG, id, { ...data, date: d });
}

export async function deleteVehicleExpense(id: string): Promise<ActionResult> {
  const session = requireSession();
  await authorize(session, "maintenance", "delete");
  return deleteDocRow(session, CFG, id);
}
