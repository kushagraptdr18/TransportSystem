/**
 * Income-tax TDS on freight (Section 194C):
 * - PAN's 4th character identifies the holder type.
 *   'P' (Individual) or 'H' (HUF)  -> 1%
 *   any other (Company/Firm/AOP/...) -> 2%
 * - If the broker filed a declaration (owns <= 10 vehicles, 194C(6)), TDS = 0.
 */
export type TdsMode = "TDS_APPLICABLE" | "DECLARATION";

export function tdsPctFromPan(pan: string | null | undefined, mode: TdsMode | null | undefined): number {
  if (mode !== "TDS_APPLICABLE") return 0;
  if (!pan || pan.length < 4) return 2; // safe default when PAN missing
  const c = pan[3].toUpperCase();
  return c === "P" || c === "H" ? 1 : 2;
}

export function tdsAmount(base: number, pct: number): number {
  return round2((base * pct) / 100);
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
