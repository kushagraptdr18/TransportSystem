import { Search } from "lucide-react";
import { requireSession } from "@/lib/session";
import { authorize } from "@/lib/authz";
import { FilterBar, type FilterDef } from "@/components/data/filter-bar";
import { SimpleReport } from "@/components/accounts/simple-report";
import { Card, CardContent } from "@/components/ui/card";
import { BOOK_COLUMNS, ledgerBookRows } from "../_lib/book";

export const dynamic = "force-dynamic";

/**
 * Ledger Summary — Tally-style, search-first.
 * Opening the page shows only the ledger search; selecting a ledger (party,
 * bank/cash or income/expense head) opens its book with running balance,
 * counter-account column and per-row drill-down. Every filter — including the
 * Ref No and Ref Type dropdowns — is scoped to the selected ledger only.
 * Searching a Reference No WITHOUT a ledger keeps its cross-ledger meaning:
 * the complete lifecycle of one document.
 */
export default async function LedgerSummaryPage({
  searchParams,
}: {
  searchParams: {
    date_from?: string;
    date_to?: string;
    party?: string;
    ref?: string;
    reftype?: string;
    narration?: string;
    side?: string;
    vehicle?: string;
    amt_from?: string;
    amt_to?: string;
  };
}) {
  const session = requireSession();
  await authorize(session, "reports", "view");

  // "head:<id>" selects an income/expense account-head ledger
  const selected = searchParams.party ?? "";
  const headId = selected.startsWith("head:") ? selected.slice(5) : undefined;
  const partyId = headId ? undefined : selected || undefined;
  const hasLedger = !!(partyId || headId);
  const tracingRef = !hasLedger && !!searchParams.ref;
  const num = (s?: string) => {
    const v = Number(s);
    return s && !isNaN(v) ? v : undefined;
  };

  const { rows, parties, heads, vehicles, refTypes, refNos } = await ledgerBookRows({
    session,
    partyId,
    headId,
    refNo: searchParams.ref,
    dateFrom: searchParams.date_from,
    dateTo: searchParams.date_to,
    refType: searchParams.reftype,
    narration: searchParams.narration,
    side:
      searchParams.side === "DEBIT" || searchParams.side === "CREDIT"
        ? searchParams.side
        : undefined,
    vehicleId: searchParams.vehicle,
    amtFrom: num(searchParams.amt_from),
    amtTo: num(searchParams.amt_to),
  });

  const groupLabel = (g: string) =>
    g.split("_").map((w) => w.charAt(0) + w.slice(1).toLowerCase()).join(" / ");
  // the combobox searches the label text, so name, alias, trade name and
  // group are all searchable from the one global box
  const ledgerOptions = [
    ...parties.map((p) => ({
      value: p.id,
      label: [p.name, p.alias && `(${p.alias})`, p.transportName && `[${p.transportName}]`]
        .filter(Boolean)
        .join(" ")
        .concat(` — ${groupLabel(p.ledgerGroup)}`),
    })),
    ...heads.map((h) => ({
      value: `head:${h.id}`,
      label: `${h.name} — ${h.kind === "INCOME" ? "Income" : h.kind === "EXPENSE" ? "Expense" : h.kind} Head`,
    })),
  ];
  const searchFilter: FilterDef = {
    type: "combobox",
    key: "party",
    label: "Search Ledger (name / alias / group)",
    options: ledgerOptions,
  };

  // ---------- first screen: search only ----------
  if (!hasLedger && !tracingRef) {
    return (
      <div className="space-y-4 p-4">
        <h1 className="page-title">Ledger Summary</h1>
        <Card className="mx-auto mt-10 max-w-2xl">
          <CardContent className="space-y-4 p-8 text-center">
            <div className="flex items-center justify-center gap-2 text-lg font-semibold">
              <Search className="h-5 w-5" /> Search Ledger
            </div>
            <p className="text-sm text-muted-foreground">
              Type a ledger name, alias, trade name or group — parties, banks, cash,
              income and expense heads are all here. Selecting one opens its complete
              ledger with running balance and drill-down.
            </p>
            <FilterBar
              filters={[
                searchFilter,
                { type: "text", key: "ref", label: "...or trace a Reference No across all ledgers" },
              ]}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  // ---------- ledger view (or cross-ledger reference trace) ----------
  const filters: FilterDef[] = [
    searchFilter,
    { type: "daterange", key: "date", label: "Date" },
    hasLedger
      ? {
          type: "combobox",
          key: "ref",
          label: "Ref No (this ledger only)",
          options: refNos.map((r) => ({ value: r, label: r })),
        }
      : { type: "text", key: "ref", label: "Reference No..." },
    {
      type: "select",
      key: "reftype",
      label: "Ref Type",
      options: refTypes.map((t) => ({ value: t, label: t.replace(/_/g, " ") })),
    },
    { type: "text", key: "narration", label: "Narration contains..." },
    {
      type: "select",
      key: "side",
      label: "Side",
      options: [
        { value: "DEBIT", label: "Debit only" },
        { value: "CREDIT", label: "Credit only" },
      ],
    },
    {
      type: "combobox",
      key: "vehicle",
      label: "Vehicle",
      options: vehicles.map((v) => ({ value: v.id, label: v.number })),
    },
    { type: "text", key: "amt_from", label: "Amount from..." },
    { type: "text", key: "amt_to", label: "Amount to..." },
  ];

  const contentFiltered = !!(
    searchParams.ref ||
    searchParams.reftype ||
    searchParams.narration ||
    searchParams.side ||
    searchParams.vehicle ||
    searchParams.amt_from ||
    searchParams.amt_to
  );
  const selectedLabel = hasLedger
    ? ledgerOptions.find((o) => o.value === selected)?.label ?? ""
    : "";

  return (
    <div className="space-y-4 p-4">
      <h1 className="page-title">
        Ledger Summary{selectedLabel ? ` — ${selectedLabel}` : ""}
      </h1>
      <p className="text-sm text-muted-foreground">
        {hasLedger
          ? "Every filter below — including the Ref No and Ref Type dropdowns — applies to this ledger only. The Account column shows the counter-ledger of each posting; click a Reference No to open the source document."
          : `Reference-wise trace of "${searchParams.ref}" — every ledger the document touched, in date order.`}
      </p>
      <FilterBar filters={filters} />
      <SimpleReport
        title={
          tracingRef
            ? `Reference-wise details for "${searchParams.ref}"`
            : contentFiltered
              ? "Filtered view — running balance is hidden because these rows are a subset of the ledger"
              : "Opening balance included in running balance"
        }
        columns={BOOK_COLUMNS}
        rows={rows}
        fileName="ledger-summary"
        emptyMessage="No ledger entries match these filters."
      />
    </div>
  );
}
