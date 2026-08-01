import { requireSession } from "@/lib/session";
import { authorize } from "@/lib/authz";
import { PageHeader } from "@/components/app/page-header";
import { TabNav, type TabDef } from "@/components/app/tab-nav";
import { OutstandingReceivableTab } from "./receivable-tab";
import { OutstandingPayableTab } from "./payable-tab";

export const dynamic = "force-dynamic";

const BASE = "/accounts/outstanding";

const TABS: TabDef[] = [
  { value: "receivable", label: "Receivable" },
  { value: "payable", label: "Payable" },
];

const SUBTITLE: Record<string, string> = {
  receivable:
    "Everything still owed to the firm — bills and cash memos, net of receipts, advances and approved deductions.",
  payable:
    "Everything the firm still has to pay — chalan freight, broker slip owner side and unpaid staff salaries, net of payments and settlement write-offs.",
};

/** Outstanding Register — receivable and payable as tabs of one screen. */
export default async function OutstandingRegisterPage({
  searchParams,
}: {
  searchParams: {
    tab?: string;
    date_from?: string;
    date_to?: string;
    party?: string;
    source?: string;
    show_closed?: string;
  };
}) {
  const session = requireSession();
  await authorize(session, "reports", "view");

  const tab = TABS.some((t) => t.value === searchParams.tab)
    ? (searchParams.tab as string)
    : "receivable";

  return (
    <div className="space-y-4 p-4">
      <PageHeader title="Outstanding Register" subtitle={SUBTITLE[tab]} />
      <TabNav tabs={TABS} active={tab} basePath={BASE} />
      {/* only the active side is queried */}
      {tab === "payable" ? (
        <OutstandingPayableTab searchParams={searchParams} />
      ) : (
        <OutstandingReceivableTab searchParams={searchParams} />
      )}
    </div>
  );
}
