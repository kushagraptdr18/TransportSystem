import { formatDate } from "@/lib/utils";
import { LOAN_TYPE_LABEL } from "@/lib/loan";
import { FilterBar, type FilterDef } from "@/components/data/filter-bar";
import { SimpleReport, type ReportColumn, type ReportRow } from "@/components/accounts/simple-report";
import { getFinanceData, type EmiRow, type LoanRow } from "./queries";

/**
 * Every finance report is the same two datasets — loans and instalments —
 * sliced differently. Deriving them here rather than storing separate tables is
 * what keeps the Loan Register, the EMI Register and the outstanding figures
 * from ever disagreeing.
 */
const REPORTS = {
  LOANS: "Loan Register",
  EMIS: "EMI Register",
  OUTSTANDING: "Loan Outstanding",
  VEHICLE: "Vehicle Loans",
  BUSINESS: "Business Loans",
  PERSONAL: "Personal Loans",
  INTEREST: "Interest Register",
  DUE: "EMI Due",
  OTHERS: "Other Receipts & Payments",
} as const;

type ReportKey = keyof typeof REPORTS;

const LOAN_COLUMNS: ReportColumn[] = [
  { key: "loanNo", header: "Loan No" },
  { key: "date", header: "Date" },
  { key: "party", header: "Party" },
  { key: "loanType", header: "Loan Type" },
  { key: "vehicle", header: "Vehicle" },
  { key: "amount", header: "Loan Amount", kind: "money" },
  { key: "repaid", header: "Principal Repaid", kind: "money" },
  { key: "outstanding", header: "Outstanding", kind: "money" },
  { key: "interestPaid", header: "Interest Paid", kind: "money" },
  { key: "nextDue", header: "Next EMI" },
  { key: "status", header: "Status", kind: "badge" },
];

const EMI_COLUMNS: ReportColumn[] = [
  { key: "payDate", header: "Payment Date" },
  { key: "loanNo", header: "Loan No" },
  { key: "party", header: "Party" },
  { key: "vehicle", header: "Vehicle" },
  { key: "emiNo", header: "EMI No" },
  { key: "dueDate", header: "Due Date" },
  { key: "principal", header: "Principal", kind: "money" },
  { key: "interest", header: "Interest", kind: "money" },
  { key: "penalty", header: "Penalty", kind: "money" },
  { key: "otherAmt", header: "Other", kind: "money" },
  { key: "tdsAmt", header: "TDS", kind: "money" },
  { key: "total", header: "Instalment", kind: "money" },
  { key: "netPaid", header: "Bank Movement", kind: "money" },
  { key: "voucherNo", header: "Voucher No" },
];

const loanRow = (l: LoanRow): ReportRow => ({
  loanNo: l.loanNo,
  date: formatDate(l.date),
  party: l.party,
  loanType: LOAN_TYPE_LABEL[l.loanType] ?? l.loanType,
  vehicle: l.vehicle,
  amount: l.amount,
  repaid: l.repaid,
  outstanding: l.outstanding,
  interestPaid: l.interestPaid,
  nextDue: l.nextDueDate ? formatDate(l.nextDueDate) : "",
  status: l.status,
});

const emiRow = (e: EmiRow): ReportRow => ({
  payDate: formatDate(e.payDate),
  loanNo: e.loanNo,
  party: e.party,
  vehicle: e.vehicle,
  emiNo: e.isSettlement ? `${e.emiNo} (settlement)` : e.emiNo,
  dueDate: e.dueDate ? formatDate(e.dueDate) : "",
  principal: e.principal,
  interest: e.interest,
  penalty: e.penalty,
  otherAmt: e.otherAmt,
  tdsAmt: e.tdsAmt,
  total: e.total,
  netPaid: e.netPaid,
  voucherNo: e.voucherNo,
});

export async function FinanceReportsTab({
  searchParams,
}: {
  searchParams: { report?: string };
}) {
  const key = ((searchParams.report ?? "LOANS") in REPORTS
    ? searchParams.report ?? "LOANS"
    : "LOANS") as ReportKey;
  const { loans, emis, txns } = await getFinanceData();

  let columns: ReportColumn[] = LOAN_COLUMNS;
  let rows: ReportRow[] = [];
  let note = "";

  switch (key) {
    case "LOANS":
      rows = loans.map(loanRow);
      break;
    case "EMIS":
      columns = EMI_COLUMNS;
      rows = emis.map(emiRow);
      break;
    case "OUTSTANDING":
      rows = loans.filter((l) => l.outstanding > 0.009).map(loanRow);
      note = "Loans with principal still to run, whatever their type.";
      break;
    case "VEHICLE":
      rows = loans.filter((l) => l.vehicleId).map(loanRow);
      note = "Loans linked to a vehicle — their EMI cost reaches that vehicle's P&L.";
      break;
    case "BUSINESS":
      rows = loans
        .filter((l) => l.loanType === "BUSINESS_TAKEN" || l.loanType === "BUSINESS_GIVEN")
        .map(loanRow);
      break;
    case "PERSONAL":
      rows = loans
        .filter((l) => l.loanType === "PERSONAL_TAKEN" || l.loanType === "PERSONAL_GIVEN")
        .map(loanRow);
      break;
    case "INTEREST":
      columns = [
        { key: "payDate", header: "Date" },
        { key: "loanNo", header: "Loan No" },
        { key: "party", header: "Party" },
        { key: "vehicle", header: "Vehicle" },
        { key: "interest", header: "Interest", kind: "money" },
        { key: "tdsAmt", header: "TDS on Interest", kind: "money" },
        { key: "netInterest", header: "Net Interest", kind: "money" },
        { key: "voucherNo", header: "Voucher No" },
      ];
      rows = emis
        .filter((e) => e.interest > 0.009)
        .map((e) => ({
          payDate: formatDate(e.payDate),
          loanNo: e.loanNo,
          party: e.party,
          vehicle: e.vehicle,
          interest: e.interest,
          tdsAmt: e.tdsAmt,
          netInterest: Math.round((e.interest - e.tdsAmt) * 100) / 100,
          voucherNo: e.voucherNo,
        }));
      note = "Interest charged on every instalment, with the tax deducted from it.";
      break;
    case "DUE": {
      const today = new Date();
      columns = [
        { key: "loanNo", header: "Loan No" },
        { key: "party", header: "Party" },
        { key: "vehicle", header: "Vehicle" },
        { key: "nextDue", header: "Due Date" },
        { key: "overdueDays", header: "Overdue Days", kind: "money" },
        { key: "emiAmount", header: "EMI Amount", kind: "money" },
        { key: "outstanding", header: "Outstanding", kind: "money" },
      ];
      rows = loans
        .filter((l) => l.status === "ACTIVE" && l.nextDueDate)
        .map((l) => {
          const due = new Date(l.nextDueDate!);
          const days = Math.floor((today.getTime() - due.getTime()) / (24 * 60 * 60 * 1000));
          return {
            loanNo: l.loanNo,
            party: l.party,
            vehicle: l.vehicle,
            nextDue: formatDate(l.nextDueDate!),
            // negative = not due yet; the report shows what is actually late
            overdueDays: days > 0 ? days : 0,
            emiAmount: l.emiAmount,
            outstanding: l.outstanding,
          };
        })
        .sort((a, b) => Number(b.overdueDays) - Number(a.overdueDays));
      note = "Running loans by their next instalment date — overdue ones first.";
      break;
    }
    case "OTHERS":
      columns = [
        { key: "voucherNo", header: "Voucher No" },
        { key: "date", header: "Date" },
        { key: "direction", header: "Type", kind: "badge" },
        { key: "txnType", header: "Nature" },
        { key: "party", header: "Party" },
        { key: "bank", header: "Cash / Bank" },
        { key: "amount", header: "Amount", kind: "money" },
        { key: "remarks", header: "Remarks" },
      ];
      rows = txns.map((t) => ({
        voucherNo: t.voucherNo,
        date: formatDate(t.date),
        direction: t.direction,
        txnType: t.txnType.replace(/_/g, " "),
        party: t.party,
        bank: t.bank,
        amount: t.amount,
        remarks: t.remarks,
      }));
      break;
  }

  const filters: FilterDef[] = [
    {
      type: "select",
      key: "report",
      label: "Report",
      options: Object.entries(REPORTS).map(([value, label]) => ({ value, label })),
    },
  ];

  return (
    <div className="space-y-3">
      <FilterBar filters={filters} />
      <SimpleReport
        title={note || REPORTS[key]}
        columns={columns}
        rows={rows}
        fileName={`finance-${key.toLowerCase()}`}
        emptyMessage="Nothing to show for this report yet."
      />
    </div>
  );
}
