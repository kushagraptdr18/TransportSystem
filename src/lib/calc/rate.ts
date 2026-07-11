import { round2 } from "./tds";

export type RateBasis = "QTY" | "ACTUAL_WT" | "CHARGE_WT" | "FIXED";

/** amount = rate x (qty | actualWt | chargeWt | 1) depending on basis */
export function amountByBasis(
  rate: number,
  basis: RateBasis,
  qty: number,
  actualWt: number,
  chargeWt: number
): number {
  switch (basis) {
    case "QTY":
      return round2(rate * qty);
    case "ACTUAL_WT":
      return round2(rate * actualWt);
    case "CHARGE_WT":
      return round2(rate * chargeWt);
    case "FIXED":
      return round2(rate);
  }
}
