import { describe, expect, it } from "vitest";
import { COMMON_HEADS, commonHead, resolveHead, tdsHead } from "./account-heads";

describe("common ledger heads", () => {
  it("collapses the direction-specific names modules used to create", () => {
    // the pairs that used to be two separate ledgers
    const pairs: [string, string, string][] = [
      ["Detention Charges", "Detention Income", "Detention"],
      ["Commission Allowed", "Commission Income", "Commission"],
      ["Mamool Allowed", "Mamool Recovered", "Mamool"],
      ["LD Charge Allowed", "LD Charge Recovered", "LD Charge"],
      ["ODC Charges", "ODC Income", "ODC"],
      ["Fine Slip Charges", "Fine Slip Income", "Fine Slip"],
      ["Courier Recovered", "Courier Charges", "Courier Charges"],
      ["Payment Charges", "Payment Charges Recovered", "Payment Charges"],
    ];
    for (const [a, b, canonical] of pairs) {
      expect(resolveHead(a, "EXPENSE").name).toBe(canonical);
      expect(resolveHead(b, "INCOME").name).toBe(canonical);
    }
  });

  it("fixes the kind of a common head regardless of what the caller asks for", () => {
    // a chalan calling it INCOME and a broker slip calling it EXPENSE must not
    // reclassify the shared ledger
    expect(resolveHead("Detention Charges", "EXPENSE")).toEqual({ name: "Detention", kind: "INCOME" });
    expect(resolveHead("Commission Income", "INCOME").kind).toBe("EXPENSE");
  });

  it("matches aliases regardless of case, spacing and separators", () => {
    for (const name of ["ROUND OFF", "round off", "Round_Off", " Roundoff "]) {
      expect(commonHead(name)?.name).toBe("Round Off");
    }
    expect(commonHead("DEDUCTION")?.name).toBe("Shortage");
  });

  it("leaves module-specific heads alone", () => {
    for (const name of ["Freight Income", "Lorry Hire Expense", "Diesel Expense", "Urea Expense"]) {
      expect(commonHead(name)).toBeNull();
      expect(resolveHead(name, "EXPENSE")).toEqual({ name, kind: "EXPENSE" });
    }
  });

  it("routes TDS to the statutory ledgers, never an adjustment head", () => {
    expect(tdsHead("PAYMENT")).toBe("TDS Payable");
    expect(tdsHead("RECEIPT")).toBe("TDS Receivable");
    expect(commonHead("TDS Adjustment")).toBeNull();
  });

  it("has no name serving two canonical heads", () => {
    const seen = new Set<string>();
    for (const head of COMMON_HEADS) {
      for (const name of [head.name, ...head.aliases]) {
        const key = name.trim().replace(/[_-]+/g, " ").replace(/\s+/g, " ").toUpperCase();
        expect(seen.has(key), `${name} is claimed twice`).toBe(false);
        seen.add(key);
      }
    }
  });
});
