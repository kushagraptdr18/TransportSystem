import { requireSession } from "@/lib/session";
import { authorize } from "@/lib/authz";
import { PageHeader } from "@/components/app/page-header";
import { TabNav, type TabDef } from "@/components/app/tab-nav";
import { VehicleExpensesTab } from "./expenses-tab";
import { VehicleExpenseSummaryTab } from "./summary-tab";
import { VehicleTrackingTab } from "./tracking-tab";
import { VehiclePnlTab } from "./pnl-tab";

export const dynamic = "force-dynamic";

const BASE = "/vehicle/management";

const TABS: TabDef[] = [
  { value: "expenses", label: "Vehicle Expenses" },
  { value: "summary", label: "Expense Summary" },
  { value: "tracking", label: "Vehicle Tracking" },
  { value: "pnl", label: "Profit & Loss" },
];

const SUBTITLE: Record<string, string> = {
  expenses: "Every expense booked against a vehicle, with its head and payment account.",
  summary: "The same expenses rolled up per vehicle and head.",
  tracking: "Where each vehicle is and what it is running.",
  pnl: "Earnings less running costs, per vehicle.",
};

/** Vehicle Management — expenses, summary, tracking and P&L in one screen. */
export default async function VehicleManagementPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const session = requireSession();
  await authorize(session, "maintenance", "view");

  const tab = TABS.some((t) => t.value === searchParams.tab)
    ? (searchParams.tab as string)
    : "expenses";

  return (
    <div className="space-y-4 p-4">
      <PageHeader title="Vehicle Management" subtitle={SUBTITLE[tab]} />
      <TabNav tabs={TABS} active={tab} basePath={BASE} />
      {/* only the active tab is queried */}
      {tab === "expenses" && <VehicleExpensesTab searchParams={searchParams} />}
      {tab === "summary" && <VehicleExpenseSummaryTab searchParams={searchParams} />}
      {tab === "tracking" && <VehicleTrackingTab />}
      {tab === "pnl" && <VehiclePnlTab searchParams={searchParams} />}
    </div>
  );
}
