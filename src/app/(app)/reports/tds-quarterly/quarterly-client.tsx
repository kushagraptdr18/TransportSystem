"use client";

import * as React from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ExportButton, type ExportColumn } from "@/components/data/export-button";
import { formatDate, formatMoney } from "@/lib/utils";
import { DIRECT_MODULES, QUARTERS, type QuarterlyData, type TdsDetailRow } from "./data";

interface Props {
  data: QuarterlyData;
  fyLabel: string;
  printHref: string;
}

type ExportRow = {
  party: string;
  pan: string;
  rate: string;
  q1Base: number;
  q1Tds: number;
  q2Base: number;
  q2Tds: number;
  q3Base: number;
  q3Tds: number;
  q4Base: number;
  q4Tds: number;
  totalBase: number;
  totalTds: number;
};

const EXPORT_COLUMNS: ExportColumn<ExportRow>[] = [
  { header: "Party", key: "party", width: 32 },
  { header: "PAN", key: "pan", width: 14 },
  { header: "TDS Rate", key: "rate" },
  { header: "Q1 Base Amount", key: "q1Base", numeric: true, width: 16 },
  { header: "Q1 TDS", key: "q1Tds", numeric: true },
  { header: "Q2 Base Amount", key: "q2Base", numeric: true, width: 16 },
  { header: "Q2 TDS", key: "q2Tds", numeric: true },
  { header: "Q3 Base Amount", key: "q3Base", numeric: true, width: 16 },
  { header: "Q3 TDS", key: "q3Tds", numeric: true },
  { header: "Q4 Base Amount", key: "q4Base", numeric: true, width: 16 },
  { header: "Q4 TDS", key: "q4Tds", numeric: true },
  { header: "Total Base Amount", key: "totalBase", numeric: true, width: 18 },
  { header: "Total TDS", key: "totalTds", numeric: true, width: 14 },
];

/** Flattens Party → Rate → Quarter into export rows, totals rows included. */
function exportRows(data: QuarterlyData): ExportRow[] {
  const out: ExportRow[] = [];
  const toRow = (
    party: string,
    pan: string,
    rate: string,
    cells: { base: number; tds: number }[],
    totalBase: number,
    totalTds: number
  ): ExportRow => ({
    party,
    pan,
    rate,
    q1Base: cells[0].base,
    q1Tds: cells[0].tds,
    q2Base: cells[1].base,
    q2Tds: cells[1].tds,
    q3Base: cells[2].base,
    q3Tds: cells[2].tds,
    q4Base: cells[3].base,
    q4Tds: cells[3].tds,
    totalBase,
    totalTds,
  });
  for (const p of data.parties) {
    for (const g of p.rates) {
      out.push(toRow(p.party, p.pan, g.label, g.cells, g.totalBase, g.totalTds));
    }
    if (p.rates.length > 1) {
      out.push(toRow(`${p.party} — Total`, p.pan, "", p.cells, p.totalBase, p.totalTds));
    }
  }
  out.push(toRow("GRAND TOTAL", "", "", data.grand.cells, data.grand.totalBase, data.grand.totalTds));
  return out;
}

export function TdsQuarterlyClient({ data, fyLabel, printHref }: Props) {
  const [detail, setDetail] = React.useState<{ title: string; rows: TdsDetailRow[] } | null>(null);

  const openDetail = (title: string, rows: TdsDetailRow[]) => {
    if (rows.length) setDetail({ title, rows });
  };

  const money = (n: number) => (Math.abs(n) > 0.009 ? formatMoney(n) : "-");
  const cellPair = (
    cells: { base: number; tds: number }[],
    qi: number,
    onClick?: () => void,
    clickable?: boolean,
    hideBase?: boolean
  ) => (
    <React.Fragment key={QUARTERS[qi]}>
      <TableCell className="text-right tabular-nums">
        {hideBase ? "-" : money(cells[qi].base)}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {clickable ? (
          <button
            type="button"
            onClick={onClick}
            className="underline decoration-dotted underline-offset-2 hover:text-primary"
            title="Show the transactions behind this figure"
          >
            {money(cells[qi].tds)}
          </button>
        ) : (
          money(cells[qi].tds)
        )}
      </TableCell>
    </React.Fragment>
  );

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center gap-2 space-y-0 pb-3">
        <CardTitle className="text-base">
          {data.parties.length} part{data.parties.length === 1 ? "y" : "ies"} — TDS deducted{" "}
          {formatMoney(data.grand.totalTds)} on base {formatMoney(data.grand.totalBase)}
          {fyLabel ? ` (FY ${fyLabel})` : ""}
        </CardTitle>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href={printHref} target="_blank" rel="noopener">
              <Printer className="h-4 w-4" />
              <span className="hidden sm:inline">Print / PDF</span>
            </a>
          </Button>
          <ExportButton
            rows={exportRows(data)}
            columns={EXPORT_COLUMNS}
            fileName="tds-quarterly-payable"
            sheetName="TDS Quarterly"
            label="Export Excel"
            summary={[
              { label: "Financial Year", value: fyLabel },
              { label: "Total TDS Base Amount", value: data.grand.totalBase },
              { label: "Total TDS", value: data.grand.totalTds },
            ]}
          />
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Party</TableHead>
              <TableHead>TDS Rate</TableHead>
              {QUARTERS.map((q) => (
                <React.Fragment key={q}>
                  <TableHead className="text-right">{q} Base</TableHead>
                  <TableHead className="text-right">{q} TDS</TableHead>
                </React.Fragment>
              ))}
              <TableHead className="text-right">Total Base</TableHead>
              <TableHead className="text-right">Total TDS</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.parties.length === 0 && (
              <TableRow>
                <TableCell colSpan={12} className="py-8 text-center text-muted-foreground">
                  No payable TDS transactions for the selected filters.
                </TableCell>
              </TableRow>
            )}
            {data.parties.map((p) => (
              <React.Fragment key={p.partyId ?? p.party}>
                {p.rates.map((g, gi) => (
                  <TableRow key={`${p.partyId ?? p.party}-${g.label}`}>
                    <TableCell className={gi === 0 ? "font-medium" : "text-muted-foreground"}>
                      {gi === 0 ? (
                        <>
                          {p.party}
                          {p.pan ? (
                            <span className="ml-2 text-xs text-muted-foreground">{p.pan}</span>
                          ) : null}
                        </>
                      ) : (
                        ""
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={g.direct ? "secondary" : "outline"}>{g.label}</Badge>
                    </TableCell>
                    {QUARTERS.map((q, qi) =>
                      cellPair(
                        g.cells,
                        qi,
                        () =>
                          openDetail(
                            `${p.party} — ${g.label} — ${q}`,
                            g.details[qi]
                          ),
                        g.details[qi].length > 0,
                        g.direct
                      )
                    )}
                    <TableCell className="text-right font-medium tabular-nums">
                      {g.direct ? "-" : money(g.totalBase)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      <button
                        type="button"
                        onClick={() =>
                          openDetail(`${p.party} — ${g.label} — full year`, g.details.flat())
                        }
                        className="underline decoration-dotted underline-offset-2 hover:text-primary"
                        title="Show the transactions behind this figure"
                      >
                        {money(g.totalTds)}
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
                {p.rates.length > 1 && (
                  <TableRow className="bg-muted/40 font-semibold">
                    <TableCell>{p.party} — Total</TableCell>
                    <TableCell />
                    {QUARTERS.map((_, qi) => cellPair(p.cells, qi))}
                    <TableCell className="text-right tabular-nums">{money(p.totalBase)}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(p.totalTds)}</TableCell>
                  </TableRow>
                )}
              </React.Fragment>
            ))}
            {data.parties.length > 0 && (
              <TableRow className="border-t-2 bg-muted/60 font-bold">
                <TableCell>GRAND TOTAL</TableCell>
                <TableCell />
                {QUARTERS.map((_, qi) => cellPair(data.grand.cells, qi))}
                <TableCell className="text-right tabular-nums">
                  {money(data.grand.totalBase)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {money(data.grand.totalTds)}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{detail?.title}</DialogTitle>
          </DialogHeader>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>S.No.</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Reference / Voucher No</TableHead>
                  <TableHead>Module</TableHead>
                  <TableHead>Section</TableHead>
                  <TableHead className="text-right">TDS Rate</TableHead>
                  <TableHead className="text-right">Base Amount</TableHead>
                  <TableHead className="text-right">TDS Amount</TableHead>
                  <TableHead>Quarter</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail?.rows.map((r, i) => (
                  <TableRow key={`${r.refNo}-${i}`}>
                    <TableCell>{i + 1}</TableCell>
                    <TableCell>{formatDate(r.date)}</TableCell>
                    <TableCell>{r.refNo}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{r.module}</Badge>
                    </TableCell>
                    <TableCell>{r.section || "-"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {DIRECT_MODULES.has(r.module) ? "—" : `${r.tdsPct}%`}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {DIRECT_MODULES.has(r.module) ? "—" : money(r.baseAmt)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{money(r.tdsAmt)}</TableCell>
                    <TableCell>{r.quarter}</TableCell>
                    <TableCell>
                      <Badge variant={r.status === "DEDUCTED" ? "default" : "secondary"}>
                        {r.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {detail && (
                  <TableRow className="font-semibold">
                    <TableCell colSpan={6}>Total ({detail.rows.length} transactions)</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {/* direct (voucher/journal) rows carry no reportable base —
                          the quarter cells exclude it, so this total must too */}
                      {money(
                        detail.rows.reduce(
                          (s, r) => s + (DIRECT_MODULES.has(r.module) ? 0 : r.baseAmt),
                          0
                        )
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money(detail.rows.reduce((s, r) => s + r.tdsAmt, 0))}
                    </TableCell>
                    <TableCell colSpan={2} />
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
