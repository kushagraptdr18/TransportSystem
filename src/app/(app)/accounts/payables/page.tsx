import { redirect } from "next/navigation";

// Payables is a tab of the Outstanding Register now; keep old links working.
export default function PayablesRedirect() {
  redirect("/accounts/outstanding?tab=payable");
}
