import { redirect } from "next/navigation";

// REPLACEMENT: the Company Operational P&L is the profitability report.
export default function PnlRedirect() {
  redirect("/accounts/operational-pnl");
}
