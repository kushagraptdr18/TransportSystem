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

/** One financial year's chip row for the in-report FY dropdown. */
export interface FyChips {
  fyId: string;
  label: string; // "2027-2028"
  months: MonthChip[];
}

export function BrowserClient({
  src,
  title,
  fyChips,
  defaultFy,
  partyOptions,
  partyLabel,
  vehicleOptions,
  headOptions,
  requireParty,
  hasObd,
}: {
  src: BrowseSrc;
  title: string;
  fyChips: FyChips[];
  defaultFy: string;
  partyOptions: MasterOption[];
  partyLabel: string;
  vehicleOptions: MasterOption[];
  /** COMMON: head name options */
  headOptions: string[];
  /** LEDGER: nothing loads until a ledger is picked */
  requireParty: boolean;
  /** LR: show the OBD No filter */
  hasObd?: boolean;
}) {
  // FY continuity: browse any year from right here — the dropdown swaps the
  // month-chip row and every fetch carries the chosen fyId
  const [fyId, setFyId] = React.useState<string>(
    fyChips.some((f) => f.fyId === defaultFy) ? defaultFy : fyChips[0]?.fyId ?? ""
  );
  const months = fyChips.find((f) => f.fyId === fyId)?.months ?? [{ value: "ALL", label: "ALL" }];
  const [month, setMonth] = React.useState<string>("ALL");
  const [q, setQ] = React.useState("");
  const [partyId, setPartyId] = React.useState<string | null>(null);
  const [vehicleId, setVehicleId] = React.useState<string | null>(null);
  const [head, setHead] = React.useState<string | null>(null);
  const [obd, setObd] = React.useState("");

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
          obd: obd || null,
          cursor,
          runningStart,
          fyId,
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
    [src, month, q, partyId, vehicleId, head, obd, requireParty, fyId]
  );

  // reload from the top whenever a filter changes (debounced for typing)
  React.useEffect(() => {
    const t = setTimeout(() => void load(0, null, true), q || obd ? 350 : 0);
    return () => clearTimeout(t);
  }, [load, q, obd]);

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

      {/* FY dropdown + month chips: pick any year, chips follow */}
      <div className="flex flex-wrap items-center gap-1">
        {fyChips.length > 1 && (
          <select
            aria-label="Financial year"
            className="mr-1 h-7 rounded-md border border-input bg-background px-1.5 text-xs font-medium"
            value={fyId}
            onChange={(e) => {
              setFyId(e.target.value);
              setMonth("ALL");
            }}
          >
            {fyChips.map((f) => (
              <option key={f.fyId} value={f.fyId}>
                FY {f.label}
              </option>
            ))}
          </select>
        )}
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
        {hasObd && (
          <div className="w-44">
            <Input
              className="h-8"
              placeholder="OBD No..."
              value={obd}
              onChange={(e) => setObd(e.target.value)}
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
        {(q || partyId || vehicleId || head || obd) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8"
            onClick={() => {
              setQ("");
              setPartyId(null);
              setVehicleId(null);
              setHead(null);
              setObd("");
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
