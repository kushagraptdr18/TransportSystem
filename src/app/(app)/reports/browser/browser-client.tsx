"use client";

import * as React from "react";
import Link from "next/link";
import { formatMoney } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MasterCombobox, type MasterOption } from "@/components/data/master-combobox";
import { fetchBrowse, type BrowseResult, type BrowseRow, type BrowseSrc } from "./actions";

/**
 * Month Browser client: month chips on top, filters, then ONE long list that
 * loads 100 rows at a time as the user scrolls (no pagination buttons). The
 * running balance of ledger sources is threaded through runningStart/End so
 * every page continues exactly where the previous one stopped.
 */

export interface MonthChip {
  value: string; // "ALL" | "yyyy-mm"
  label: string; // "ALL" | "APR 26"
}

export function BrowserClient({
  src,
  title,
  months,
  partyOptions,
  partyLabel,
  vehicleOptions,
  headOptions,
  requireParty,
}: {
  src: BrowseSrc;
  title: string;
  months: MonthChip[];
  partyOptions: MasterOption[];
  partyLabel: string;
  vehicleOptions: MasterOption[];
  /** COMMON: head name options */
  headOptions: string[];
  /** LEDGER: nothing loads until a ledger is picked */
  requireParty: boolean;
}) {
  const [month, setMonth] = React.useState<string>("ALL");
  const [q, setQ] = React.useState("");
  const [partyId, setPartyId] = React.useState<string | null>(null);
  const [vehicleId, setVehicleId] = React.useState<string | null>(null);
  const [head, setHead] = React.useState<string | null>(null);

  const [columns, setColumns] = React.useState<BrowseResult["columns"]>([]);
  const [rows, setRows] = React.useState<BrowseRow[]>([]);
  const [totals, setTotals] = React.useState<BrowseResult["totals"]>([]);
  const [nextCursor, setNextCursor] = React.useState<number | null>(null);
  const [running, setRunning] = React.useState<number | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // one token per filter change: stale in-flight responses are dropped
  const requestToken = React.useRef(0);

  const load = React.useCallback(
    async (cursor: number, runningStart: number | null, replace: boolean) => {
      if (requireParty && !partyId) {
        setRows([]);
        setTotals([]);
        setNextCursor(null);
        return;
      }
      const token = ++requestToken.current;
      setLoading(true);
      setError(null);
      try {
        const res = await fetchBrowse({
          src,
          month,
          q: q || null,
          partyId,
          vehicleId,
          head,
          cursor,
          runningStart,
        });
        if (token !== requestToken.current) return;
        setColumns(res.columns);
        setRows((prev) => (replace ? res.rows : [...prev, ...res.rows]));
        setTotals(res.totals);
        setNextCursor(res.nextCursor);
        setRunning(res.runningEnd ?? null);
      } catch {
        if (token === requestToken.current) setError("Failed to load — try again");
      } finally {
        if (token === requestToken.current) setLoading(false);
      }
    },
    [src, month, q, partyId, vehicleId, head, requireParty]
  );

  // reload from the top whenever a filter changes (debounced for typing)
  React.useEffect(() => {
    const t = setTimeout(() => void load(0, null, true), q ? 350 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  // infinite scroll sentinel
  const sentinelRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && nextCursor !== null && !loading) {
          void load(nextCursor, running, false);
        }
      },
      { rootMargin: "600px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [nextCursor, loading, load, running]);

  const cellText = (v: string | number | null, numeric?: boolean) =>
    v === null || v === "" ? "" : numeric && typeof v === "number" ? formatMoney(v) : String(v);

  return (
    <div className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="page-title">{title}</h1>
        <span className="text-xs text-muted-foreground">
          {rows.length} loaded{nextCursor !== null ? " — scroll for more" : rows.length ? " — end of list" : ""}
        </span>
      </div>

      {/* month chips */}
      <div className="flex flex-wrap gap-1">
        {months.map((m) => (
          <Button
            key={m.value}
            size="sm"
            variant={month === m.value ? "default" : "outline"}
            className="h-7 px-2.5 text-xs"
            onClick={() => setMonth(m.value)}
          >
            {m.label}
          </Button>
        ))}
      </div>

      {/* filters */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-56">
          <Input
            className="h-8"
            placeholder="Search ref / doc no..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        {partyOptions.length > 0 && (
          <div className="w-64">
            <MasterCombobox
              options={partyOptions}
              value={partyId}
              onChange={setPartyId}
              placeholder={partyLabel}
            />
          </div>
        )}
        {vehicleOptions.length > 0 && (
          <div className="w-44">
            <MasterCombobox
              options={vehicleOptions}
              value={vehicleId}
              onChange={setVehicleId}
              placeholder="Vehicle..."
            />
          </div>
        )}
        {headOptions.length > 0 && (
          <div className="w-56">
            <MasterCombobox
              options={headOptions.map((h) => ({ value: h, label: h }))}
              value={head}
              onChange={setHead}
              placeholder="Ledger head..."
            />
          </div>
        )}
        {(q || partyId || vehicleId || head) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8"
            onClick={() => {
              setQ("");
              setPartyId(null);
              setVehicleId(null);
              setHead(null);
            }}
          >
            Clear
          </Button>
        )}
      </div>

      {/* sticky totals of the FILTERED set (not just loaded rows) */}
      {totals.length > 0 && (
        <div className="sticky top-0 z-20 flex flex-wrap gap-2 rounded-md border bg-background/95 p-2 shadow-sm backdrop-blur">
          {totals.map((t) => (
            <div key={t.label} className="rounded bg-muted/60 px-2 py-1 text-xs">
              <span className="text-muted-foreground">{t.label}: </span>
              <b className="tabular-nums">
                {t.label.toLowerCase().includes("wt")
                  ? t.value.toFixed(3)
                  : Number.isInteger(t.value) && t.value < 100000 && /s$|ies$|ans$/i.test(t.label)
                    ? t.value
                    : formatMoney(t.value)}
              </b>
            </div>
          ))}
        </div>
      )}

      {requireParty && !partyId ? (
        <div className="rounded-md border p-10 text-center text-sm text-muted-foreground">
          Select a ledger above to load its month-wise detail.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/80 backdrop-blur">
              <tr>
                {columns.map((c) => (
                  <th
                    key={c.label}
                    className={`whitespace-nowrap px-2 py-1.5 text-xs font-medium text-muted-foreground ${c.numeric ? "text-right" : "text-left"}`}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !loading ? (
                <tr>
                  <td colSpan={Math.max(columns.length, 1)} className="h-20 text-center text-muted-foreground">
                    {error ?? "No records for this selection."}
                  </td>
                </tr>
              ) : (
                rows.map((r, ri) => (
                  <tr key={`${r.id}-${ri}`} className="border-t hover:bg-muted/40">
                    {r.cells.map((v, i) => (
                      <td
                        key={i}
                        className={`whitespace-nowrap px-2 py-1 ${columns[i]?.numeric ? "text-right tabular-nums" : ""}`}
                      >
                        {i === 0 && r.href ? (
                          <Link href={r.href} className="font-medium text-primary hover:underline">
                            {cellText(v, columns[i]?.numeric)}
                          </Link>
                        ) : (
                          cellText(v, columns[i]?.numeric)
                        )}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {/* sentinel: when this comes into view the next page loads */}
          <div ref={sentinelRef} />
          {loading && (
            <div className="p-3 text-center text-xs text-muted-foreground">Loading…</div>
          )}
        </div>
      )}
    </div>
  );
}
