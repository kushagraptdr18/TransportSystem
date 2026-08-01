import { redirect } from "next/navigation";

// Folded into a tabbed screen; keep old links working.
export default function vehicleexpensesummaryRedirect() {
  redirect("/vehicle/management?tab=summary");
}
