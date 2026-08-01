import { requireSession } from "@/lib/session";
import { authorize } from "@/lib/authz";
import { PageHeader } from "@/components/app/page-header";
import { TabNav, type TabDef } from "@/components/app/tab-nav";
import { DocumentTypesTab } from "./types-tab";
import { DocumentRegistrationTab } from "./registration-tab";

export const dynamic = "force-dynamic";

const BASE = "/masters/document-master";

const TABS: TabDef[] = [
  { value: "types", label: "Document Type" },
  { value: "registration", label: "Document Registration" },
];

const SUBTITLE: Record<string, string> = {
  types: "The kinds of document tracked, and how far ahead each one reminds.",
  registration: "Documents held against each vehicle, with their expiry.",
};

/** Document Master — document types and their vehicle registrations. */
export default async function DocumentMasterPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const session = requireSession();
  await authorize(session, "masters", "view");

  const tab = TABS.some((t) => t.value === searchParams.tab)
    ? (searchParams.tab as string)
    : "types";

  return (
    <div className="space-y-4 p-4">
      <PageHeader title="Document Master" subtitle={SUBTITLE[tab]} />
      <TabNav tabs={TABS} active={tab} basePath={BASE} />
      {/* only the active tab is queried */}
      {tab === "registration" ? (
        <DocumentRegistrationTab searchParams={searchParams} />
      ) : (
        <DocumentTypesTab searchParams={searchParams} />
      )}
    </div>
  );
}
