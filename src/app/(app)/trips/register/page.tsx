import { redirect } from "next/navigation";

// The trip register is a tab of Trip Management now; keep old links working.
export default function TripRegisterRedirect() {
  redirect("/trips?tab=register");
}
