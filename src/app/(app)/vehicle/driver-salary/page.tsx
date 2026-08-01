import { redirect } from "next/navigation";

// Driver Salary is a tab of Driver Management now; keep old bookmarks working.
export default function DriverSalaryRedirect() {
  redirect("/vehicle/driver-management?tab=salary");
}
