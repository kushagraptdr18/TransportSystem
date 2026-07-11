import { redirect } from "next/navigation";

// Trip sheets live at /trips; this route only exists for old bookmarks.
export default function VehicleTripsRedirect() {
  redirect("/trips");
}
