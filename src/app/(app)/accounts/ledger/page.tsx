import { requireSession } from "@/lib/session";
import { authorize } from "@/lib/authz";
import { FilterBar, type FilterDef } from "@/components/data/filter-bar";
import { SimpleReport } from "@/components/accounts/simple-report";
import { BOOK_COLUMNS, ledgerBookRows } from "../_lib/book";

export const dynamic = "force-dynamic";

export default async function LedgerSummaryPage({
  searchParams,
}: {
  searchParams: { date_from?: string; date_to?: string; party?: string };
}) {
  const session = requireSession();
  await authorize(session, "reports", "view");

  const { rows, parties } = await ledgerBookRows({
    session,
    partyId: searchParams.party,
    dateFrom: searchParams.date_from,
    dateTo: searchParams.date_to,
  });

  const filters: FilterDef[] = [
    { type: "daterange", key: "date", label: "Date" },
    {
      type: "combobox",
      key: "party",
      label: "Party / Ledger",
      options: parties.map((p) => ({ value: p.id, label: p.name })),
    },
  ];

  return (
    <div className="space-y-4 p-4">
      <h1 className="page-title">Ledger Summary</h1>
      <FilterBar filters={filters} />
      <SimpleReport
        title={
          searchParams.party
            ? "Opening balance included in running balance"
            : "Select a party to see its ledger with running balance"
        }
        columns={BOOK_COLUMNS}
        rows={rows}
        fileName="ledger-summary"
        emptyMessage="No ledger entries in this period."
      />
    </div>
  );
}
