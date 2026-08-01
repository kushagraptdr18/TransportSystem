import { redirect } from "next/navigation";

// Driver Master is the Driver Info tab of Driver Management now.
export default function DriverMasterRedirect() {
  redirect("/vehicle/driver-management?tab=info");
}
