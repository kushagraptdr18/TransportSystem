import { redirect } from "next/navigation";

// The register is a tab of the Vouchers screen now; keep old links working.
export default function VoucherRegisterRedirect() {
  redirect("/accounts/vouchers?tab=REGISTER");
}
