"use server";

import { z } from "zod";
import { requireSession } from "@/lib/session";
import { authorize } from "@/lib/authz";
import { saveDocRow, deleteDocRow, type ActionResult, type DocCrudConfig } from "@/lib/doc-crud";
import { parseDateInput, optStr } from "../../masters/_lib/util";

const CFG: DocCrudConfig = {
  delegate: "tyreInstallation",
  entity: "TyreInstallation",
  path: "/vehicle/tyres",
  scope: "firm",
  softDelete: false,
};

const schema = z.object({
  id: z.string().optional(),
  entryDate: z.string().min(1, "Entry date is required"),
  vehicleId: z.string().min(1, "Vehicle is required"),
  productId: optStr,
  position: optStr,
  partNo: optStr,
  instKm: z.coerce.number().nullable().optional(),
  uninstKm: z.coerce.number().nullable().optional(),
  instDate: optStr,
  uninstDate: optStr,
  remarks: optStr,
});

export async function saveTyre(input: unknown): Promise<ActionResult> {
  const session = requireSession();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { id, entryDate, instDate, uninstDate, ...data } = parsed.data;
  await authorize(session, "maintenance", id ? "edit" : "create");
  const date = parseDateInput(entryDate);
  if (!date) return { ok: false, error: "Invalid entry date" };
  return saveDocRow(session, CFG, id, {
    ...data,
    instKm: data.instKm || null,
    uninstKm: data.uninstKm || null,
    entryDate: date,
    instDate: parseDateInput(instDate),
    uninstDate: parseDateInput(uninstDate),
  });
}

export async function deleteTyre(id: string): Promise<ActionResult> {
  const session = requireSession();
  await authorize(session, "maintenance", "delete");
  return deleteDocRow(session, CFG, id);
}
