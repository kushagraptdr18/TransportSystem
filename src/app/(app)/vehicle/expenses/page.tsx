import { redirect } from "next/navigation";

// Folded into a tabbed screen; keep old links working.
export default function vehicleexpensesRedirect() {
  redirect("/vehicle/management?tab=expenses");
}
