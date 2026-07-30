import { requireSession } from "@/lib/session";
import { authorize } from "@/lib/authz";
import { FilterBar, type FilterDef } from "@/components/data/filter-bar";
import { SimpleReport } from "@/components/accounts/simple-report";
import { BOOK_COLUMNS, ledgerBookRows } from "../_lib/book";

export const dynamic = "force-dynamic";

export default async function LedgerSummaryPage({
  searchParams,
}: {
  searchParams: { date_from?: string; date_to?: string; party?: string; ref?: string };
}) {
  const session = requireSession();
  await authorize(session, "reports", "view");

  // "head:<id>" selects an income/expense account-head ledger
  const selected = searchParams.party ?? "";
  const headId = selected.startsWith("head:") ? selected.slice(5) : undefined;
  const partyId = headId ? undefined : selected || undefined;

  const { rows, parties, heads } = await ledgerBookRows({
    session,
    partyId,
    headId,
    refNo: searchParams.ref,
    dateFrom: searchParams.date_from,
    dateTo: searchParams.date_to,
  });

  const filters: FilterDef[] = [
    { type: "text", key: "ref", label: "Reference No (bill / invoice)..." },
    { type: "daterange", key: "date", label: "Date" },
    {
      type: "combobox",
      key: "party",
      label: "Party / Ledger",
      options: [
        ...parties.map((p) => ({ value: p.id, label: p.name })),
        ...heads.map((h) => ({
          value: `head:${h.id}`,
          label: `${h.name} (${h.kind === "INCOME" ? "Income" : h.kind === "EXPENSE" ? "Expense" : h.kind} Head)`,
        })),
      ],
    },
  ];

  return (
    <div className="space-y-4 p-4">
      <h1 className="page-title">Ledger Summary</h1>
      <FilterBar filters={filters} />
      <SimpleReport
        title={
          searchParams.ref
            ? `Reference-wise details for "${searchParams.ref}" — complete lifecycle across all ledgers, in date order`
            : selected
              ? "Opening balance included in running balance"
              : "Select a party or income/expense head to see its ledger with running balance — or search a Reference No to trace a bill end-to-end"
        }
        columns={BOOK_COLUMNS}
        rows={rows}
        fileName="ledger-summary"
        emptyMessage="No ledger entries in this period."
      />
    </div>
  );
}
