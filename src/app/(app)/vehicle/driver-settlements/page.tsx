import { redirect } from "next/navigation";

// Driver Settlement is a tab of Driver Management now; keep old bookmarks working.
export default function DriverSettlementsRedirect() {
  redirect("/vehicle/driver-management?tab=settlement");
}
