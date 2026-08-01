import { redirect } from "next/navigation";

// Staff payroll is a tab of Office Management now; keep old links working.
export default function StaffPayrollRedirect() {
  redirect("/accounts/office?tab=staff");
}
