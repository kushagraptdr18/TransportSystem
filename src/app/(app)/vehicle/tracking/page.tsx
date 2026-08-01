import { redirect } from "next/navigation";

// Folded into a tabbed screen; keep old links working.
export default function vehicletrackingRedirect() {
  redirect("/vehicle/management?tab=tracking");
}
