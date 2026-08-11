/**
 * Common Accounting Ledger Framework — one ledger head per accounting concept,
 * for the whole software.
 *
 * Modules used to name their own head per direction: a chalan credited
 * "Detention Charges" while a broker slip debited "Detention Income", and the
 * same detention ended up in two ledgers that could never be netted. Commission,
 * Mamool, LD Charge, Courier and Round Off were all split the same way.
 *
 * Here every one of those names collapses to ONE canonical head. Direction is
 * expressed the way accounting already expresses it — by the side of the entry
 * (charged = expense side, recovered = income side) — so the head's running
 * balance IS the net position, and Trial Balance / P&L see a single line.
 *
 * Adding a module never means adding a head: post to the canonical name and the
 * entry lands in the same ledger every other module uses.
 */

export type HeadKind = "INCOME" | "EXPENSE" | "ADJUSTMENT";

export interface CommonHead {
  /** the one ledger name every module posts to */
  name: string;
  /** P&L classification of the head's natural balance */
  kind: HeadKind;
  /** every legacy / module-specific name that means this head */
  aliases: string[];
}

/**
 * The common heads. `aliases` are matched case- and spacing-insensitively, so
 * "ROUND OFF", "Round off" and "Round Off Income" all resolve to "Round Off".
 */
export const COMMON_HEADS: CommonHead[] = [
  {
    name: "Shortage",
    kind: "EXPENSE",
    // the shortage register already treats this as the single head; the voucher's
    // legacy "DEDUCTION" head was the same money under another name
    aliases: ["Deduction", "Shortage Expense", "Shortage Recovered", "Shortage Recovery"],
  },
  {
    name: "Round Off",
    kind: "INCOME",
    // knocked off a payable => income, added to it => expense; one net balance
    aliases: ["Roundoff", "Round Off Income", "Round Off Expense", "Round Off Recovered"],
  },
  {
    name: "Commission",
    kind: "EXPENSE",
    aliases: [
      "Commission Allowed",
      "Commission Income",
      "Commission Expense",
      "Commission Recovered",
      "Commission Recovery",
    ],
  },
  {
    name: "Mamool",
    kind: "EXPENSE",
    aliases: [
      "Mamul",
      "Mamool Allowed",
      "Mamool Recovered",
      "Mamool Income",
      "Mamool Expense",
      "Mamul Allowed",
      "Mamul Recovered",
      "Mamul Income",
      "Mamul Expense",
    ],
  },
  {
    name: "Courier Charges",
    kind: "EXPENSE",
    // courier stays an expense head; deducted from a party it is a recovery on
    // the income side of the SAME head, never a second "Courier Recovered" head
    aliases: ["Courier", "Courier Recovered", "Courier Recovery", "Courier Expense", "Courier Income"],
  },
  {
    name: "Detention",
    kind: "INCOME",
    aliases: ["Detention Charges", "Detention Income", "Detention Expense", "Detention Recovered"],
  },
  {
    name: "ODC",
    kind: "INCOME",
    aliases: ["ODC Charges", "ODC Income", "ODC Expense", "ODC Recovered"],
  },
  {
    name: "Fine Slip",
    kind: "EXPENSE",
    aliases: ["Fine", "Fine Slip Charges", "Fine Slip Income", "Fine Slip Expense", "Fine Slip Recovered"],
  },
  {
    name: "LD Charge",
    kind: "EXPENSE",
    aliases: ["LD", "LD Charge Allowed", "LD Charge Recovered", "LD Charge Income", "LD Charge Expense"],
  },
  {
    name: "Payment Charges",
    kind: "EXPENSE",
    aliases: ["Payment Charge", "Payment Charges Recovered", "Payment Charges Income"],
  },
  {
    name: "Other Charges",
    kind: "EXPENSE",
    aliases: ["Other Chalan Charges", "Other Charge", "Others"],
  },
  // TDS keeps its two statutory ledgers — payable (we deducted) and receivable
  // (someone deducted from us). No third "TDS Adjustment" head is ever created.
  { name: "TDS Payable", kind: "INCOME", aliases: ["TDS Deducted", "TDS Payable Account"] },
  { name: "TDS Receivable", kind: "EXPENSE", aliases: ["TDS Receivable Account"] },
];

/** The heads that carry both an expense and a recovery side, for the report. */
export const TWO_SIDED_HEADS = COMMON_HEADS.filter(
  (h) => h.name !== "TDS Payable" && h.name !== "TDS Receivable"
).map((h) => h.name);

const normalize = (s: string) => s.trim().replace(/[_-]+/g, " ").replace(/\s+/g, " ").toUpperCase();

const CANONICAL_BY_ALIAS = new Map<string, CommonHead>();
for (const head of COMMON_HEADS) {
  CANONICAL_BY_ALIAS.set(normalize(head.name), head);
  for (const alias of head.aliases) CANONICAL_BY_ALIAS.set(normalize(alias), head);
}

/**
 * The common head a module-supplied name belongs to, or null when the name is
 * its own head (Freight Income, Lorry Hire Expense, Diesel Expense...). Those
 * are already single ledgers and are left exactly as the caller named them.
 */
export function commonHead(name: string): CommonHead | null {
  return CANONICAL_BY_ALIAS.get(normalize(name)) ?? null;
}

/**
 * Resolve any head name a module asks for to the one it must actually post to.
 * `kind` is the caller's intent, honoured only for non-common heads — a common
 * head's kind is fixed so its ledger cannot flip classification between modules.
 */
export function resolveHead(name: string, kind: HeadKind): { name: string; kind: HeadKind } {
  const common = commonHead(name);
  return common ? { name: common.name, kind: common.kind } : { name, kind };
}

/**
 * TDS never gets an adjustment head of its own: a payment deducts TDS we owe
 * the government (payable), a receipt is TDS someone deducted from us
 * (receivable). §10 of the accounting framework.
 */
export function tdsHead(voucherType: "RECEIPT" | "PAYMENT" | "CONTRA" | "JOURNAL"): string {
  return voucherType === "RECEIPT" ? "TDS Receivable" : "TDS Payable";
}

/**
 * Module-dedicated heads the software posts to by name (outside the common
 * registry). Together with COMMON_HEADS these are the SYSTEM heads: seeded
 * up front so they exist before the first transaction, and protected — the
 * Account Head master can neither rename, reclassify nor delete them,
 * because every module's postings depend on these exact names.
 */
export const MODULE_HEADS: { name: string; kind: "INCOME" | "EXPENSE" }[] = [
  { name: "Freight Income", kind: "INCOME" }, // billing
  // GST charged on our bills — a statutory liability ledger like TDS Payable,
  // never P&L income; the operational P&L excludes it by name
  { name: "GST Output", kind: "INCOME" },
  { name: "Lorry Hire Expense", kind: "EXPENSE" }, // chalan / broker slip owner side
  { name: "Urea Expense", kind: "EXPENSE" }, // adblue + trip sheet
  { name: "Driver Salary Expense", kind: "EXPENSE" }, // driver salary + F&F
  { name: "Salary Deductions (Driver)", kind: "INCOME" },
  { name: "Staff Salary Expense", kind: "EXPENSE" }, // staff payroll
  { name: "Salary Deductions (Staff)", kind: "INCOME" },
  { name: "Driver Recovery (F&F)", kind: "INCOME" },
  { name: "Vehicle EMI Expense", kind: "EXPENSE" }, // vehicle loans
  { name: "Interest Expense", kind: "EXPENSE" }, // non-vehicle loans
  { name: "Interest Income", kind: "INCOME" },
  { name: "Penalty", kind: "EXPENSE" },
];

/** Every system head with the kind it must carry, for seeding. */
export const SYSTEM_HEADS: { name: string; kind: string }[] = [
  ...COMMON_HEADS.map((h) => ({ name: h.name, kind: h.kind === "ADJUSTMENT" ? "EXPENSE" : h.kind })),
  ...MODULE_HEADS,
];

const SYSTEM_NAMES = new Set<string>([
  ...Array.from(CANONICAL_BY_ALIAS.keys()),
  ...MODULE_HEADS.map((h) => normalize(h.name)),
]);

/** True when a head name (canonical or alias) belongs to the software itself. */
export function isSystemHeadName(name: string): boolean {
  return SYSTEM_NAMES.has(normalize(name));
}
