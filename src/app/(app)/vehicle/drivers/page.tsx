import { redirect } from "next/navigation";

// Driver Master moved to the Masters module; keep old bookmarks working.
export default function VehicleDriversRedirect() {
  redirect("/masters/drivers");
}
