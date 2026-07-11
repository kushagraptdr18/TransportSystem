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
  const total = (taxableValue * gstPct) / 100;
  const intra =
    !!supplierStateCode &&
    !!recipientStateCode &&
    supplierStateCode === recipientStateCode;
  if (intra) {
    const half = round2(total / 2);
    return { cgst: half, sgst: half, igst: 0 };
  }
  return { cgst: 0, sgst: 0, igst: round2(total) };
}

export function stateCodeFromGstin(gstin: string | null | undefined): string | null {
  if (!gstin || gstin.length < 2) return null;
  return gstin.slice(0, 2);
}
