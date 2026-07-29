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
