import { redirect } from "next/navigation";

// REPLACEMENT: cash entries live in the Bank / Cash / Card Book now.
export default function CashBookRedirect() {
  redirect("/accounts/bank-book?type=CASH");
}
