"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { DataTable } from "@/components/data/data-table";
import { FilterBar } from "@/components/data/filter-bar";
import { ExportButton } from "@/components/data/export-button";
import { formatDate, formatMoney } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { deleteChalan, getChalanStatus, type ChalanStatusData } from "../actions";

export interface ChalanRegisterRow {
  id: string;
  chalanNo: string;
  chalanDate: string;
  broker: string;
  vehicle: string;
  lrCount: number;
  freight: number;
  tdsAmt: number;
  commissionAmt: number;
  advanceTotal: number;
  balance: number;
  mamool: number;
  courierCharge: number;
  isFinal: boolean;
  podDone: number;
  /** shortage weight from the LRs' PODs (before balance payment) */
  shortageWt: number;
  /** shortage amount deducted at balance payment (after) */
  shortage: number;
  /** round-off applied at balance payment */
  roundOff: number;
  paymentStatus: string;
  balPaidAmount: number;
}

const sum = (rows: ChalanRegisterRow[], k: keyof ChalanRegisterRow) =>
  formatMoney(rows.reduce((s, r) => s + (r[k] as number), 0));

export function ChalanRegisterClient({
  rows,
  brokers,
  vehicles,
  vehicleTypes,
  canDelete,
}: {
  rows: ChalanRegisterRow[];
  brokers: { value: string; label: string }[];
  vehicles: { value: string; label: string }[];
  vehicleTypes: string[];
  canDelete: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  // complete chalan lifecycle dialog
  const [status, setStatus] = React.useState<ChalanStatusData | null>(null);
  const [statusLoading, setStatusLoading] = React.useState(false);

  const openStatus = async (id: string) => {
    setStatusLoading(true);
    try {
      const res = await getChalanStatus(id);
      if (res.ok) setStatus(res.data);
      else toast({ variant: "destructive", title: res.error });
    } finally {
      setStatusLoading(false);
    }
  };

  const columns: ColumnDef<ChalanRegisterRow>[] = [
    { accessorKey: "chalanNo", header: "Chalan No" },
    {
      accessorKey: "chalanDate",
      header: "Date",
      cell: ({ row }) => formatDate(row.original.chalanDate),
    },
    { accessorKey: "broker", header: "Broker" },
    { accessorKey: "vehicle", header: "Vehicle" },
    {
      accessorKey: "lrCount",
      header: "LRs",
      meta: { numeric: true, total: (r: ChalanRegisterRow[]) => r.reduce((s, x) => s + x.lrCount, 0) },
    },
    {
      accessorKey: "freight",
      header: "Freight",
      cell: ({ row }) => formatMoney(row.original.freight),
      meta: { numeric: true, total: (r: ChalanRegisterRow[]) => sum(r, "freight") },
    },
    {
      accessorKey: "tdsAmt",
      header: "TDS",
      cell: ({ row }) => formatMoney(row.original.tdsAmt),
      meta: { numeric: true, total: (r: ChalanRegisterRow[]) => sum(r, "tdsAmt") },
    },
    {
      accessorKey: "commissionAmt",
      header: "Commission",
      cell: ({ row }) => formatMoney(row.original.commissionAmt),
      meta: { numeric: true, total: (r: ChalanRegisterRow[]) => sum(r, "commissionAmt") },
    },
    {
      accessorKey: "advanceTotal",
      header: "Advance",
      cell: ({ row }) => formatMoney(row.original.advanceTotal),
      meta: { numeric: true, total: (r: ChalanRegisterRow[]) => sum(r, "advanceTotal") },
    },
    {
      accessorKey: "balance",
      header: "Balance",
      cell: ({ row }) => formatMoney(row.original.balance),
      meta: { numeric: true, total: (r: ChalanRegisterRow[]) => sum(r, "balance") },
    },
    {
      accessorKey: "isFinal",
      header: "Status",
      cell: ({ row }) =>
        row.original.isFinal ? <Badge>Final</Badge> : <Badge variant="secondary">Draft</Badge>,
    },
    {
      id: "podStatus",
      header: "POD Status",
      cell: ({ row }) => {
        const { podDone, lrCount, vehicle } = row.original;
        if (lrCount === 0) return <Badge variant="outline">—</Badge>;
        const complete = podDone === lrCount;
        return (
          <Link
            href={`/pod?vehicle=${encodeURIComponent(vehicle)}`}
            title="Open POD for this vehicle"
            onClick={(e) => e.stopPropagation()}
          >
            <Badge
              variant={complete ? "default" : "secondary"}
              className="cursor-pointer hover:opacity-80"
            >
              POD {podDone}/{lrCount}
            </Badge>
          </Link>
        );
      },
    },
    {
      accessorKey: "mamool",
      header: "Mamul",
      cell: ({ row }) => (row.original.mamool ? formatMoney(row.original.mamool) : ""),
      meta: { numeric: true, total: (r: ChalanRegisterRow[]) => sum(r, "mamool") },
    },
    {
      accessorKey: "courierCharge",
      header: "Courier",
      cell: ({ row }) => (row.original.courierCharge ? formatMoney(row.original.courierCharge) : ""),
      meta: { numeric: true, total: (r: ChalanRegisterRow[]) => sum(r, "courierCharge") },
    },
    {
      accessorKey: "shortageWt",
      header: "Shortage Wt",
      cell: ({ row }) => (row.original.shortageWt ? row.original.shortageWt : ""),
      meta: {
        numeric: true,
        total: (r: ChalanRegisterRow[]) =>
          Math.round(r.reduce((s, x) => s + x.shortageWt, 0) * 1000) / 1000 || "",
      },
    },
    {
      accessorKey: "shortage",
      header: "Shortage Paid",
      cell: ({ row }) =>
        row.original.paymentStatus === "PAID" && row.original.shortage
          ? formatMoney(row.original.shortage)
          : "",
      meta: { numeric: true, total: (r: ChalanRegisterRow[]) => sum(r, "shortage") },
    },
    {
      accessorKey: "roundOff",
      header: "Round Off",
      cell: ({ row }) =>
        row.original.paymentStatus === "PAID" && row.original.roundOff
          ? formatMoney(row.original.roundOff)
          : "",
      meta: { numeric: true, total: (r: ChalanRegisterRow[]) => sum(r, "roundOff") },
    },
    {
      accessorKey: "paymentStatus",
      header: "Balance Payment",
      cell: ({ row }) =>
        row.original.paymentStatus === "PAID" ? (
          <Badge>Paid {formatMoney(row.original.balPaidAmount)}</Badge>
        ) : (
          <Badge variant="destructive">Pending Balance</Badge>
        ),
    },
    {
      id: "actions",
      header: "",
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
          <Button asChild variant="ghost" size="sm" className="h-7 px-2">
            <Link href={`/chalan?id=${row.original.id}`}>Edit</Link>
          </Button>
          {row.original.isFinal &&
            row.original.paymentStatus !== "PAID" &&
            row.original.lrCount > 0 &&
            row.original.podDone >= row.original.lrCount && (
              <Button asChild variant="secondary" size="sm" className="h-7 px-2">
                <Link href={`/chalan?id=${row.original.id}#balance`}>Balance Pay</Link>
              </Button>
            )}
          <Button asChild variant="ghost" size="sm" className="h-7 px-2">
            <Link href={`/print/chalan/${row.original.id}`} target="_blank">
              Print
            </Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2"
            disabled={statusLoading}
            title="Complete lifecycle: LRs, billing, payments"
            onClick={() => void openStatus(row.original.id)}
          >
            Status
          </Button>
          {canDelete && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-destructive"
              onClick={async () => {
                if (!confirm(`Delete chalan ${row.original.chalanNo}?`)) return;
                const res = await deleteChalan(row.original.id);
                if (res.ok) {
                  toast({ title: "Chalan deleted" });
                  router.refresh();
                } else {
                  toast({ variant: "destructive", title: "Delete failed", description: res.error });
                }
              }}
            >
              Delete
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Chalan Register</h1>
        <div className="flex gap-2">
          <ExportButton
            rows={rows}
            fileName="chalan-register"
            columns={[
              { header: "Chalan No", key: "chalanNo" },
              { header: "Date", accessor: (r) => formatDate(r.chalanDate) },
              { header: "Broker", key: "broker" },
              { header: "Vehicle", key: "vehicle" },
              { header: "LRs", key: "lrCount", numeric: true },
              { header: "Freight", key: "freight", numeric: true },
              { header: "TDS", key: "tdsAmt", numeric: true },
              { header: "Commission", key: "commissionAmt", numeric: true },
              { header: "Advance", key: "advanceTotal", numeric: true },
              { header: "Balance", key: "balance", numeric: true },
              { header: "Mamul", key: "mamool", numeric: true },
              { header: "Courier", key: "courierCharge", numeric: true },
              { header: "Shortage Wt", key: "shortageWt", numeric: true },
              { header: "Shortage Paid", key: "shortage", numeric: true },
              { header: "Round Off", key: "roundOff", numeric: true },
              { header: "Status", accessor: (r) => (r.isFinal ? "FINAL" : "DRAFT") },
              { header: "Balance Payment", accessor: (r) => (r.paymentStatus === "PAID" ? "PAID" : "PENDING") },
            ]}
          />
          <Button asChild size="sm">
            <Link href="/chalan">+ New Chalan</Link>
          </Button>
        </div>
      </div>
      <FilterBar
        filters={[
          { type: "text", key: "q", label: "Chalan No..." },
          { type: "daterange", key: "date", label: "Date" },
          { type: "combobox", key: "broker", label: "Owner / Broker / Relative", options: brokers },
          { type: "combobox", key: "vehicle", label: "Vehicle", options: vehicles },
          {
            type: "select",
            key: "vtype",
            label: "Vehicle Type",
            options: vehicleTypes.map((t) => ({ value: t, label: t })),
          },
          {
            type: "select",
            key: "ownership",
            label: "Ownership",
            options: [
              { value: "OWNER", label: "Owner" },
              { value: "BROKER", label: "Broker" },
              { value: "RELATIVE", label: "Relative" },
            ],
          },
          {
            type: "select",
            key: "status",
            label: "Status",
            options: [
              { value: "final", label: "Final" },
              { value: "draft", label: "Draft" },
            ],
          },
          {
            type: "select",
            key: "payment",
            label: "Balance Payment",
            options: [
              { value: "paid", label: "Paid" },
              { value: "pending", label: "Pending" },
            ],
          },
        ]}
      />
      <DataTable
        columns={columns}
        data={rows}
        onRowClick={(row) => router.push(`/chalan?id=${row.id}`)}
      />

      {/* chalan status — complete tracking dashboard */}
      <Dialog open={!!status} onOpenChange={(o) => !o && setStatus(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Chalan Status — {status?.chalanNo}</DialogTitle>
            <DialogDescription>
              Complete lifecycle from creation to payment: LRs, bills, and payment history.
            </DialogDescription>
          </DialogHeader>
          {status && (
            <div className="space-y-3 text-sm">
              {/* 1. chalan details */}
              <div className="rounded-md border p-3">
                <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                  Chalan Details
                </div>
                <div className="grid gap-x-8 gap-y-0.5 sm:grid-cols-2">
                  <Line label="Chalan No" value={status.chalanNo} />
                  <Line label="Chalan Date" value={formatDate(status.chalanDate)} />
                  <Line label="Vehicle No" value={status.vehicle} />
                  <Line label="Transporter" value={status.transporter || "—"} />
                  <Line label="Owner" value={status.owner || "—"} />
                  <Line label="Driver" value={status.driverName || "—"} />
                  <Line label="Origin" value={status.origin || "—"} />
                  <Line label="Destination" value={status.destination || "—"} />
                  <Line label="Created" value={formatDate(status.createdAt)} />
                  <Line label="Stage" value={status.isFinal ? "Final" : "Draft"} />
                </div>
              </div>

              {/* 2 + 3. LRs with billing status */}
              <div className="rounded-md border p-3">
                <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                  LR &amp; Billing Status
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        {["LR No", "Date", "Consignor", "Consignee", "Qty", "Freight", "LR Status", "Bill No", "Bill Date", "Bill Amount", "Received", "Bill Balance", "Payment"].map(
                          (h) => (
                            <th key={h} className="px-1 py-0.5">
                              {h}
                            </th>
                          )
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {status.lrs.map((l) => (
                        <tr key={l.lrNo} className="border-b last:border-0">
                          <td className="px-1 py-0.5">{l.lrNo}</td>
                          <td className="px-1 py-0.5">{formatDate(l.lrDate)}</td>
                          <td className="px-1 py-0.5">{l.consignor}</td>
                          <td className="px-1 py-0.5">{l.consignee}</td>
                          <td className="px-1 py-0.5 text-right tabular-nums">{l.qty}</td>
                          <td className="px-1 py-0.5 text-right tabular-nums">
                            {formatMoney(l.freight)}
                          </td>
                          <td className="px-1 py-0.5">
                            <Badge variant="outline">{l.status.replace(/_/g, " ")}</Badge>
                          </td>
                          <td className="px-1 py-0.5">{l.invoiceNo || "—"}</td>
                          <td className="px-1 py-0.5">
                            {l.invoiceDate ? formatDate(l.invoiceDate) : ""}
                          </td>
                          <td className="px-1 py-0.5 text-right tabular-nums">
                            {l.billed ? formatMoney(l.invoiceAmount) : ""}
                          </td>
                          <td className="px-1 py-0.5 text-right tabular-nums">
                            {l.billed ? formatMoney(l.invoiceReceived) : ""}
                          </td>
                          <td className="px-1 py-0.5 text-right tabular-nums">
                            {l.billed ? formatMoney(l.invoiceBalance) : ""}
                          </td>
                          <td className="px-1 py-0.5">
                            <Badge
                              variant={
                                l.invoiceStatus === "Paid"
                                  ? "default"
                                  : l.invoiceStatus === "Not Billed"
                                    ? "outline"
                                    : l.invoiceStatus === "Partially Paid"
                                      ? "secondary"
                                      : "destructive"
                              }
                            >
                              {l.invoiceStatus}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 5. advance & balance */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border p-3">
                  <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                    Advances Paid
                  </div>
                  {status.advances.length === 0 && (
                    <div className="text-xs text-muted-foreground">No advances.</div>
                  )}
                  {status.advances.map((a, i) => (
                    <div key={i} className="flex justify-between gap-2 py-0.5 text-xs">
                      <span>
                        {a.date ? `${formatDate(a.date)} — ` : ""}
                        {a.name}
                        {a.mode ? ` (${a.mode})` : ""}
                        {a.remarks ? ` — ${a.remarks}` : ""}
                      </span>
                      <span className="tabular-nums">{formatMoney(a.amount)}</span>
                    </div>
                  ))}
                  <div className="mt-1 flex justify-between border-t pt-1 font-medium">
                    <span>Total Advance</span>
                    <span className="tabular-nums">{formatMoney(status.advanceTotal)}</span>
                  </div>
                  {/* every advance voucher this chalan consumed, either in the
                      advance section or at balance payment */}
                  {status.advanceAdjustments.length > 0 && (
                    <div className="mt-3 border-t pt-2">
                      <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                        Advance Vouchers Adjusted
                      </div>
                      {status.advanceAdjustments.map((a, i) => (
                        <div key={i} className="flex justify-between gap-2 py-0.5 text-xs">
                          <span>
                            {a.voucherNo}
                            {a.voucherDate ? ` — ${formatDate(a.voucherDate)}` : ""} ({a.section})
                          </span>
                          <span className="tabular-nums">{formatMoney(a.amount)}</span>
                        </div>
                      ))}
                      <div className="mt-1 flex justify-between border-t pt-1 font-medium">
                        <span>Total Advance Adjusted</span>
                        <span className="tabular-nums">
                          {formatMoney(status.advanceAdjustedTotal)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
                <div className="rounded-md border p-3">
                  <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                    Balance &amp; Settlement
                  </div>
                  <Line label="Grand Total" value={formatMoney(status.grandTotal)} />
                  <Line label="Balance" value={formatMoney(status.balance)} />
                  <Line
                    label="Balance Paid"
                    value={
                      status.paymentStatus === "PAID"
                        ? `${formatMoney(status.balPaidAmount)}${status.balPaymentDate ? ` on ${formatDate(status.balPaymentDate)}` : ""}${status.balPaymentMode ? ` (${status.balPaymentMode.replace("_", "/")})` : ""}`
                        : "—"
                    }
                  />
                  {status.paymentStatus === "PAID" && (status.balRoundOff > 0 || status.balShortage > 0) && (
                    <Line
                      label="Round Off / Shortage"
                      value={`${formatMoney(status.balRoundOff)} / ${formatMoney(status.balShortage)}`}
                    />
                  )}
                  <Line
                    label="Balance Pending"
                    value={
                      status.paymentStatus === "PAID" ? formatMoney(0) : formatMoney(status.balance)
                    }
                  />
                  <Line
                    label="Final Settlement"
                    value={status.paymentStatus === "PAID" ? "Settled (PAID)" : "Pending"}
                  />
                  {status.balRemarks && <Line label="Remarks" value={status.balRemarks} />}
                </div>
              </div>

              {/* 6. payment history (ledger) */}
              <div className="rounded-md border p-3">
                <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                  Payment History
                </div>
                {status.payments.length === 0 && (
                  <div className="text-xs text-muted-foreground">
                    No ledger payments recorded yet.
                  </div>
                )}
                {status.payments.map((p, i) => (
                  <div key={i} className="flex justify-between gap-2 py-0.5 text-xs">
                    <span>
                      {formatDate(p.date)} — {p.account || "—"} ({p.side === "CREDIT" ? "Out" : "In"},{" "}
                      {p.refType === "CHALAN_ADVANCE" ? "Advance" : "Balance"})
                      {p.narration ? ` — ${p.narration}` : ""}
                    </span>
                    <span className="tabular-nums">{formatMoney(p.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatus(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-0.5 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
