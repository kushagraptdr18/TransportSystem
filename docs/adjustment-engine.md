# Reference-Based Adjustment & Deduction Engine

_Last updated: 29 Jul 2026 (commit series around `20260729000002_adjustment_engine`)_

This document records what the centralized adjustment engine does, **what was
deliberately deferred**, why each deferred piece is needed, and what building
it will give the business. Use it as the backlog + design note for the next
phase of the Accounts module.

---

## 1. What is implemented today

| Piece | Where | Notes |
| --- | --- | --- |
| Central engine (types, references, balanced posting, auto ledger heads) | `src/lib/adjust-engine.ts` | Shared by Receipt / Payment / Journal vouchers. 18 adjustment types, 16 reference types. New types = add an Account Head with kind `ADJUSTMENT`; no code change. |
| Adjustment lines per voucher | `VoucherAdjustment` table (migration `20260729000002`) | Type, reference type/no/date, amount, remarks, posted head — full audit trail. |
| Gross-settlement posting | `src/app/(app)/accounts/vouchers/actions.ts` | Party ledger is settled for the **gross** amount; bank moves net; every deduction posts to its own head. Deducted amounts never remain outstanding. |
| Journal voucher (no cash/bank movement) | `JOURNAL` voucher type + tab | Debit party ↔ credit party/account + adjustment lines. Covers bill-to-bill, advance, loan, debit/credit-note adjustments. |
| TDS Payable Register | `/accounts/tds-report` | Auto-populated from header TDS, allocation TDS and TDS adjustment lines. Query-driven → always current. |
| Outstanding fixes | `/accounts/outstanding` | Deleted-voucher allocations excluded; approved deductions (TDS/deduction) settle bills. |

## 2. Deferred scope (to build next)

### 2.1 Reference Registers: Advance / Loan / Broker / Security Deposit

**What:** Standalone report pages that show, per reference number, the running
position:

```
ADV-0001   Opening 1,00,000   Utilised 40,000 (INV-120)   Balance 60,000
LOAN-001   Given     20,000   Recovered 5,000             Balance 15,000
BRK-0005   Commission 10,000  Paid 7,000                  Balance  3,000
```

**Why it is needed:**
- Today the data exists (every adjustment line stores `referenceType` +
  `referenceNo`, and ledger entries carry the same in narration), but there is
  **no single screen** where a user can ask "how much of advance ADV-0001 is
  left?" — they must mentally total voucher lines or read the party ledger.
- Advances/loans that are only visible inside a party's ledger get forgotten;
  balances silently age. A register makes every open reference visible until
  it reaches zero, which is the whole point of reference-based accounting.
- Auditors and customers ask for exactly this format ("advance utilisation
  statement", "loan recovery schedule"). Producing it manually from ledgers is
  slow and error-prone.

**What it will help:**
- Prevents double-utilisation of the same advance and missed loan recoveries.
- Gives instant answers during party reconciliation calls.
- Enables aging (how long has ADV-0001 been open?) for cash-flow planning.

**How to build (design sketch):** query-only pages — no schema change needed.
Group `VoucherAdjustment` rows by `referenceType` + `referenceNo`; the opening
amount comes from the voucher that *created* the reference (a PAYMENT voucher
with reference ADV-0001 creates the advance; RECEIPT/JOURNAL lines against it
utilise it). Columns: Reference No, Party, Opening, Utilised/Recovered (with
voucher drill-down), Balance, Last Activity. Filter: open-only / all.

### 2.2 Bill Status on the Invoice ("Paid" flag)

**What:** When receipts + approved deductions against an invoice reach the
bill amount, stamp the invoice itself (e.g. `paymentStatus = PAID`,
`receivedTotal`) instead of deriving it only in the Outstanding page.

**Why it is needed:**
- Today "paid" is derived at query time from `VoucherAllocation` sums. That is
  correct but invisible outside the Outstanding page — the Billing Register,
  invoice print, and Challan Status dashboard each re-derive (or skip) it.
- A stored status lets every screen (billing register badges, submission
  history "Payment Received" step, dashboards) agree without recomputing.

**What it will help:** consistent Paid/Partially Paid/Pending badges
everywhere, faster registers (no allocation aggregation per render), and a
trigger point for downstream automation (e.g. auto-closing bill submissions).

**How to build:** add `receivedTotal` + `paymentStatus` to `Invoice`; update
them inside `saveVoucher`/`deleteVoucher` whenever allocations for BILLING /
GST_BILLING change (single helper in the engine). Backfill via one script that
replays existing allocations.

### 2.3 Adjustment Voucher print & numbered ADJ- series

**What:** A printable voucher layout for journal/adjustment vouchers and an
optional dedicated `ADJ-` number series distinct from journals.

**Why:** customers/auditors receiving a debit-note or bill-to-bill adjustment
expect a signed paper trail; today the journal exists in the register but has
no print format.

**What it will help:** statutory-grade documentation of every non-cash
adjustment; fewer disputes ("we never agreed to that deduction").

### 2.4 Approval workflow for deductions

**What:** Optional maker–checker: adjustments above a configurable amount
need ADMIN/OWNER approval before posting.

**Why:** deductions (claims, damages, rate differences) are where revenue
leaks. Right now any operator can post any adjustment; the audit trail records
it but nobody has to approve it first.

**What it will help:** control over margin leakage, cleaner disputes with
customers (only approved claims reduce outstanding), and an approval log for
audits.

### 2.5 Debit Note / Credit Note documents

**What:** First-class DN/CN documents (numbered, printable) that the
adjustment lines can reference by id instead of free-text `referenceNo`.

**Why:** today DN/CN are just adjustment types + typed reference numbers;
there is no document to print or send, and typos in reference numbers cannot
be validated.

**What it will help:** GST-compliant credit notes (needed when invoice values
are reduced after filing), validated references (pick from a list instead of
typing), and automatic DN/CN registers.

## 2A. Common Accounting Ledger Framework (built 3 Aug 2026)

One ledger head per accounting concept, for the whole software. The registry is
`src/lib/account-heads.ts`; `ensureAccountHead` and `ensureAdjustmentHead` both
resolve through it, so a module can keep asking for whatever name reads well
locally and the entry still lands in the shared ledger.

| Was | Now |
| --- | --- |
| `Detention Charges` (chalan) + `Detention Income` (broker slip) | `Detention` |
| `Commission Allowed` + `Commission Income` | `Commission` |
| `Mamool Allowed` + `Mamool Recovered` | `Mamool` |
| `LD Charge Allowed` + `LD Charge Recovered` | `LD Charge` |
| `ODC Charges` + `ODC Income`, `Fine Slip Charges` + `Fine Slip Income` | `ODC`, `Fine Slip` |
| `Courier Recovered` | `Courier Charges` (recovery is the income side of it) |
| voucher `TDS` / `DEDUCTION` / `ROUND OFF` adjustment heads | `TDS Payable` / `TDS Receivable`, `Shortage`, `Round Off` |

Direction is expressed by the side of the entry — charged debits the head,
recovered credits it — so the head's running balance is the net position and
Trial Balance / P&L see one line. Consequences worth knowing:

- A common head's `kind` is fixed by the registry, not by the caller, so no
  module can reclassify a shared ledger.
- Those heads are now `INCOME`/`EXPENSE` rather than `ADJUSTMENT`, which means
  voucher TDS, shortage and round-off finally appear in Profit & Loss (it
  filters on kind).
- Per-allocation round-off on a voucher now posts (party leg + `Round Off`
  head). It settled the reference before but posted nothing, so the party
  ledger disagreed with the outstanding register by exactly the rounding.
- Invoice additional charges each credit their own head instead of being clubbed
  into `Freight Income`; a charge named after a common head joins that ledger.
- `npx tsx scripts/merge-account-heads.ts` repoints existing history onto the
  canonical heads and deletes the duplicates. Idempotent; amounts and sides are
  never touched, so report totals are unchanged — they just stop being split.

## 2B. Vehicle & staff references, journal any-to-any (3 Aug 2026)

Migration `20260803000002_vehicle_staff_references`.

- New `ModuleLink` values `VEHICLE_EXPENSE`, `STAFF_ADVANCE`,
  `DRIVER_SETTLEMENT`, so a voucher can point at those documents. All three are
  allocation candidates, settle partially, and take TDS / shortage / other /
  round-off through the same engine as a bill or a chalan.
- Ceilings that stop double settlement: a vehicle expense already paid at entry
  offers 0; a staff advance nets what payroll already recovered; a driver
  settlement already SETTLED from its own screen (which creates its own voucher)
  offers 0.
- `VehicleExpenseVoucher.refNo` now STORES the voucher-number fallback instead of
  deriving it, matching office bills and salaries.
- Vehicle expense bills on credit appear in the Outstanding Payables register.
- **Driver Advance is deliberately NOT a settleable reference.** Every advance
  records a payment mode and moves cash or bank at entry, so there is no
  outstanding; offering it in the payment voucher would pay the driver twice.
  Recovery happens against the driver's ledger via the trip settlement.
- Journal vouchers are now ledger-to-ledger: both sides accept a party, a
  bank/cash account or an income/expense head (`Voucher.creditHeadId` carries the
  credit-side head). `bankPartyId` is therefore optional on journals only.

## 2C. Vehicle expense allocation (3 Aug 2026)

Migration `20260803000003_vehicle_expense_allocation`.

Bulk stock — tyres, chains, batteries, spares — is bought before anyone knows
which vehicle will use it. A purchase therefore no longer has to name a vehicle:

- **Purchase**: booked once, expense head Dr / supplier Cr, exactly as before.
  With no vehicle named it carries its own `amount`, plus optional `itemName` and
  `qty`, and shows up as an *unallocated vehicle expense*.
- **Allocation** (`/vehicle/management?tab=allocation`): hands quantity and
  amount to one or many vehicles, each with its own **allocation date** and
  remarks. It writes `VehicleExpenseItem` rows. For a COMPANY vehicle it
  **posts nothing to the ledger** — the purchase already carries the
  accounting, so Trial Balance and P&L never double-count. For a **RELATIVE
  vehicle** (4 Aug 2026) the allocated share transfers to the owner on the
  allocation date — owner Dr / original expense head Cr, refType
  `VEH_EXP_ALLOC` keyed by the item id, the same pair a vehicle-wise purchase
  posts — so the company expense nets down and the owner's settlement payable
  reduces. Undoing an allocation line (or deleting the purchase) reverses only
  its own entries. Amount and quantity are both capped at what is left.
- **`VehicleExpenseItem.allocDate` is now the date every vehicle-cost reader
  uses** (vehicle P&L, expense summary, both trip-sheet fetchers). A chain bought
  on the 1st and fitted on the 8th hits that vehicle's P&L on the 8th and leaves
  the 1st–7th alone. Existing rows were backfilled with their purchase date.
- Editing a bulk purchase keeps its allocations and refuses to drop the amount
  below what vehicles have already taken; editing a vehicle-wise voucher still
  replaces the split it owns.

## 2D. AdBlue / Urea: stock first, bill later (3 Aug 2026)

Migration `20260803000004_adblue_pending_bill`.

Stock is delivered before the supplier's invoice, so a refill is a two-step
record on ONE row:

1. **Receipt** — date, supplier, litres, remarks. Stock increases and **nothing
   is posted**: no expense, no payable, no ledger entry. Status `PENDING BILL`,
   with an aging day-count.
2. **Bill update** — the same entry gains amount, bill no/date, GST, supplier
   ledger and payment. Only now does it post `Urea Expense Dr / Supplier Cr`,
   plus `Supplier Dr / Cash-Bank Cr` when paid on the spot. Left on credit it is
   an `ADBLUE_PURCHASE` payable the Payment Voucher settles, and it shows in
   Outstanding Payables.

Status is derived, never stored: PENDING BILL → BILL UPDATED → PARTLY PAID →
PAID (from voucher allocations). The register filters on it, so the pending-bill
report is the same screen. Duplicate bill numbers per supplier are rejected.

**The purchase never carries a vehicleId, and that is the point.** Urea reaches a
vehicle's P&L only through trip-sheet consumption (litres x rate), where the
owner, relative-vehicle, broker-settlement and expense-head rules already apply —
none of which changed. Booking the purchase against a vehicle would double the
cost against the trip that consumed it.

## 2E. Finance & Loan Management (3 Aug 2026)

Migration `20260803000005_finance_loan_management`; module at `/finance`.

`Loan` + `LoanEmi` + `FinanceTxn`, engine in `src/lib/loan.ts`, actions in
`src/app/(app)/finance/actions.ts`. Three things a user does: create the loan,
pay each EMI, close it.

- **No second accounting engine.** Every instalment, settlement and personal
  transfer creates a real Payment/Receipt `Voucher` and posts through
  `postLedger`, the same way a driver settlement does — so the Voucher Register,
  Ledger Summary, Trial Balance, P&L and TDS reports pick it all up.
- **Outstanding is derived**, never stored: loan amount less the principal of
  the instalments recorded. The register, the reports and the vehicle finance tab
  therefore cannot disagree.
- **TDS applies to interest only.** The action rejects a deduction larger than
  the instalment's interest, and TDS routes to `TDS Payable` / `TDS Receivable`
  via the common-head registry — never a TDS head of the module's own.
- **Interest is a suggestion, not a rule.** NONE / FLAT / REDUCING fill the EMI
  screen in; every figure stays editable, because a lender's statement rarely
  matches a formula to the rupee. The last instalment is capped at what is left
  so a fixed EMI can never overpay the loan.
- **Vehicle loans:** since 4 Aug 2026 the **full instalment** (principal +
  interest + penalty + charges) appears in Vehicle P&L as its own "EMI
  Expenses" row on the PAYMENT date — a profitability-analysis decision: the
  whole EMI is the financing cost of running that vehicle. This is analysis
  only; the LEDGER is unchanged (principal still settles the loan liability,
  interest/penalty/charges post to their heads, and Trial Balance / company
  P&L are untouched). The Vehicle Cost Summary mirrors the same figure so the
  two reports can never disagree. EMIs come only from Finance & Loans — no
  manual entry in the report.
- **Relative vehicles** reuse the existing rule: the whole instalment transfers
  to the relative owner's ledger, exactly as diesel and every expense head do.
- Deleting an instalment removes its voucher and postings and reopens the loan;
  a loan with instalments cannot be deleted until they are, so no voucher is ever
  orphaned.

## 2F. Advance re-adjustment in Receipt / Payment vouchers (3 Aug 2026)

No schema change — built on `PartyAdvance` / `PartyAdvanceUse` and
`applyManualAdvanceUses` (`src/lib/party-advance.ts`).

- **Direction-correct pickers.** `getAllocationCandidates` now takes the
  voucher type: a Receipt offers only receivable modules, a Payment only
  payable ones. `getOpenAdvances` lists a party's open advances strictly by
  direction (Receipt → `RECEIVED`, Payment → `PAID`), never another party's,
  never a consumed one, never the advance the voucher being edited created.
- **Adjust Advance grid** in the voucher form: each open advance shows
  original / already adjusted / balance with an editable amount. One advance
  can split across many references, many advances can fund one reference, and
  a voucher may move no money at all (pure adjustment: amount 0, bank leg not
  posted — zero-value ledger legs are dropped).
- **Funding rule:** allocations ≤ money moved + advance adjusted, and advance
  adjusted ≤ allocations — an adjusted advance settles references, it can
  never silently convert into a new advance. The remainder rule is unchanged:
  `netAmount + advanceUsed − allocated` becomes the party advance.
- **No new ledger postings for the adjusted portion.** The advance voucher
  already moved the money and posted the party leg; the adjustment is
  reference bookkeeping (`VoucherAllocation` settles the document,
  `PartyAdvanceUse` consumes the advance, refNo carries the settled document
  references). Outstanding, ledger advance history and the Advance Register
  all derive from those rows, so they agree by construction.
- Save releases the voucher's previous uses and re-applies inside one
  transaction; delete restores them (`restoreAdvanceUses`).

## 3. Guiding principles (do not regress these)

1. **History is immutable** — corrections are always new vouchers linked to
   the original reference; ledger re-posting happens only via
   `reverseLedger` + full re-post on edit.
2. **Nothing adjusted stays outstanding** — every deduction posts to its own
   head; the party is settled gross.
3. **One engine** — new voucher-like modules must call
   `applyAdjustments` / `adjustmentLedgerEntries` from `src/lib/adjust-engine.ts`
   rather than posting deductions themselves.
4. **Types are data, not code** — new adjustment types come from the Account
   Head master (`kind = ADJUSTMENT`).
5. **One head per concept** — never create a second ledger for the other
   direction of an existing head (no `X Recovered` beside `X`). Add the name to
   `COMMON_HEADS` in `src/lib/account-heads.ts` and post to the shared head.
