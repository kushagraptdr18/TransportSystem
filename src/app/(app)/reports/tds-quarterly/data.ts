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
  /** numeric rate for challan / broker-slip rows; null for the combined voucher row */
  rate: number | null;
  /** "1%" for document rows, "Voucher / Direct" for the combined voucher row */
  label: string;
  /** true = payment/journal-voucher TDS: only the TDS amount is shown, never rate/base */
  direct: boolean;
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

/**
 * Voucher-entered TDS is often a direct lump figure at whatever rate applied
 * (0.1%, 10%, ...) — per party it collapses into ONE "Voucher / Direct" row
 * showing only the TDS amount, never a rate or base. Challan and broker-slip
 * rows keep their recorded rate and base.
 */
const DIRECT_MODULES = new Set(["PAYMENT VOUCHER", "JOURNAL VOUCHER"]);
export const DIRECT_RATE_FILTER = "DIRECT";
export const DIRECT_LABEL = "Voucher / Direct";

export function buildQuarterlyData(
  rows: TdsPayableRow[],
  filters: { partyName?: string; rate?: string; quarter?: string }
): QuarterlyData {
  const rateOptions = Array.from(
    new Set(rows.filter((r) => !DIRECT_MODULES.has(r.module)).map((r) => r.tdsPct))
  ).sort((a, b) => a - b);

  let filtered = rows;
  if (filters.partyName) filtered = filtered.filter((r) => r.party === filters.partyName);
  if (filters.rate !== undefined && filters.rate !== "" && filters.rate !== "ALL") {
    filtered = filtered.filter((r) =>
      filters.rate === DIRECT_RATE_FILTER
        ? DIRECT_MODULES.has(r.module)
        : !DIRECT_MODULES.has(r.module) && String(r.tdsPct) === filters.rate
    );
  }
  if (filters.quarter && filters.quarter !== "ALL") {
    const qi = QUARTERS.indexOf(filters.quarter as (typeof QUARTERS)[number]);
    if (qi >= 0) filtered = filtered.filter((r) => quarterIndex(r.date) === qi);
  }

  // party -> rate-key -> group ("DIRECT" pools every voucher/journal row)
  const byParty = new Map<string, Map<string, RateGroup>>();
  const panByParty = new Map<string, string>();
  for (const r of filtered) {
    const party = r.party || "(No Party)";
    if (r.pan && !panByParty.get(party)) panByParty.set(party, r.pan);
    const direct = DIRECT_MODULES.has(r.module);
    const key = direct ? DIRECT_RATE_FILTER : String(r.tdsPct);
    const rates = byParty.get(party) ?? new Map<string, RateGroup>();
    const g =
      rates.get(key) ??
      ({
        rate: direct ? null : r.tdsPct,
        label: direct ? DIRECT_LABEL : `${r.tdsPct}%`,
        direct,
        cells: zeroCells(),
        totalBase: 0,
        totalTds: 0,
        details: QUARTERS.map(() => []),
      } as RateGroup);
    const qi = quarterIndex(r.date);
    // a direct voucher entry carries only its TDS figure — no base is summed
    const base = direct ? 0 : r.baseAmt;
    g.cells[qi].base = round2(g.cells[qi].base + base);
    g.cells[qi].tds = round2(g.cells[qi].tds + r.tdsAmt);
    g.totalBase = round2(g.totalBase + base);
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
    rates.set(key, g);
    byParty.set(party, rates);
  }

  const parties: PartyGroup[] = Array.from(byParty.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([party, rates]) => {
      // recorded rates ascending; the combined voucher row always last
      const rateGroups = Array.from(rates.values()).sort(
        (a, b) => (a.rate ?? Infinity) - (b.rate ?? Infinity)
      );
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
