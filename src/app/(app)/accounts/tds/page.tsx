import { redirect } from "next/navigation";

// The mixed "TDS Report" was replaced by the TDS Payable Register
// (payments only) and the TDS Receivable Register (receipts only).
export default function TdsRedirect() {
  redirect("/accounts/tds-report");
}
