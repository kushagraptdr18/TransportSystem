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
import { getLrForTripClosure, type TripClosureLrRow } from "@/app/(app)/billing/actions";

interface RegisterRow extends TripClosureLrRow {
  customerIn: string;
  smartTruckStatus: string;
  reason: string;
  carrierName: string;
  tripClosure: string;
}

/**
 * Trip Closure Intimation — a read-only report builder fetching from the LR
 * and POD registers. Only the manual columns are editable; nothing is written
 * back to LR / POD / Challan / Billing / Tracking / Accounts.
 */
export function TripClosureClient({ lrOptions }: { lrOptions: MasterOption[] }) {
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
      const res = await getLrForTripClosure(lrNo);
      if (!res.ok) {
        toast({ variant: "destructive", title: res.error });
        return;
      }
      setRows((prev) => [
        ...prev,
        {
          ...res.row,
          customerIn: "",
          // sensible default from the POD: delivered → At Delivery, else In Transit
          smartTruckStatus: res.row.deliveryDate ? "At Delivery" : "In Transit",
          reason: "Device Got Switch Off",
          carrierName: "SSBRL",
          tripClosure: "FALSE",
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
        <h1 className="text-xl font-semibold">Trip Closure Intimation</h1>
        <ExportButton
          rows={rows}
          fileName="trip-closure-intimation"
          sheetName="Trip Closure"
          columns={[
            { header: "Sl. No.", accessor: (r) => String(rows.indexOf(r) + 1) },
            { header: "LR No.", key: "lrNo" },
            { header: "From (Consignor)", key: "consignor" },
            { header: "Vehicle No.", key: "vehicle" },
            { header: "LR Date (Invoice Date)", accessor: (r) => formatDate(r.lrDate) },
            { header: "Customer In", key: "customerIn" },
            { header: "Delivery Date", accessor: (r) => (r.deliveryDate ? formatDate(r.deliveryDate) : "") },
            { header: "Customer (Consignee)", key: "consignee" },
            { header: "City (Destination)", key: "city" },
            { header: "OBD No.", key: "obdNo" },
            { header: "Smart Truck Status", key: "smartTruckStatus" },
            { header: "Reason for Trip Not Closed on Geofence", key: "reason" },
            { header: "Carrier Name", key: "carrierName" },
            { header: "Trip Closure", key: "tripClosure" },
          ]}
        />
      </div>

      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm">
            Add LR — details auto-fetch from the LR &amp; POD registers (read-only report; no data
            is modified)
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2 p-4 pt-1">
          <div className="w-64">
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

      {/* datalists for editable dropdown defaults */}
      <datalist id="smart-truck-status">
        <option value="At Delivery" />
        <option value="In Transit" />
      </datalist>
      <datalist id="trip-closure-options">
        <option value="FALSE" />
        <option value="TRUE" />
      </datalist>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {[
                "Sl.",
                "LR No.",
                "From (Consignor)",
                "Vehicle No.",
                "LR Date",
                "Customer In",
                "Delivery Date",
                "Customer (Consignee)",
                "City (Destination)",
                "OBD No.",
                "Smart Truck Status",
                "Reason (Geofence)",
                "Carrier",
                "Trip Closure",
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
                <TableCell colSpan={15} className="text-center text-muted-foreground">
                  Select or enter an LR Number above and click Add Row.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r, i) => (
              <TableRow key={r.id}>
                <TableCell>{i + 1}</TableCell>
                <TableCell>{r.lrNo}</TableCell>
                <TableCell>{r.consignor}</TableCell>
                <TableCell>{r.vehicle}</TableCell>
                <TableCell>{formatDate(r.lrDate)}</TableCell>
                <TableCell>
                  <Input
                    className="h-8 w-28"
                    placeholder="Reporting date"
                    value={r.customerIn}
                    onChange={(e) => update(i, { customerIn: e.target.value })}
                  />
                </TableCell>
                <TableCell>{r.deliveryDate ? formatDate(r.deliveryDate) : "—"}</TableCell>
                <TableCell>{r.consignee}</TableCell>
                <TableCell>{r.city}</TableCell>
                <TableCell>{r.obdNo}</TableCell>
                <TableCell>
                  <Input
                    className="h-8 w-32"
                    list="smart-truck-status"
                    value={r.smartTruckStatus}
                    onChange={(e) => update(i, { smartTruckStatus: e.target.value })}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    className="h-8 min-w-[180px]"
                    value={r.reason}
                    onChange={(e) => update(i, { reason: e.target.value })}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    className="h-8 w-24"
                    value={r.carrierName}
                    onChange={(e) => update(i, { carrierName: e.target.value })}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    className="h-8 w-24"
                    list="trip-closure-options"
                    value={r.tripClosure}
                    onChange={(e) => update(i, { tripClosure: e.target.value })}
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
