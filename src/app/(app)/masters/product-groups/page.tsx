import { redirect } from "next/navigation";

// Product groups are a tab of the Product Master now; keep old links working.
export default function ProductGroupsRedirect() {
  redirect("/masters/products?tab=groups");
}
