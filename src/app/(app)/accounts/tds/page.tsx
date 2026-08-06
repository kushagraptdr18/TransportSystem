import { requireSession } from "@/lib/session";
import { authorize } from "@/lib/authz";
import { PageHeader } from "@/components/app/page-header";
import { TabNav, type TabDef } from "@/components/app/tab-nav";
import { TdsPayableTab } from "./payable-tab";
import { TdsReceivableTab } from "./receivable-tab";

export const dynamic = "force-dynamic";

const BASE = "/accounts/tds";

const TABS: TabDef[] = [
  { value: "payable", label: "TDS Payable" },
  { value: "receivable", label: "TDS Receivable" },
];

const SUBTITLE: Record<string, string> = {
  payable:
    "TDS our company deducts while making payments — challan owner side, broker slip owner side and payment vouchers — whether deducted or not, so a nil deduction is visibly deliberate. Hired vehicles only.",
  receivable:
    "TDS other parties deduct while paying our company — receipt vouchers and the broker side of a slip. Use this while filing the Income Tax return.",
};

/**
 * TDS Register — the payable and receivable sides as tabs of one screen.
 * They are kept strictly apart: a payment's TDS can never surface on the
 * receivable side, nor a receipt's on the payable side.
 */
export default async function TdsRegisterPage({
  searchParams,
}: {
  searchParams: {
    tab?: string;
    q?: string;
    tds?: string;
    party?: string;
    module?: string;
    section?: string;
    status?: string;
    date_from?: string;
    date_to?: string;
  };
}) {
  const session = requireSession();
  await authorize(session, "reports", "view");

  const tab = TABS.some((t) => t.value === searchParams.tab)
    ? (searchParams.tab as string)
    : "payable";

  return (
    <div className="space-y-4 p-4">
      <PageHeader title="TDS Register" subtitle={SUBTITLE[tab]} />
      <TabNav tabs={TABS} active={tab} basePath={BASE} />
      {/* only the active side is queried */}
      {tab === "payable" ? (
        <TdsPayableTab searchParams={searchParams} />
      ) : (
        <TdsReceivableTab searchParams={searchParams} />
      )}
    </div>
  );
}
