import type { Tx } from "@/lib/db";

/**
 * Wrong-FY date guard for ENTRY forms: a new/edited document's own date must
 * fall inside the session's financial year. Viewing and settling old-year
 * data stays date-driven everywhere (FY continuity) — but CREATING a document
 * belongs to the year the user is standing in, else back-dated entries land
 * with the wrong fyId stamp and split registers.
 */
/**
 * DAY-level compare in IST, never time-level: the browser serializes a
 * picked "1 April" as 31 March 18:30 UTC, and the UTC production server's
 * local getters then read the wrong day — rejecting 1 April inside its own
 * FY. The business runs on Indian time (the dashboard pins IST the same
 * way), so the calendar day is extracted at +5:30 for BOTH the form date
 * and the FY bounds, whatever midnight each was stored with.
 */
const IST_MS = 5.5 * 3600 * 1000;
const dayNum = (d: Date) => {
  const t = new Date(d.getTime() + IST_MS);
  return t.getUTCFullYear() * 10000 + (t.getUTCMonth() + 1) * 100 + t.getUTCDate();
};

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
