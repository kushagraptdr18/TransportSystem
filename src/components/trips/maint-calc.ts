import { round2 } from "@/lib/calc/tds";

/** GST inclusive flag on maintenance/purchase lines. */
export type GstInc = "INC" | "NON";

export interface LineCalcInput {
  qty: number;
  rate: number;
  discountPct: number;
  gstInc: GstInc;
  gstPct: number;
  /** true -> IGST, false -> CGST+SGST split */
  igst?: boolean;
}

export interface LineCalcResult {
  total: number;
  discAmt: number;
  taxableValue: number;
  cgstAmt: number;
  sgstAmt: number;
  igstAmt: number;
  amount: number;
}

export function calcLine(i: LineCalcInput): LineCalcResult {
  const total = round2(i.qty * i.rate);
  const discAmt = round2((total * (i.discountPct || 0)) / 100);
  const afterDisc = round2(total - discAmt);
  const taxableValue =
    i.gstInc === "INC" && i.gstPct > 0
      ? round2((afterDisc * 100) / (100 + i.gstPct))
      : afterDisc;
  const gstTotal = round2((taxableValue * (i.gstPct || 0)) / 100);
  let cgstAmt = 0;
  let sgstAmt = 0;
  let igstAmt = 0;
  if (i.igst) {
    igstAmt = gstTotal;
  } else {
    cgstAmt = round2(gstTotal / 2);
    sgstAmt = round2(gstTotal / 2);
  }
  const amount = round2(taxableValue + cgstAmt + sgstAmt + igstAmt);
  return { total, discAmt, taxableValue, cgstAmt, sgstAmt, igstAmt, amount };
}

export interface FooterInput {
  freight: number;
  others: number;
  tcsPct: number;
  advance: number;
}

export interface FooterTotals {
  totTaxable: number;
  discAmt: number;
  totCgst: number;
  totSgst: number;
  totIgst: number;
  tcsAmt: number;
  grandTotal: number;
  balance: number;
}

export function calcFooter(lines: LineCalcResult[], f: FooterInput): FooterTotals {
  const totTaxable = round2(lines.reduce((s, l) => s + l.taxableValue, 0));
  const discAmt = round2(lines.reduce((s, l) => s + l.discAmt, 0));
  const totCgst = round2(lines.reduce((s, l) => s + l.cgstAmt, 0));
  const totSgst = round2(lines.reduce((s, l) => s + l.sgstAmt, 0));
  const totIgst = round2(lines.reduce((s, l) => s + l.igstAmt, 0));
  const lineAmount = round2(lines.reduce((s, l) => s + l.amount, 0));
  const base = round2(lineAmount + (f.freight || 0) + (f.others || 0));
  const tcsAmt = round2((base * (f.tcsPct || 0)) / 100);
  const grandTotal = round2(base + tcsAmt);
  const balance = round2(grandTotal - (f.advance || 0));
  return { totTaxable, discAmt, totCgst, totSgst, totIgst, tcsAmt, grandTotal, balance };
}
