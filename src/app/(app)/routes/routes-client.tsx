"use client";

import * as React from "react";
import { Phone } from "lucide-react";
import { formatDate, formatMoney } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ExportButton } from "@/components/data/export-button";

export interface RouteRow {
  route: string;
  totalTrips: number;
  tripsThisMonth: number;
  tripsLastMonth: number;
  lastTripDate: string;
  daysSince: number;
  avgFreight: number;
  status: "ALIVE" | "COOLING" | "SLEEPING" | "OCCASIONAL";
  topParties: { name: string; mobile: string | null; trips: number }[];
}

const STATUS_META: Record<RouteRow["status"], { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  ALIVE: { label: "🟢 Zinda", variant: "default" },
  COOLING: { label: "🟠 Thanda", variant: "secondary" },
  SLEEPING: { label: "🔴 Sota hua", variant: "destructive" },
  OCCASIONAL: { label: "Occasional", variant: "outline" },
};

function Trend({ now, prev }: { now: number; prev: number }) {
  if (now > prev) return <span className="font-bold text-emerald-600">▲ {now - prev}</span>;
  if (now < prev) return <span className="font-bold text-red-600">▼ {prev - now}</span>;
  return <span className="text-muted-foreground">—</span>;
}

export function RoutesClient({ rows }: { rows: RouteRow[] }) {
  const [status, setStatus] = React.useState<"ALL" | RouteRow["status"]>("ALL");
  const [q, setQ] = React.useState("");
  const [partiesFor, setPartiesFor] = React.useState<RouteRow | null>(null);

  const list = rows.filter((r) => {
    if (status !== "ALL" && r.status !== status) return false;
    if (q && !r.route.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  const counts = {
    ALIVE: rows.filter((r) => r.status === "ALIVE").length,
    COOLING: rows.filter((r) => r.status === "COOLING").length,
    SLEEPING: rows.filter((r) => r.status === "SLEEPING").length,
    OCCASIONAL: rows.filter((r) => r.status === "OCCASIONAL").length,
  };

  return (
    <div className="space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="page-title">Route Heartbeat</h1>
          <p className="text-sm text-muted-foreground">
            Kaun sa lane zinda hai, kaun sota — aakhri trip ke din se. Sote route par click
            karke us lane ke top parties ko turant call karo, business chhutne se pehle.
          </p>
        </div>
        <ExportButton
          rows={list}
          fileName="route-heartbeat"
          sheetName="Routes"
          columns={[
            { header: "Route", key: "route", width: 30 },
            { header: "Status", accessor: (r) => r.status },
            { header: "Trips (This Month)", key: "tripsThisMonth", numeric: true },
            { header: "Trips (Last Month)", key: "tripsLastMonth", numeric: true },
            { header: "Total Trips", key: "totalTrips", numeric: true },
            { header: "Last Trip", accessor: (r) => formatDate(r.lastTripDate) },
            { header: "Days Since", key: "daysSince", numeric: true },
            { header: "Avg Freight", key: "avgFreight", numeric: true },
          ]}
        />
      </div>

      {/* status chips */}
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["ALL", `All (${rows.length})`],
            ["SLEEPING", `🔴 Sote hue (${counts.SLEEPING})`],
            ["COOLING", `🟠 Thande (${counts.COOLING})`],
            ["ALIVE", `🟢 Zinda (${counts.ALIVE})`],
            ["OCCASIONAL", `Occasional (${counts.OCCASIONAL})`],
          ] as const
        ).map(([s, label]) => (
          <Button
            key={s}
            size="sm"
            variant={status === s ? "default" : "outline"}
            className="h-8"
            onClick={() => setStatus(s)}
          >
            {label}
          </Button>
        ))}
        <div className="w-56">
          <Input className="h-8" placeholder="Search route..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted/80 backdrop-blur">
            <tr>
              {["Route", "Status", "This Month", "Last Month", "Trend", "Total", "Last Trip", "Avg Freight", "Parties"].map((h) => (
                <th key={h} className="whitespace-nowrap px-2 py-1.5 text-left text-xs font-medium text-muted-foreground">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={9} className="h-20 text-center text-muted-foreground">
                  No routes yet — LR entries will build this automatically.
                </td>
              </tr>
            ) : (
              list.map((r) => (
                <tr key={r.route} className="border-t hover:bg-muted/40">
                  <td className="px-2 py-1.5 font-medium uppercase">{r.route}</td>
                  <td className="px-2 py-1.5">
                    <Badge variant={STATUS_META[r.status].variant}>{STATUS_META[r.status].label}</Badge>
                  </td>
                  <td className="px-2 py-1.5 text-center tabular-nums">{r.tripsThisMonth}</td>
                  <td className="px-2 py-1.5 text-center tabular-nums">{r.tripsLastMonth}</td>
                  <td className="px-2 py-1.5 text-center">
                    <Trend now={r.tripsThisMonth} prev={r.tripsLastMonth} />
                  </td>
                  <td className="px-2 py-1.5 text-center tabular-nums">{r.totalTrips}</td>
                  <td className="whitespace-nowrap px-2 py-1.5">
                    {formatDate(r.lastTripDate)}
                    <span className={`ml-1 text-xs ${r.daysSince > 20 ? "font-bold text-destructive" : "text-muted-foreground"}`}>
                      ({r.daysSince} din)
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatMoney(r.avgFreight)}</td>
                  <td className="px-2 py-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => setPartiesFor(r)}
                    >
                      Kise Call Karein ({r.topParties.length})
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* top parties of the lane, with call links */}
      <Dialog open={!!partiesFor} onOpenChange={(o) => !o && setPartiesFor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="uppercase">{partiesFor?.route}</DialogTitle>
            <DialogDescription>
              Is lane par sabse zyada maal dene wali parties — sota route jagane ke liye inhe
              call karo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            {partiesFor?.topParties.length === 0 && (
              <p className="text-sm text-muted-foreground">No party data on this lane.</p>
            )}
            {partiesFor?.topParties.map((p) => (
              <div key={p.name} className="flex items-center justify-between gap-2 rounded-md border p-2">
                <div>
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {p.trips} trip(s){p.mobile ? ` · ${p.mobile}` : " · no mobile in master"}
                  </div>
                </div>
                {p.mobile && (
                  <div className="flex gap-1">
                    <Button asChild variant="outline" size="sm" className="h-7 px-2 text-xs">
                      <a href={`tel:${p.mobile}`}>
                        <Phone className="h-3 w-3" /> Call
                      </a>
                    </Button>
                    <Button asChild variant="outline" size="sm" className="h-7 px-2 text-xs">
                      <a href={`https://wa.me/91${p.mobile.replace(/\D/g, "").slice(-10)}`} target="_blank" rel="noreferrer">
                        WhatsApp
                      </a>
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
