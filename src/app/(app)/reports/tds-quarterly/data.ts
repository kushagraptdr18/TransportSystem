import type { TdsPayableRow } from "@/app/(app)/accounts/tds/payable-rows";
import { round2 } from "@/lib/calc/tds";

/**
 * TDS Report – Quarterly Wise (PAYABLE only): pure grouping of the register's
 * rows into Party → TDS Rate → Quarter, shared by the screen and the print so
 * the two can never disagree. Nothing is recalculated — every figure is a sum
 * of recorded transaction values.
 */

export const QUARTERS = ["Q1", "Q2", "Q3", "Q4"] as const;
export const QUARTER_MONTHS = ["Apr–Jun", "Jul–Sep", "Oct–Dec", "Jan–Mar"] as const;

/** Q1 Apr–Jun, Q2 Jul–Sep, Q3 Oct–Dec, Q4 Jan–Mar — from the transaction date. */
export function quarterIndex(isoDate: string): number {
  const m = new Date(isoDate).getMonth(); // 0 = Jan
  if (m >= 3 && m <= 5) return 0;
  if (m >= 6 && m <= 8) return 1;
  if (m >= 9 && m <= 11) return 2;
  return 3;
}

export interface TdsDetailRow {
  date: string; // ISO
  refNo: string;
  module: string;
  section: string;
  party: string;
  tdsPct: number;
  baseAmt: number;
  tdsAmt: number;
  quarter: string;
  status: string;
}

export interface QuarterCell {
  base: number;
  tds: number;
}

export interface RateGroup {
  rate: number;
  cells: QuarterCell[]; // one per quarter
  totalBase: number;
  totalTds: number;
  /** contributing transactions per quarter, for the drill-down */
  details: TdsDetailRow[][];
}

export interface PartyGroup {
  party: string;
  pan: string;
  rates: RateGroup[];
  cells: QuarterCell[];
  totalBase: number;
  totalTds: number;
}

export interface QuarterlyData {
  parties: PartyGroup[];
  grand: { cells: QuarterCell[]; totalBase: number; totalTds: number };
  /** distinct recorded rates, for the filter dropdown */
  rateOptions: number[];
}

const zeroCells = (): QuarterCell[] => QUARTERS.map(() => ({ base: 0, tds: 0 }));

export function buildQuarterlyData(
  rows: TdsPayableRow[],
  filters: { partyName?: string; rate?: string; quarter?: string }
): QuarterlyData {
  const rateOptions = Array.from(new Set(rows.map((r) => r.tdsPct))).sort((a, b) => a - b);

  let filtered = rows;
  if (filters.partyName) filtered = filtered.filter((r) => r.party === filters.partyName);
  if (filters.rate !== undefined && filters.rate !== "" && filters.rate !== "ALL") {
    filtered = filtered.filter((r) => String(r.tdsPct) === filters.rate);
  }
  if (filters.quarter && filters.quarter !== "ALL") {
    const qi = QUARTERS.indexOf(filters.quarter as (typeof QUARTERS)[number]);
    if (qi >= 0) filtered = filtered.filter((r) => quarterIndex(r.date) === qi);
  }

  // party -> rate -> group
  const byParty = new Map<string, Map<number, RateGroup>>();
  const panByParty = new Map<string, string>();
  for (const r of filtered) {
    const party = r.party || "(No Party)";
    if (r.pan && !panByParty.get(party)) panByParty.set(party, r.pan);
    const rates = byParty.get(party) ?? new Map<number, RateGroup>();
    const g =
      rates.get(r.tdsPct) ??
      ({
        rate: r.tdsPct,
        cells: zeroCells(),
        totalBase: 0,
        totalTds: 0,
        details: QUARTERS.map(() => []),
      } as RateGroup);
    const qi = quarterIndex(r.date);
    g.cells[qi].base = round2(g.cells[qi].base + r.baseAmt);
    g.cells[qi].tds = round2(g.cells[qi].tds + r.tdsAmt);
    g.totalBase = round2(g.totalBase + r.baseAmt);
    g.totalTds = round2(g.totalTds + r.tdsAmt);
    g.details[qi].push({
      date: r.date,
      refNo: r.refNo,
      module: r.module,
      section: r.section,
      party,
      tdsPct: r.tdsPct,
      baseAmt: r.baseAmt,
      tdsAmt: r.tdsAmt,
      quarter: QUARTERS[qi],
      status: r.status,
    });
    rates.set(r.tdsPct, g);
    byParty.set(party, rates);
  }

  const parties: PartyGroup[] = Array.from(byParty.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([party, rates]) => {
      const rateGroups = Array.from(rates.values()).sort((a, b) => a.rate - b.rate);
      const cells = zeroCells();
      let totalBase = 0;
      let totalTds = 0;
      for (const g of rateGroups) {
        g.details.forEach((d) => d.sort((a, b) => a.date.localeCompare(b.date)));
        QUARTERS.forEach((_, qi) => {
          cells[qi].base = round2(cells[qi].base + g.cells[qi].base);
          cells[qi].tds = round2(cells[qi].tds + g.cells[qi].tds);
        });
        totalBase = round2(totalBase + g.totalBase);
        totalTds = round2(totalTds + g.totalTds);
      }
      return {
        party,
        pan: panByParty.get(party) ?? "",
        rates: rateGroups,
        cells,
        totalBase,
        totalTds,
      };
    });

  const grand = { cells: zeroCells(), totalBase: 0, totalTds: 0 };
  for (const p of parties) {
    QUARTERS.forEach((_, qi) => {
      grand.cells[qi].base = round2(grand.cells[qi].base + p.cells[qi].base);
      grand.cells[qi].tds = round2(grand.cells[qi].tds + p.cells[qi].tds);
    });
    grand.totalBase = round2(grand.totalBase + p.totalBase);
    grand.totalTds = round2(grand.totalTds + p.totalTds);
  }

  return { parties, grand, rateOptions };
}
