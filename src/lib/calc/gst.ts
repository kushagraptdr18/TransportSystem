import { round2 } from "./tds";

/**
 * Indian GST split: intra-state (same GST state code) -> CGST + SGST halves;
 * inter-state -> IGST full.
 */
export function gstSplit(opts: {
  taxableValue: number;
  gstPct: number;
  supplierStateCode?: string | null;
  recipientStateCode?: string | null;
}): { cgst: number; sgst: number; igst: number } {
  const { taxableValue, gstPct, supplierStateCode, recipientStateCode } = opts;
  const total = round2((taxableValue * gstPct) / 100);
  // recipient state unknown (unregistered / B2C customer, no GSTIN): default
  // to the supplier's own state — a walk-in customer is local, and forcing
  // IGST on them was wrong. IGST only when BOTH states are known and differ.
  const intra =
    !!supplierStateCode &&
    (!recipientStateCode || supplierStateCode === recipientStateCode);
  if (intra) {
    // halves must reconstruct the rounded total exactly — 2 × round2(total/2)
    // can drift a paisa (e.g. 10.01 → 5.01 + 5.00, never 5.01 + 5.01)
    const cgst = round2(total / 2);
    return { cgst, sgst: round2(total - cgst), igst: 0 };
  }
  return { cgst: 0, sgst: 0, igst: total };
}

export function stateCodeFromGstin(gstin: string | null | undefined): string | null {
  if (!gstin || gstin.length < 2) return null;
  return gstin.slice(0, 2);
}
