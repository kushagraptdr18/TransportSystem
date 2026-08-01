import { redirect } from "next/navigation";

// Folded into a tabbed screen; keep old links working.
export default function vehiclepnlRedirect() {
  redirect("/vehicle/management?tab=pnl");
}
