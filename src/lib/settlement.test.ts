import { describe, it, expect } from "vitest";
import { signedRemainder, settlementStatus } from "./settlement";

/**
 * Regression tests for the driver +/- settlement live-remainder rule: a row
 * already (partly) settled by Payment/Receipt-voucher allocations must be
 * payable only for what remains — never the full recorded amount again.
 */
describe("signedRemainder (driver settlement live outstanding)", () => {
  it("unpaid positive row stays fully payable", () =>
    expect(signedRemainder(5000, 0)).toBe(5000));
  it("fully voucher-settled positive row -> 0 (nothing to pay again)", () =>
    expect(signedRemainder(5000, 5000)).toBe(0));
  it("partially settled positive row -> only the remainder", () =>
    expect(signedRemainder(30000, 20000)).toBe(10000));
  it("over-settlement never flips the direction", () =>
    expect(signedRemainder(5000, 6000)).toBe(0));
  it("negative row (driver owes) shrinks toward zero as receipts settle it", () =>
    expect(signedRemainder(-5000, 2000)).toBe(-3000));
  it("fully received negative row -> 0", () =>
    expect(signedRemainder(-5000, 5000)).toBe(0));
  it("paisa rounding stays clean", () =>
    expect(signedRemainder(100.1, 33.37)).toBe(66.73));
});

describe("settlementStatus", () => {
  it("outstanding within a paisa reads PAID", () =>
    expect(settlementStatus(100, 0.005)).toBe("PAID"));
  it("partly settled reads PARTLY PAID", () =>
    expect(settlementStatus(100, 40)).toBe("PARTLY PAID"));
  it("untouched reads UNPAID", () => expect(settlementStatus(100, 100)).toBe("UNPAID"));
});
