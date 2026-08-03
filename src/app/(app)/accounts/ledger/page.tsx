import { requireSession } from "@/lib/session";
import { authorize } from "@/lib/authz";
import { FilterBar, type FilterDef } from "@/components/data/filter-bar";
import { SimpleReport } from "@/components/accounts/simple-report";
import { BOOK_COLUMNS, ledgerBookRows } from "../_lib/book";

export const dynamic = "force-dynamic";

/**
 * Ledger Summary — Tally-style ledger view.
 * Global ledger search (name / alias / trade name / group), full filter set
 * (reference, type, narration, side, vehicle, amount range, dates), running
 * balance with opening, counter-account column, and per-row drill-down to the
 * source document. Every module posts through the one LedgerEntry table, so
 * this screen is the single standardized ledger for the whole ERP.
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
  const num = (s?: string) => {
    const v = Number(s);
    return s && !isNaN(v) ? v : undefined;
  };

  const { rows, parties, heads, vehicles, refTypes } = await ledgerBookRows({
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

  const filters: FilterDef[] = [
    { type: "combobox", key: "party", label: "Search Ledger (name / alias / group)", options: ledgerOptions },
    { type: "daterange", key: "date", label: "Date" },
    { type: "text", key: "ref", label: "Reference No..." },
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

  return (
    <div className="space-y-4 p-4">
      <h1 className="page-title">Ledger Summary</h1>
      <p className="text-sm text-muted-foreground">
        Search any ledger by name, alias, trade name or group and open it instantly. The
        Account column shows the counter-ledger of each posting; click a Reference No to open
        the source document. Excel export and printing follow the applied filters.
      </p>
      <FilterBar filters={filters} />
      <SimpleReport
        title={
          searchParams.ref
            ? `Reference-wise details for "${searchParams.ref}" — complete lifecycle across all ledgers, in date order`
            : selected
              ? contentFiltered
                ? "Filtered view — running balance is hidden because these rows are a subset of the ledger"
                : "Opening balance included in running balance"
              : "Select a ledger to see its book with running balance — or search a Reference No to trace a document end-to-end"
        }
        columns={BOOK_COLUMNS}
        rows={rows}
        fileName="ledger-summary"
        emptyMessage="No ledger entries match these filters."
      />
    </div>
  );
}
