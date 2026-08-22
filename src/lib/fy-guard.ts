import type { Tx } from "@/lib/db";

/**
 * Wrong-FY date guard for ENTRY forms: a new/edited document's own date must
 * fall inside the session's financial year. Viewing and settling old-year
 * data stays date-driven everywhere (FY continuity) — but CREATING a document
 * belongs to the year the user is standing in, else back-dated entries land
 * with the wrong fyId stamp and split registers.
 */
export async function assertDateInFy(
  tx: Tx,
  session: { fyId: string },
  date: Date,
  what = "entry"
): Promise<void> {
  const fy = await tx.financialYear.findUnique({ where: { id: session.fyId } });
  if (!fy) return;
  if (date < fy.startDate || date > fy.endDate) {
    const d = `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
    throw new Error(
      `Ye date (${d}) FY ${fy.label} ki nahi hai — uss FY mein jaakar ${what} karein.`
    );
  }
}
