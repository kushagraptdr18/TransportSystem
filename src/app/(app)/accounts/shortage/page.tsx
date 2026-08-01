import { requireSession } from "@/lib/session";
import { authorize } from "@/lib/authz";
import { withTenant } from "@/lib/db";
import { formatMoney, toNum } from "@/lib/utils";
import { FilterBar, type FilterDef } from "@/components/data/filter-bar";
import { SimpleReport, type ReportRow } from "@/components/accounts/simple-report";

export const dynamic = "force-dynamic";

/**
 * Shortage ledger — one account for every shortage in the system.
 *
 * Shortage recorded as an expense is a DEBIT, shortage recovered is a CREDIT,
 * and the running balance is what the company is still carrying. Nothing else
 * is shown: just the date, who it was recorded against or recovered from, and
 * the two money columns.
 */
export default async function ShortageLedgerPage({
  searchParams,
}: {
  searchParams: { party?: string; date_from?: string; date_to?: string };
}) {
  const session = requireSession();
  await authorize(session, "reports", "view");

  const { entries, recoveries, parties, drivers } = await withTenant(
    session.tenantId,
    async (tx) => {
      const scope = { firmId: session.firmId, fyId: session.fyId, deletedAt: null };
      const [entries, parties, drivers] = await Promise.all([
        tx.shortageEntry.findMany({
          // auto-raised rows only absorb an unmatched recovery — they are not
          // an expense, so they never appear on the debit side
          where: { ...scope, autoRaised: false },
          orderBy: { date: "asc" },
        }),
        tx.party.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
        tx.driver.findMany({ where: { firmId: session.firmId, deletedAt: null } }),
      ]);
      const recoveries = await tx.shortageRecovery.findMany({
        where: { shortage: { firmId: session.firmId, fyId: session.fyId, deletedAt: null } },
        orderBy: { date: "asc" },
      });
      return { entries, recoveries, parties, drivers };
    }
  );

  const partyName = new Map(parties.map((p) => [p.id, p.name]));
  const driverName = new Map(drivers.map((d) => [d.id, `${d.name} (${d.driverCode})`]));
  const nameOf = (partyId: string | null, driverId: string | null) =>
    (driverId ? driverName.get(driverId) : null) ??
    (partyId ? partyName.get(partyId) : null) ??
    "";

  type Line = { date: Date; party: string; partyId: string | null; debit: number; credit: number };
  const lines: Line[] = [
    // recorded as an expense — the company carries it
    ...entries.map((e) => ({
      date: e.date,
      party: nameOf(e.partyId, e.driverId),
      partyId: e.partyId,
      debit: toNum(String(e.amount)),
      credit: 0,
    })),
    // recovered — from whoever actually paid it back
    ...recoveries.map((r) => ({
      date: r.date,
      party: nameOf(r.partyId, r.driverId),
      partyId: r.partyId,
      debit: 0,
      credit: toNum(String(r.amount)),
    })),
  ];

  const from = searchParams.date_from ? new Date(searchParams.date_from + "T00:00:00") : null;
  const to = searchParams.date_to ? new Date(searchParams.date_to + "T23:59:59") : null;
  const filtered = lines
    .filter((l) => !searchParams.party || l.partyId === searchParams.party)
    .filter((l) => (!from || l.date >= from) && (!to || l.date <= to))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  let running = 0;
  const rows: ReportRow[] = filtered.map((l) => {
    running = Math.round((running + l.debit - l.credit) * 100) / 100;
    return {
      date: l.date.toISOString(),
      party: l.party,
      debit: l.debit || "",
      credit: l.credit || "",
      balance: `${Math.abs(running).toLocaleString("en-IN")} ${running >= 0 ? "Dr" : "Cr"}`,
    };
  });

  const totalDebit = filtered.reduce((s, l) => s + l.debit, 0);
  const totalCredit = filtered.reduce((s, l) => s + l.credit, 0);

  const filters: FilterDef[] = [
    {
      type: "combobox",
      key: "party",
      label: "Party",
      options: parties.map((p) => ({ value: p.id, label: p.name })),
    },
    { type: "daterange", key: "date", label: "Date" },
  ];

  return (
    <div className="space-y-4 p-4">
      <div className="space-y-0.5">
        <h1 className="page-title">Shortage Ledger</h1>
        <p className="text-sm text-muted-foreground">
          Shortage recorded as an expense is a debit, shortage recovered is a credit. The closing
          balance is what the company is still carrying.
        </p>
      </div>
      <FilterBar filters={filters} />
      <div className="grid gap-2 sm:grid-cols-3">
        <Tile label="Shortage Expense (Dr)" value={totalDebit} />
        <Tile label="Shortage Recovered (Cr)" value={totalCredit} />
        <Tile label="Closing Balance" value={Math.abs(totalDebit - totalCredit)} suffix={totalDebit - totalCredit >= 0 ? "Dr" : "Cr"} />
      </div>
      <SimpleReport
        title={`${rows.length} entr${rows.length === 1 ? "y" : "ies"}`}
        columns={[
          { key: "date", header: "Date", kind: "date" },
          { key: "party", header: "Party" },
          { key: "debit", header: "Debit", kind: "money" },
          { key: "credit", header: "Credit", kind: "money" },
          { key: "balance", header: "Balance" },
        ]}
        rows={rows}
        fileName="shortage-ledger"
        emptyMessage="No shortage recorded yet."
      />
    </div>
  );
}

function Tile({ label, value, suffix }: { label: string; value: number; suffix?: string }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums">
        {formatMoney(value)}
        {suffix ? ` ${suffix}` : ""}
      </div>
    </div>
  );
}
