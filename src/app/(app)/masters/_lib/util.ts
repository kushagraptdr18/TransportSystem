import { Prisma } from "@prisma/client";
import { z } from "zod";

export type ActionResult = { ok: true; id: string } | { ok: false; error: string };

/** Map thrown errors to a friendly ActionResult (never throw across the wire). */
export function actionError(e: unknown): ActionResult {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2002") return { ok: false, error: "A record with the same name already exists." };
    if (e.code === "P2003") return { ok: false, error: "Record is in use and cannot be deleted." };
    if (e.code === "P2025") return { ok: false, error: "Record not found." };
  }
  return { ok: false, error: e instanceof Error ? e.message : "Unexpected error" };
}

export function zodError(err: z.ZodError): ActionResult {
  const issue = err.issues[0];
  return { ok: false, error: issue ? `${issue.path.join(".")}: ${issue.message}` : "Invalid input" };
}

/** Parse dd/mm/yyyy (or ISO) into a Date, else null. */
export function parseDateInput(s: string | null | undefined): Date | null {
  if (!s) return null;
  const m = s.trim().match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export const optStr = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));
