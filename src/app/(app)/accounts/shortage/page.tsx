import { redirect } from "next/navigation";

// REPLACEMENT: shortage positions live in the Common Ledger; the full book
// is one click away in the Ledger Summary.
export default function ShortageRedirect() {
  redirect("/accounts/common-ledger");
}
