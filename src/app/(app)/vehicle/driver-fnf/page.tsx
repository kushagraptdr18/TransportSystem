import { redirect } from "next/navigation";

// Driver F&F is a tab of Driver Management now; keep old bookmarks working.
export default function DriverFnfRedirect() {
  redirect("/vehicle/driver-management?tab=fnf");
}
