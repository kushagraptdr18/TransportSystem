"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/components/ui/use-toast";
import { ExportButton } from "@/components/data/export-button";
import { MasterCombobox, type MasterOption } from "@/components/data/master-combobox";
import { getLrForRateChange, type RateChangeLrRow } from "@/app/(app)/billing/actions";

interface RegisterRow extends RateChangeLrRow {
  sapRate: number | "";
  remarks: string;
}

/**
 * Rate Change Register — a read-only report builder: add any number of LRs,
 * enter the SAP rate per LR, then export to Excel. Nothing is written back to
 * the LR / Challan / Billing / Accounts modules.
 */
export function RateChangeClient({ lrOptions }: { lrOptions: MasterOption[] }) {
  const { toast } = useToast();
  const [rows, setRows] = React.useState<RegisterRow[]>([]);
  const [lrNoInput, setLrNoInput] = React.useState("");
  const [adding, setAdding] = React.useState(false);

  const addLr = async (picked?: string) => {
    const lrNo = (picked ?? lrNoInput).trim();
    if (!lrNo) return;
    if (rows.some((r) => r.lrNo.toLowerCase() === lrNo.toLowerCase())) {
      toast({
        variant: "destructive",
        title: `LR ${lrNo} is already in this report`,
        description: "Duplicate LR Numbers are not allowed in the same report.",
      });
      return;
    }
    setAdding(true);
    try {
      const res = await getLrForRateChange(lrNo);
      if (!res.ok) {
        toast({ variant: "destructive", title: res.error });
        return;
      }
      setRows((prev) => [
        ...prev,
        {
          ...res.row,
          sapRate: "",
          // auto-generated, editable
          remarks: res.row.dest ? `${res.row.dest} Freight Rate Applicable` : "",
        },
      ]);
      setLrNoInput("");
    } finally {
      setAdding(false);
    }
  };

  const update = (idx: number, patch: Partial<RegisterRow>) =>
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  const remove = (idx: number) => setRows((prev) => prev.filter((_, i) => i !== idx));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Rate Change Register</h1>
        <ExportButton
          rows={rows}
          fileName="rate-change-register"
          sheetName="Rate Change"
          columns={[
            { header: "Sr. No.", accessor: (r) => String(rows.indexOf(r) + 1) },
            { header: "LR No.", key: "lrNo" },
            { header: "Date", accessor: (r) => formatDate(r.date) },
            { header: "Reference No.", key: "refNo" },
            { header: "OBD No.", key: "obdNo" },
            { header: "Invoice No.", key: "invoiceNo" },
            { header: "Vehicle No.", key: "vehicle" },
            { header: "Loading From", key: "source" },
            { header: "Destination", key: "dest" },
            { header: "Party Name", key: "party" },
            { header: "ERP Rate", key: "erpRate", numeric: true },
            { header: "SAP Rate", accessor: (r) => (r.sapRate === "" ? "" : String(r.sapRate)), numeric: true },
            { header: "Remarks", key: "remarks" },
          ]}
        />
      </div>

      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm">
            Add LR — details auto-fetch from the LR Register (read-only report; no data is modified)
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2 p-4 pt-1">
          <div className="w-64">
            {/* select from existing LRs (type-ahead)... */}
            <MasterCombobox
              options={lrOptions.filter((o) => !rows.some((r) => r.lrNo === o.value))}
              value={null}
              onChange={(v) => {
                if (v) void addLr(v);
              }}
              placeholder="Select LR Number..."
            />
          </div>
          <span className="text-xs text-muted-foreground">or type it:</span>
          {/* ...or enter the LR number manually */}
          <Input
            className="h-9 max-w-[10rem]"
            placeholder="Enter LR Number..."
            value={lrNoInput}
            onChange={(e) => setLrNoInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void addLr();
              }
            }}
          />
          <Button type="button" onClick={() => void addLr()} disabled={adding || !lrNoInput.trim()}>
            <Plus className="h-4 w-4" /> {adding ? "Adding..." : "Add Row"}
          </Button>
          <span className="self-center text-sm text-muted-foreground">
            {rows.length} LR{rows.length === 1 ? "" : "s"} added — no limit
          </span>
        </CardContent>
      </Card>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {[
                "Sr.",
                "LR No.",
                "Date",
                "Reference No.",
                "OBD No.",
                "Invoice No.",
                "Vehicle No.",
                "Loading From",
                "Destination",
                "Party",
                "ERP Rate",
                "SAP Rate",
                "Remarks",
                "",
              ].map((h, i) => (
                <TableHead key={i} className="text-xs">
                  {h}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={14} className="text-center text-muted-foreground">
                  Enter an LR Number above and click Add Row.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r, i) => (
              <TableRow key={r.id}>
                <TableCell>{i + 1}</TableCell>
                <TableCell>{r.lrNo}</TableCell>
                <TableCell>{formatDate(r.date)}</TableCell>
                <TableCell>{r.refNo}</TableCell>
                <TableCell>{r.obdNo}</TableCell>
                <TableCell>{r.invoiceNo}</TableCell>
                <TableCell>{r.vehicle}</TableCell>
                <TableCell>{r.source}</TableCell>
                <TableCell>{r.dest}</TableCell>
                <TableCell>{r.party}</TableCell>
                <TableCell className="text-right tabular-nums">{r.erpRate}</TableCell>
                <TableCell>
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="any"
                    className="h-8 w-24 text-right tabular-nums"
                    value={r.sapRate === "" ? "" : String(r.sapRate)}
                    onChange={(e) =>
                      update(i, { sapRate: e.target.value === "" ? "" : Number(e.target.value) })
                    }
                  />
                </TableCell>
                <TableCell>
                  <Input
                    className="h-8 min-w-[220px]"
                    value={r.remarks}
                    onChange={(e) => update(i, { remarks: e.target.value })}
                  />
                </TableCell>
                <TableCell>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    onClick={() => remove(i)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
