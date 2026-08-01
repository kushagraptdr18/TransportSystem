import { redirect } from "next/navigation";

// The receivable register is a tab of the TDS Register now; keep old links working.
export default function TdsReceivableRedirect() {
  redirect("/accounts/tds?tab=receivable");
}
