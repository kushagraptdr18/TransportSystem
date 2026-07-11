import { round2 } from "./tds";
import { gstSplit } from "./gst";

export interface InvoiceComputeInput {
  lrAmounts: number[]; // freight+charges per selected LR
  extraCharges: number[]; // typed additional charges
  gstApplicable: boolean;
  gstPct: number; // combined pct (split into cgst/sgst or igst)
  supplierStateCode?: string | null;
  recipientStateCode?: string | null;
  tdsPct: number;
  advance: number;
}

export interface InvoiceTotals {
  total: number;
  grandTotal: number;
  cgstAmt: number;
  sgstAmt: number;
  igstAmt: number;
  tdsAmt: number;
  netTotal: number;
  balance: number;
}

export function computeInvoice(i: InvoiceComputeInput): InvoiceTotals {
  const total = round2(i.lrAmounts.reduce((s, a) => s + a, 0));
  const grandTotal = round2(total + i.extraCharges.reduce((s, a) => s + a, 0));
  const gst = i.gstApplicable
    ? gstSplit({
        taxableValue: grandTotal,
        gstPct: i.gstPct,
        supplierStateCode: i.supplierStateCode,
        recipientStateCode: i.recipientStateCode,
      })
    : { cgst: 0, sgst: 0, igst: 0 };
  const tdsAmt = round2((grandTotal * i.tdsPct) / 100);
  const netTotal = round2(grandTotal + gst.cgst + gst.sgst + gst.igst);
  const balance = round2(netTotal - i.advance);
  return {
    total,
    grandTotal,
    cgstAmt: gst.cgst,
    sgstAmt: gst.sgst,
    igstAmt: gst.igst,
    tdsAmt,
    netTotal,
    balance,
  };
}

/** Parse a bulk LR paste box: space / comma / newline / semicolon separated */
export function parseBulkLrNumbers(text: string): string[] {
  return Array.from(
    new Set(
      text
        .split(/[\s,;]+/)
        .map((s) => s.trim())
        .filter(Boolean)
    )
  );
}
