import { redirect } from "next/navigation";

// Units are a tab of the Product Master now; keep old links working.
export default function UnitsRedirect() {
  redirect("/masters/products?tab=units");
}
