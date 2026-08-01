import { redirect } from "next/navigation";

// The payable register is a tab of the TDS Register now; keep old links working.
export default function TdsPayableRedirect() {
  redirect("/accounts/tds?tab=payable");
}
