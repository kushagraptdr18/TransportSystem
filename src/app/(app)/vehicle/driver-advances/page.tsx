import { redirect } from "next/navigation";

// Driver Advance is a tab of Driver Management now; keep old bookmarks working.
export default function DriverAdvancesRedirect() {
  redirect("/vehicle/driver-management?tab=advance");
}
