"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Eye } from "lucide-react";
import { formatDate, formatMoney } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DataTable, type DataTableColumnMeta } from "@/components/data/data-table";
import { ExportButton } from "@/components/data/export-button";
import { FilterBar } from "@/components/data/filter-bar";
import type { MasterOption } from "@/components/data/master-combobox";

export interface PnlTrip {
  id: string;
  tripNo: string;
  tripDate: string;
  driver: string;
  from: string;
  to: string;
  freight: number;
  approved: number; // company approved expenses grand total
  driverBalance: number;
  profit: number;
  approvedByCategory: { category: string; amount: number }[];
  legDiesel: number;
  legDriverAdvance: number;
  actualDriverAdvance: number; // from Driver Advance register (linked to trip)
  ureaQty: number;
  ureaAmount: number;
  ureaExpenseType: string;
  settlement: { prev: number; current: number; final: number; status: string } | null;
  vehicleExpenses: { date: string; head: string; voucherNo: string; amount: number }[];
}

export interface VehiclePnlRow {
  id: string;
  vehicle: string;
  ownership: string; // Own | Relative
  tripCount: number;
  freight: number;
  tripExpenses: number;
  vehicleExpenses: number;
  driverSalary: number;
  net: number;
  trips: PnlTrip[];
}

const signed = (n: number) =>
  n === 0 ? "0" : `${n > 0 ? "+" : "−"}${formatMoney(Math.abs(n))}`;

const catLabel = (c: string) =>
  c.split("_").map((w) => w.charAt(0) + w.slice(1).toLowerCase()).join(" ");

export function VehiclePnlClient({
  rows,
  vehicleOptions,
  driverOptions,
}: {
  rows: VehiclePnlRow[];
  vehicleOptions: MasterOption[];
  driverOptions: MasterOption[];
}) {
  const [vehicleOf, setVehicleOf] = React.useState<VehiclePnlRow | null>(null);
  const [tripOf, setTripOf] = React.useState<{ vehicle: VehiclePnlRow; trip: PnlTrip } | null>(null);

  const money = (
    key: keyof Pick<
      VehiclePnlRow,
      "freight" | "tripExpenses" | "vehicleExpenses" | "driverSalary" | "net"
    >,
    header: string
  ): ColumnDef<VehiclePnlRow> => ({
    accessorKey: key,
    header,
    cell: ({ row }) => (
      <span className={key === "net" ? (row.original.net >= 0 ? "font-semibold text-emerald-600" : "font-semibold text-destructive") : undefined}>
        {formatMoney(row.original[key])}
      </span>
    ),
    meta: {
      numeric: true,
      total: (rs) => formatMoney(rs.reduce((s, r) => s + r[key], 0)),
    } satisfies DataTableColumnMeta<VehiclePnlRow>,
  });

  const columns: ColumnDef<VehiclePnlRow>[] = [
    {
      accessorKey: "vehicle",
      header: "Vehicle No",
      cell: ({ row }) => (
        <button
          type="button"
          className="text-primary underline-offset-2 hover:underline"
          onClick={(e) => {
            e.stopPropagation();
            setVehicleOf(row.original);
          }}
        >
          {row.original.vehicle}
        </button>
      ),
    },
    {
      accessorKey: "ownership",
      header: "Ownership",
      cell: ({ row }) => <Badge variant="secondary">{row.original.ownership}</Badge>,
    },
    {
      accessorKey: "tripCount",
      header: "Trips",
      meta: { numeric: true } satisfies DataTableColumnMeta<VehiclePnlRow>,
    },
    money("freight", "Trip Freight"),
    money("tripExpenses", "Trip Expenses"),
    money("vehicleExpenses", "Vehicle Expenses"),
    money("driverSalary", "Driver Salary"),
    money("net", "Net Profit / Loss"),
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Vehicle Profit &amp; Loss</h1>
        <ExportButton
          rows={rows}
          fileName="vehicle-pnl"
          sheetName="Vehicle P&L"
          columns={[
            { header: "Vehicle No", key: "vehicle" },
            { header: "Ownership", key: "ownership" },
            { header: "Trips", key: "tripCount", numeric: true },
            { header: "Trip Freight", key: "freight", numeric: true },
            { header: "Trip Expenses", key: "tripExpenses", numeric: true },
            { header: "Vehicle Expenses", key: "vehicleExpenses", numeric: true },
            { header: "Driver Salary", key: "driverSalary", numeric: true },
            { header: "Net Profit / Loss", key: "net", numeric: true },
          ]}
        />
      </div>
      <p className="text-sm text-muted-foreground">
        Own &amp; Relative vehicles only. P&amp;L = Trip Freight − Company Approved Trip Expenses −
        Vehicle Expenses (Diesel &amp; Toll excluded — already in trips) − Booked Driver Salary
        (payment status never matters). Click a vehicle number to drill into its trips.
      </p>
      <FilterBar
        filters={[
          { type: "daterange", key: "date", label: "Trip Date" },
          { type: "combobox", key: "vehicle", label: "Vehicle", options: vehicleOptions },
          {
            type: "select",
            key: "ownership",
            label: "Ownership",
            options: [
              { value: "OWNER", label: "Own" },
              { value: "RELATIVE", label: "Relative" },
            ],
          },
          { type: "combobox", key: "driver", label: "Driver", options: driverOptions },
        ]}
      />
      <DataTable
        columns={columns}
        data={rows}
        emptyMessage="No own / relative vehicle activity in this period."
        onRowClick={(r) => setVehicleOf(r)}
      />

      {/* -------- vehicle drill-down: trips -------- */}
      <Dialog open={!!vehicleOf} onOpenChange={(o) => !o && setVehicleOf(null)}>
        <DialogContent className="max-h-[95vh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>
              {vehicleOf?.vehicle} ({vehicleOf?.ownership}) — {vehicleOf?.tripCount} trip
              {vehicleOf?.tripCount === 1 ? "" : "s"}
            </DialogTitle>
            <DialogDescription>
              Net P&amp;L {formatMoney(vehicleOf?.net ?? 0)} = Freight{" "}
              {formatMoney(vehicleOf?.freight ?? 0)} − Trip Exp{" "}
              {formatMoney(vehicleOf?.tripExpenses ?? 0)} − Vehicle Exp{" "}
              {formatMoney(vehicleOf?.vehicleExpenses ?? 0)} − Booked Salary{" "}
              {formatMoney(vehicleOf?.driverSalary ?? 0)}
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  {[
                    "Trip Ref",
                    "Date",
                    "Driver",
                    "From",
                    "To",
                    "Freight",
                    "Approved Exp",
                    "Driver +/-",
                    "Trip P/L",
                    "",
                  ].map((h) => (
                    <th key={h} className="border px-1.5 py-1 text-left font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {vehicleOf?.trips.map((t) => (
                  <tr key={t.id}>
                    <td className="border px-1.5 py-1">{t.tripNo}</td>
                    <td className="border px-1.5 py-1">{formatDate(t.tripDate)}</td>
                    <td className="border px-1.5 py-1">{t.driver}</td>
                    <td className="border px-1.5 py-1">{t.from}</td>
                    <td className="border px-1.5 py-1">{t.to}</td>
                    <td className="border px-1.5 py-1 text-right">{formatMoney(t.freight)}</td>
                    <td className="border px-1.5 py-1 text-right">{formatMoney(t.approved)}</td>
                    <td className="border px-1.5 py-1 text-right">{signed(t.driverBalance)}</td>
                    <td
                      className={`border px-1.5 py-1 text-right font-medium ${t.profit >= 0 ? "text-emerald-600" : "text-destructive"}`}
                    >
                      {formatMoney(t.profit)}
                    </td>
                    <td className="border px-1 py-0.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => setTripOf({ vehicle: vehicleOf, trip: t })}
                      >
                        <Eye className="h-3 w-3" /> View Details
                      </Button>
                    </td>
                  </tr>
                ))}
                {!vehicleOf?.trips.length && (
                  <tr>
                    <td colSpan={10} className="border px-1.5 py-2 text-center text-muted-foreground">
                      No trips in this period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVehicleOf(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* -------- trip detail -------- */}
      <Dialog open={!!tripOf} onOpenChange={(o) => !o && setTripOf(null)}>
        <DialogContent className="max-h-[95vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              Trip {tripOf?.trip.tripNo} — {tripOf?.vehicle.vehicle}
            </DialogTitle>
            <DialogDescription>
              {formatDate(tripOf?.trip.tripDate ?? new Date().toISOString())} ·{" "}
              {tripOf?.trip.driver || "no driver"} · {tripOf?.trip.from} → {tripOf?.trip.to}
            </DialogDescription>
          </DialogHeader>

          {tripOf && (
            <div className="space-y-3 text-sm">
              {/* company approved expenses */}
              <div className="rounded-md border p-2">
                <div className="mb-1 font-semibold">Company Approved Expenses</div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-xs sm:grid-cols-3">
                  {tripOf.trip.approvedByCategory.map((c) => (
                    <div key={c.category} className="flex justify-between">
                      <span>{catLabel(c.category)}</span>
                      <span className="tabular-nums">{formatMoney(c.amount)}</span>
                    </div>
                  ))}
                  {tripOf.trip.legDriverAdvance > 0 && (
                    <div className="flex justify-between">
                      <span>Driver Advance (legs)</span>
                      <span className="tabular-nums">{formatMoney(tripOf.trip.legDriverAdvance)}</span>
                    </div>
                  )}
                </div>
                <div className="mt-1 flex justify-between border-t pt-1 font-semibold">
                  <span>Grand Total</span>
                  <span className="tabular-nums">{formatMoney(tripOf.trip.approved)}</span>
                </div>
              </div>

              {/* actual driver expenses */}
              <div className="rounded-md border p-2">
                <div className="mb-1 font-semibold">Actual Driver Expenses</div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-xs sm:grid-cols-3">
                  <div className="flex justify-between">
                    <span>Driver Advance (register)</span>
                    <span className="tabular-nums">{formatMoney(tripOf.trip.actualDriverAdvance)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>
                      Urea {tripOf.trip.ureaQty ? `(${tripOf.trip.ureaQty} L)` : ""}
                      {tripOf.trip.ureaExpenseType === "DRIVER" ? "" : " — company"}
                    </span>
                    <span className="tabular-nums">
                      {tripOf.trip.ureaExpenseType === "DRIVER"
                        ? formatMoney(tripOf.trip.ureaAmount)
                        : "—"}
                    </span>
                  </div>
                </div>
                <div className="mt-1 flex justify-between border-t pt-1 font-semibold">
                  <span>Total Actual Driver Expenses</span>
                  <span className="tabular-nums">
                    {formatMoney(
                      tripOf.trip.actualDriverAdvance +
                        (tripOf.trip.ureaExpenseType === "DRIVER" ? tripOf.trip.ureaAmount : 0)
                    )}
                  </span>
                </div>
              </div>

              {/* driver settlement */}
              <div className="rounded-md border p-2">
                <div className="mb-1 font-semibold">Driver Settlement</div>
                {tripOf.trip.settlement ? (
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      Previous Balance:{" "}
                      <b className="tabular-nums">{signed(tripOf.trip.settlement.prev)}</b>
                    </div>
                    <div>
                      Current Trip Balance:{" "}
                      <b className="tabular-nums">{signed(tripOf.trip.settlement.current)}</b>
                    </div>
                    <div>
                      Final Balance:{" "}
                      <b className="tabular-nums">{signed(tripOf.trip.settlement.final)}</b>{" "}
                      <Badge variant={tripOf.trip.settlement.status === "PENDING" ? "outline" : "default"}>
                        {tripOf.trip.settlement.status === "PENDING" ? "PENDING" : "ADJUSTED"}
                      </Badge>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">No driver balance on this trip.</div>
                )}
              </div>

              {/* vehicle expenses (non diesel/toll, trip period) */}
              <div className="rounded-md border p-2">
                <div className="mb-1 font-semibold">
                  Vehicle Expenses in Trip Period (Diesel &amp; Toll excluded)
                </div>
                {tripOf.trip.vehicleExpenses.length ? (
                  <table className="w-full border-collapse text-xs">
                    <tbody>
                      {tripOf.trip.vehicleExpenses.map((e, i) => (
                        <tr key={i}>
                          <td className="border px-1.5 py-0.5">{formatDate(e.date)}</td>
                          <td className="border px-1.5 py-0.5">{e.head}</td>
                          <td className="border px-1.5 py-0.5">{e.voucherNo}</td>
                          <td className="border px-1.5 py-0.5 text-right">{formatMoney(e.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="text-xs text-muted-foreground">None booked in this period.</div>
                )}
              </div>

              {/* final trip P&L */}
              <div className="rounded-md bg-muted/50 p-2">
                <div className="flex justify-between text-xs">
                  <span>Trip Freight</span>
                  <span className="tabular-nums">{formatMoney(tripOf.trip.freight)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span>Trip Expenses (approved)</span>
                  <span className="tabular-nums">− {formatMoney(tripOf.trip.approved)}</span>
                </div>
                <div
                  className={`mt-1 flex justify-between border-t pt-1 font-semibold ${tripOf.trip.profit >= 0 ? "text-emerald-600" : "text-destructive"}`}
                >
                  <span>Trip Net Profit / Loss</span>
                  <span className="tabular-nums">{formatMoney(tripOf.trip.profit)}</span>
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  Vehicle expenses and booked driver salary are deducted at vehicle level (see the
                  main report row) so nothing is double-counted.
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" asChild>
              <a href={`/print/trip/${tripOf?.trip.id}`} target="_blank" rel="noreferrer">
                Print Trip Sheet
              </a>
            </Button>
            <Button size="sm" asChild>
              <a href={`/trips?id=${tripOf?.trip.id}`} target="_blank" rel="noreferrer">
                Open Full Trip Sheet
              </a>
            </Button>
            <Button variant="outline" onClick={() => setTripOf(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
