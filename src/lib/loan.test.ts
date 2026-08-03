import { describe, expect, it } from "vitest";
import { addMonths, isLoanTaken, nextDueDate, periodInterest, suggestNextEmi } from "./loan";

describe("loan interest", () => {
  it("charges flat interest on the original amount, whatever is left", () => {
    const flat = (outstanding: number) =>
      periodInterest({
        interestMode: "FLAT",
        ratePct: 12,
        principalOriginal: 100000,
        principalOutstanding: outstanding,
        frequency: "MONTHLY",
      });
    expect(flat(100000)).toBe(1000);
    expect(flat(40000)).toBe(1000); // unchanged — that is what "flat" means
  });

  it("charges reducing interest on what is actually outstanding", () => {
    const reducing = (outstanding: number) =>
      periodInterest({
        interestMode: "REDUCING",
        ratePct: 12,
        principalOriginal: 100000,
        principalOutstanding: outstanding,
        frequency: "MONTHLY",
      });
    expect(reducing(100000)).toBe(1000);
    expect(reducing(40000)).toBe(400);
  });

  it("scales with the instalment frequency", () => {
    const args = {
      interestMode: "REDUCING",
      ratePct: 12,
      principalOriginal: 100000,
      principalOutstanding: 100000,
    };
    expect(periodInterest({ ...args, frequency: "QUARTERLY" })).toBe(3000);
    expect(periodInterest({ ...args, frequency: "YEARLY" })).toBe(12000);
  });

  it("is nil on an interest-free loan", () => {
    expect(
      periodInterest({
        interestMode: "NONE",
        ratePct: 12,
        principalOriginal: 100000,
        principalOutstanding: 100000,
        frequency: "MONTHLY",
      })
    ).toBe(0);
  });
});

describe("instalment suggestion", () => {
  const base = {
    interestMode: "REDUCING",
    ratePct: 12,
    amount: 100000,
    outstanding: 100000,
    emiAmount: 10000,
    frequency: "MONTHLY",
    emiStartDate: new Date("2026-08-05T00:00:00"),
    paidCount: 0,
    tdsApplicable: false,
    tdsPct: 0,
  };

  it("covers interest first, then repays principal", () => {
    const s = suggestNextEmi(base);
    expect(s.interest).toBe(1000);
    expect(s.principal).toBe(9000);
    expect(s.total).toBe(10000);
    expect(s.closes).toBe(false);
  });

  it("never lets the last instalment overpay the loan", () => {
    const s = suggestNextEmi({ ...base, outstanding: 4000, paidCount: 11 });
    // 4000 left + 40 interest — not the full 10000 EMI
    expect(s.total).toBe(4040);
    expect(s.principal).toBe(4000);
    expect(s.closes).toBe(true);
  });

  it("deducts TDS from the interest only, never the principal", () => {
    const s = suggestNextEmi({ ...base, tdsApplicable: true, tdsPct: 10 });
    expect(s.interest).toBe(1000);
    expect(s.tds).toBe(100); // 10% of interest, not of the 10000 instalment
    expect(s.net).toBe(9900);
  });

  it("clears the whole balance when no EMI amount is set", () => {
    const s = suggestNextEmi({ ...base, emiAmount: 0 });
    expect(s.principal).toBe(100000);
    expect(s.closes).toBe(true);
  });

  it("dates each instalment from the EMI start date", () => {
    // compared in local time: these are calendar dates, not instants
    const ymd = (d: Date | null) =>
      d
        ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
            d.getDate()
          ).padStart(2, "0")}`
        : null;
    expect(ymd(suggestNextEmi(base).dueDate)).toBe("2026-08-05");
    expect(ymd(suggestNextEmi({ ...base, paidCount: 2 }).dueDate)).toBe("2026-10-05");
    expect(
      ymd(suggestNextEmi({ ...base, frequency: "QUARTERLY", paidCount: 2 }).dueDate)
    ).toBe("2027-02-05");
  });
});

describe("dates and direction", () => {
  it("clamps to the end of a shorter month", () => {
    expect(addMonths(new Date("2026-01-31T00:00:00"), 1).getDate()).toBe(28);
  });

  it("has no due date when the loan has no EMI schedule", () => {
    expect(nextDueDate(null, "MONTHLY", 3)).toBeNull();
  });

  it("treats a vehicle loan as finance taken, not given", () => {
    expect(isLoanTaken("VEHICLE")).toBe(true);
    expect(isLoanTaken("BUSINESS_TAKEN")).toBe(true);
    expect(isLoanTaken("BUSINESS_GIVEN")).toBe(false);
    expect(isLoanTaken("PERSONAL_GIVEN")).toBe(false);
  });
});
