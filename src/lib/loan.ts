import { round2 } from "./calc/tds";

/**
 * Loan maths — interest, instalment split and the next due date.
 *
 * Everything here only SUGGESTS figures. The EMI screen shows them filled in and
 * the user may overwrite any of them, because a real lender's statement rarely
 * matches a formula to the rupee. What is never left to the user is the split
 * rule itself: TDS applies to the interest portion only, and principal is what
 * reduces the outstanding.
 */

export const LOAN_TYPES = [
  "BUSINESS_TAKEN",
  "BUSINESS_GIVEN",
  "VEHICLE",
  "PERSONAL_TAKEN",
  "PERSONAL_GIVEN",
] as const;
export type LoanType = (typeof LOAN_TYPES)[number];

export const LOAN_TYPE_LABEL: Record<string, string> = {
  BUSINESS_TAKEN: "Business Loan Taken",
  BUSINESS_GIVEN: "Business Loan Given",
  VEHICLE: "Vehicle Loan",
  PERSONAL_TAKEN: "Personal Loan Taken",
  PERSONAL_GIVEN: "Personal Loan Given",
};

export const INTEREST_MODES = ["NONE", "FLAT", "REDUCING"] as const;
export const EMI_FREQUENCIES = ["MONTHLY", "QUARTERLY", "YEARLY"] as const;

/**
 * Money direction. A loan TAKEN is a liability: the company receives cash and
 * repays it, so an instalment is a PAYMENT and interest is an expense. A loan
 * GIVEN is the mirror — instalments are RECEIPTS and interest is income.
 */
export function isLoanTaken(loanType: string): boolean {
  // a vehicle loan is finance the company has taken against a vehicle
  return loanType !== "BUSINESS_GIVEN" && loanType !== "PERSONAL_GIVEN";
}

export const MONTHS_PER_PERIOD: Record<string, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  YEARLY: 12,
};

/** Same day-of-month, n months on; clamped when the month is shorter. */
export function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return d;
}

/**
 * Interest due for one period on the balance still outstanding.
 *
 * FLAT charges the rate on the ORIGINAL amount for the whole tenure, so every
 * instalment carries the same interest. REDUCING charges it on what is actually
 * left, so interest falls as the loan is repaid. NONE is an interest-free loan
 * between related parties, which is common enough to be its own mode.
 */
export function periodInterest(args: {
  interestMode: string;
  ratePct: number;
  principalOriginal: number;
  principalOutstanding: number;
  frequency: string;
}): number {
  if (args.interestMode === "NONE" || args.ratePct <= 0) return 0;
  const months = MONTHS_PER_PERIOD[args.frequency] ?? 1;
  const base =
    args.interestMode === "FLAT" ? args.principalOriginal : args.principalOutstanding;
  return round2((base * args.ratePct * months) / (12 * 100));
}

export interface EmiSuggestion {
  emiNo: number;
  dueDate: Date | null;
  interest: number;
  principal: number;
  total: number;
  tds: number;
  net: number;
  /** true when this instalment clears the loan */
  closes: boolean;
}

/**
 * What the next instalment looks like before the user touches anything.
 *
 * The instalment is capped at what is actually left (outstanding + its interest)
 * so the last EMI never overpays the loan, which is the case a fixed EMI amount
 * always gets wrong.
 */
export function suggestNextEmi(args: {
  interestMode: string;
  ratePct: number;
  amount: number;
  outstanding: number;
  emiAmount: number;
  frequency: string;
  emiStartDate: Date | null;
  paidCount: number;
  tdsApplicable: boolean;
  tdsPct: number;
}): EmiSuggestion {
  const emiNo = args.paidCount + 1;
  const dueDate = args.emiStartDate
    ? addMonths(args.emiStartDate, (MONTHS_PER_PERIOD[args.frequency] ?? 1) * args.paidCount)
    : null;

  const interest = periodInterest({
    interestMode: args.interestMode,
    ratePct: args.ratePct,
    principalOriginal: args.amount,
    principalOutstanding: args.outstanding,
    frequency: args.frequency,
  });

  // an EMI covers interest first; whatever is left of it repays principal
  const wanted = args.emiAmount > 0 ? args.emiAmount : round2(args.outstanding + interest);
  const maxTotal = round2(args.outstanding + interest);
  const total = Math.min(wanted, maxTotal);
  const principal = round2(Math.max(0, total - interest));
  const tds = args.tdsApplicable ? round2((interest * args.tdsPct) / 100) : 0;

  return {
    emiNo,
    dueDate,
    interest,
    principal,
    total: round2(total),
    tds,
    net: round2(total - tds),
    closes: round2(args.outstanding - principal) <= 0.009,
  };
}

/** Due date of the instalment after `paidCount` have been paid. */
export function nextDueDate(
  emiStartDate: Date | null,
  frequency: string,
  paidCount: number
): Date | null {
  if (!emiStartDate) return null;
  return addMonths(emiStartDate, (MONTHS_PER_PERIOD[frequency] ?? 1) * paidCount);
}
