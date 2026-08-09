import { describe, expect, it } from "vitest";
import type { TdsPayableRow } from "@/app/(app)/accounts/tds/payable-rows";
import { buildQuarterlyData, quarterIndex } from "./data";

const row = (over: Partial<TdsPayableRow>): TdsPayableRow => ({
  date: "2026-05-10T00:00:00.000Z",
  module: "CHALLAN (OWNER)",
  section: "194C",
  party: "Party A",
  pan: "ABCPP1234F",
  refNo: "CH-1",
  invoiceAmount: 0,
  baseAmt: 0,
  tdsPct: 1,
  tdsAmt: 0,
  net: 0,
  status: "DEDUCTED",
  remarks: "",
  ...over,
});

describe("quarterIndex", () => {
  it("maps months to Indian FY quarters", () => {
    expect(quarterIndex("2026-04-01T00:00:00Z")).toBe(0); // Apr -> Q1
    expect(quarterIndex("2026-06-30T00:00:00Z")).toBe(0);
    expect(quarterIndex("2026-07-01T00:00:00Z")).toBe(1); // Jul -> Q2
    expect(quarterIndex("2026-09-15T00:00:00Z")).toBe(1);
    expect(quarterIndex("2026-10-01T00:00:00Z")).toBe(2); // Oct -> Q3
    expect(quarterIndex("2026-12-31T12:00:00Z")).toBe(2);
    expect(quarterIndex("2027-01-05T00:00:00Z")).toBe(3); // Jan -> Q4
    expect(quarterIndex("2027-03-31T00:00:00Z")).toBe(3);
  });
});

describe("buildQuarterlyData", () => {
  // the spec's own example: Party A at 1% across all four quarters
  const rows: TdsPayableRow[] = [
    row({ date: "2026-05-01T00:00:00Z", baseAmt: 800000, tdsAmt: 8000 }),
    row({ date: "2026-08-01T00:00:00Z", baseAmt: 600000, tdsAmt: 6000, refNo: "CH-2" }),
    row({ date: "2026-11-01T00:00:00Z", baseAmt: 1000000, tdsAmt: 10000, refNo: "CH-3" }),
    row({ date: "2027-02-01T00:00:00Z", baseAmt: 700000, tdsAmt: 7000, refNo: "CH-4" }),
    // same party, 0% nil deduction in Q1
    row({ date: "2026-04-20T00:00:00Z", baseAmt: 50000, tdsPct: 0, tdsAmt: 0, refNo: "CH-5", status: "NOT DEDUCTED" }),
    // another party at 2% in Q2
    row({ date: "2026-09-01T00:00:00Z", party: "Party B", baseAmt: 100000, tdsPct: 2, tdsAmt: 2000, refNo: "CH-6" }),
  ];

  it("groups party -> rate -> quarter and totals the year", () => {
    const d = buildQuarterlyData(rows, {});
    const a = d.parties.find((p) => p.party === "Party A")!;
    const a1 = a.rates.find((r) => r.rate === 1)!;
    expect(a1.cells.map((c) => c.base)).toEqual([800000, 600000, 1000000, 700000]);
    expect(a1.cells.map((c) => c.tds)).toEqual([8000, 6000, 10000, 7000]);
    expect(a1.totalBase).toBe(3100000);
    expect(a1.totalTds).toBe(31000);
    // the 0% row stays separate, never merged into the 1% row
    const a0 = a.rates.find((r) => r.rate === 0)!;
    expect(a0.totalBase).toBe(50000);
    expect(a0.totalTds).toBe(0);
    // party total combines the rates
    expect(a.totalBase).toBe(3150000);
    expect(a.totalTds).toBe(31000);
  });

  it("computes the grand total across parties", () => {
    const d = buildQuarterlyData(rows, {});
    expect(d.grand.totalBase).toBe(3250000);
    expect(d.grand.totalTds).toBe(33000);
    expect(d.grand.cells[1]).toEqual({ base: 700000, tds: 8000 }); // Q2: 6L + 1L base
  });

  it("filters by rate and quarter without breaking totals", () => {
    const byRate = buildQuarterlyData(rows, { rate: "2" });
    expect(byRate.parties).toHaveLength(1);
    expect(byRate.parties[0].party).toBe("Party B");
    expect(byRate.grand.totalTds).toBe(2000);

    const byQuarter = buildQuarterlyData(rows, { quarter: "Q3" });
    expect(byQuarter.grand.totalTds).toBe(10000);
    expect(byQuarter.grand.cells[0]).toEqual({ base: 0, tds: 0 });
  });

  it("keeps drill-down details per quarter, matching the cell sums", () => {
    const d = buildQuarterlyData(rows, {});
    const a1 = d.parties.find((p) => p.party === "Party A")!.rates.find((r) => r.rate === 1)!;
    expect(a1.details[2]).toHaveLength(1);
    expect(a1.details[2][0]).toMatchObject({ refNo: "CH-3", quarter: "Q3", tdsAmt: 10000 });
    const sum = a1.details.flat().reduce((s, r) => s + r.tdsAmt, 0);
    expect(sum).toBe(a1.totalTds);
  });
});
