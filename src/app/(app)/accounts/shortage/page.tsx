import type { Prisma } from "@prisma/client";
import { requireSession } from "@/lib/session";
import { authorize } from "@/lib/authz";
import { withTenant } from "@/lib/db";
import { formatDate, formatMoney, toNum } from "@/lib/utils";
import { shortageStatus } from "@/lib/shortage";
import { FilterBar, type FilterDef } from "@/components/data/filter-bar";
import { SimpleReport, type ReportRow } from "@/components/accounts/simple-report";

export const dynamic = "force-dynamic";

/**
 * Shortage Settlement Report — every shortage in the system, whatever module
 * raised it, with what has been recovered against it and from whom.
 * Backed by the shortage register, so this and the single "Shortage" ledger
 * head are always two views of the same numbers.
 */
export default async function ShortageReportPage({
  searchParams,
}: {
  searchParams: {
    module?: string;
    status?: string;
    party?: string;
    date_from?: string;
    date_to?: string;
  };
}) {
  const session = requireSession();
  await authorize(session, "reports", "view");

  const { entries, parties, drivers } = await withTenant(session.tenantId, async (tx) => {
    const where: Prisma.ShortageEntryWhereInput = {
      firmId: session.firmId,
      fyId: session.fyId,
      deletedAt: null,
    };
    if (searchParams.module) where.module = searchParams.module;
    if (searchParams.party) where.partyId = searchParams.party;
    if (searchParams.date_from || searchParams.date_to) {
      where.date = {
        ...(searchParams.date_from ? { gte: new Date(searchParams.date_from + "T00:00:00") } : {}),
        ...(searchParams.date_to ? { lte: new Date(searchParams.date_to + "T23:59:59") } : {}),
      };
    }
    const [entries, parties, drivers] = await Promise.all([
      tx.shortageEntry.findMany({
        where,
        include: { recoveries: { orderBy: { date: "asc" } } },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      }),
      tx.party.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
      tx.driver.findMany({ where: { firmId: session.firmId, deletedAt: null } }),
    ]);
    return { entries, parties, drivers };
  });

  const partyName = new Map(parties.map((p) => [p.id, p.name]));
  const driverName = new Map(drivers.map((d) => [d.id, `${d.name} (${d.driverCode})`]));

  let rows: ReportRow[] = entries.map((e) => {
    const amount = toNum(String(e.amount));
    const recovered = toNum(String(e.recoveredAmount));
    const pending = Math.round((amount - recovered) * 100) / 100;
    const last = e.recoveries[e.recoveries.length - 1];
    return {
      date: e.date.toISOString(),
      module: e.module.replace(/_/g, " "),
      refNo: e.refNo,
      party:
        (e.driverId ? driverName.get(e.driverId) : null) ??
        (e.partyId ? partyName.get(e.partyId) : null) ??
        "",
      partyKind: e.partyKind,
      amount,
      recovered,
      pending,
      // who it came back from, and when — the audit trail in one cell
      recoverySource: e.recoveries.length
        ? Array.from(
            e.recoveries.reduce((m, r) => {
              m.set(r.source, (m.get(r.source) ?? 0) + toNum(String(r.amount)));
              return m;
            }, new Map<string, number>())
          )
            .map(([src, amt]) => `${src.toLowerCase()} ${formatMoney(amt)}`)
            .join(", ")
        : "",
      recoveryDate: last ? formatDate(last.date.toISOString()) : "",
      status: shortageStatus(amount, recovered),
      remarks: e.remarks ?? "",
    };
  });

  if (searchParams.status) rows = rows.filter((r) => r.status === searchParams.status);

  const sum = (k: string) => rows.reduce((s, r) => s + Number(r[k] ?? 0), 0);
  const totals = {
    created: sum("amount"),
    recovered: sum("recovered"),
    pending: sum("pending"),
  };

  const filters: FilterDef[] = [
    {
      type: "select",
      key: "module",
      label: "Module",
      options: [
        { value: "CHALAN", label: "Chalan" },
        { value: "BROKER_SLIP", label: "Broker Slip" },
        { value: "DRIVER", label: "Driver" },
        { value: "VOUCHER", label: "Voucher" },
        { value: "MANUAL", label: "Manual" },
      ],
    },
    {
      type: "select",
      key: "status",
      label: "Status",
      options: [
        { value: "OPEN", label: "Open" },
        { value: "PARTLY RECOVERED", label: "Partly Recovered" },
        { value: "RECOVERED", label: "Recovered" },
      ],
    },
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
        <h1 className="page-title">Shortage Settlement Report</h1>
        <p className="text-sm text-muted-foreground">
          Every shortage in the system, from any module, with what has been recovered and from whom.
          The single &ldquo;Shortage&rdquo; ledger head carries the same balance.
        </p>
      </div>
      <FilterBar filters={filters} />
      <div className="grid gap-2 sm:grid-cols-3">
        <Tile label="Total Shortage Created" value={totals.created} />
        <Tile label="Total Shortage Recovered" value={totals.recovered} />
        <Tile label="Total Pending Recovery" value={totals.pending} />
      </div>
      <SimpleReport
        title={`${rows.length} shortage${rows.length === 1 ? "" : "s"}`}
        columns={[
          { key: "date", header: "Date", kind: "date" },
          { key: "module", header: "Module" },
          { key: "refNo", header: "Reference No" },
          { key: "party", header: "Party / Driver / Owner / Broker" },
          { key: "partyKind", header: "Answerable", kind: "badge" },
          { key: "amount", header: "Original Shortage", kind: "money" },
          { key: "recovered", header: "Amount Recovered", kind: "money" },
          { key: "pending", header: "Pending Recovery", kind: "money" },
          { key: "recoverySource", header: "Recovery Source" },
          { key: "recoveryDate", header: "Recovery Date" },
          { key: "status", header: "Status", kind: "badge" },
          { key: "remarks", header: "Remarks" },
        ]}
        rows={rows}
        fileName="shortage-settlement"
        emptyMessage="No shortage recorded yet."
      />
    </div>
  );
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{formatMoney(value)}</div>
    </div>
  );
}
