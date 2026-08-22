import type { Tx } from "@/lib/db";

/**
 * Wrong-FY date guard for ENTRY forms: a new/edited document's own date must
 * fall inside the session's financial year. Viewing and settling old-year
 * data stays date-driven everywhere (FY continuity) — but CREATING a document
 * belongs to the year the user is standing in, else back-dated entries land
 * with the wrong fyId stamp and split registers.
 */
/**
 * DAY-level compare, never time-level: FY rows and form dates arrive with
 * mixed midnights (UTC-stamped vs local-stamped), and a time compare falsely
 * rejected 1 April / 31 March at the boundary. A calendar day is either in
 * the year or it isn't — the clock has no vote.
 */
const dayNum = (d: Date) => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();

export async function assertDateInFy(
  tx: Tx,
  session: { fyId: string },
  date: Date,
  what = "entry"
): Promise<void> {
  const fy = await tx.financialYear.findUnique({ where: { id: session.fyId } });
  if (!fy) return;
  const d = dayNum(date);
  if (d < dayNum(fy.startDate) || d > dayNum(fy.endDate)) {
    const label = `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
    throw new Error(
      `Ye date (${label}) FY ${fy.label} ki nahi hai — uss FY mein jaakar ${what} karein.`
    );
  }
}
