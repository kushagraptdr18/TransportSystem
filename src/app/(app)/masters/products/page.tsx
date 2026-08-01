import { requireSession } from "@/lib/session";
import { authorize } from "@/lib/authz";
import { PageHeader } from "@/components/app/page-header";
import { TabNav, type TabDef } from "@/components/app/tab-nav";
import { ProductGroupsTab } from "./groups-tab";
import { ProductsTab } from "./products-tab";
import { UnitsTab } from "./units-tab";

export const dynamic = "force-dynamic";

const BASE = "/masters/products";

const TABS: TabDef[] = [
  { value: "groups", label: "Product Groups" },
  { value: "products", label: "Products" },
  { value: "units", label: "Units" },
];

const SUBTITLE: Record<string, string> = {
  groups: "Categories products are filed under.",
  products: "What the firm carries, with its group and default unit.",
  units: "Units of measure and their conversion value.",
};

/** Product Master — groups, products and units in one screen. */
export default async function ProductMasterPage({
  searchParams,
}: {
  searchParams: { tab?: string; q?: string; group?: string };
}) {
  const session = requireSession();
  await authorize(session, "masters", "view");

  const tab = TABS.some((t) => t.value === searchParams.tab)
    ? (searchParams.tab as string)
    : "products";

  return (
    <div className="space-y-4 p-4">
      <PageHeader title="Product Master" subtitle={SUBTITLE[tab]} />
      <TabNav tabs={TABS} active={tab} basePath={BASE} />
      {/* only the active tab is queried */}
      {tab === "groups" && <ProductGroupsTab searchParams={searchParams} />}
      {tab === "products" && <ProductsTab searchParams={searchParams} />}
      {tab === "units" && <UnitsTab searchParams={searchParams} />}
    </div>
  );
}
