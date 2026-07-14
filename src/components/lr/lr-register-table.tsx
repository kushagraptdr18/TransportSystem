"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Copy, GitBranch, Pencil, Printer, Trash2 } from "lucide-react";
import { formatDate, formatMoney } from "@/lib/utils";
import { deleteLr, getLrLifecycle, type LrLifecycle } from "@/app/(app)/lr/actions";
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
import { ExportButton, type ExportColumn } from "@/components/data/export-button";
import { useToast } from "@/components/ui/use-toast";

export interface LrRegisterRow {
  id: string;
  lrNo: string;
  lrDate: string;
  source: string;
  dest: string;
  consignor: string;
  consignee: string;
  billTo: string;
  vehicle: string;
  qty: number;
  actualWt: number;
  chargeWt: number;
  freight: number;
  grandTotal: number;
  lrType: string;
  status: string;
  isDummy: boolean;
}

const TYPE_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  TO_PAY: "outline",
  TBB: "secondary",
  PAID: "default",
  FOC: "outline",
  CANCELLED: "destructive",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  PENDING: "outline",
  ON_CHALAN: "secondary",
  ARRIVED: "secondary",
  DELIVERED: "default",
  BILLED: "default",
};

function sum(rows: LrRegisterRow[], key: keyof LrRegisterRow): number {
  return rows.reduce((s, r) => s + Number(r[key] ?? 0), 0);
}

export function LrRegisterTable({
  rows,
  canDelete,
}: {
  rows: LrRegisterRow[];
  canDelete: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [toDelete, setToDelete] = React.useState<LrRegisterRow | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [statusFor, setStatusFor] = React.useState<LrRegisterRow | null>(null);
  const [lifecycle, setLifecycle] = React.useState<LrLifecycle | null>(null);
  const [statusLoading, setStatusLoading] = React.useState(false);

  const openStatus = React.useCallback(async (lr: LrRegisterRow) => {
    setStatusFor(lr);
    setLifecycle(null);
    setStatusLoading(true);
    try {
      setLifecycle(await getLrLifecycle(lr.id));
    } finally {
      setStatusLoading(false);
    }
  }, []);

  const columns = React.useMemo<ColumnDef<LrRegisterRow, unknown>[]>(() => {
    const numMeta = (key: keyof LrRegisterRow, decimals = 2): DataTableColumnMeta<LrRegisterRow> => ({
      numeric: true,
      total: (rs: LrRegisterRow[]) =>
        decimals === 3 ? sum(rs, key).toFixed(3) : formatMoney(sum(rs, key)),
    });
    return [
      { accessorKey: "lrNo", header: "LR No" },
      { accessorKey: "lrDate", header: "Date" },
      { accessorKey: "source", header: "Source" },
      { accessorKey: "dest", header: "Destination" },
      { accessorKey: "consignor", header: "Consignor" },
      { accessorKey: "consignee", header: "Consignee" },
      { accessorKey: "billTo", header: "Billed To" },
      { accessorKey: "vehicle", header: "Vehicle" },
      {
        accessorKey: "qty",
        header: "Qty",
        cell: ({ row }) => row.original.qty.toFixed(3),
        meta: numMeta("qty", 3),
      },
      {
        accessorKey: "actualWt",
        header: "Actual Wt",
        cell: ({ row }) => row.original.actualWt.toFixed(3),
        meta: numMeta("actualWt", 3),
      },
      {
        accessorKey: "chargeWt",
        header: "Charge Wt",
        cell: ({ row }) => row.original.chargeWt.toFixed(3),
        meta: numMeta("chargeWt", 3),
      },
      {
        accessorKey: "freight",
        header: "Freight",
        cell: ({ row }) => formatMoney(row.original.freight),
        meta: numMeta("freight"),
      },
      {
        accessorKey: "grandTotal",
        header: "Grand Total",
        cell: ({ row }) => formatMoney(row.original.grandTotal),
        meta: numMeta("grandTotal"),
      },
      {
        accessorKey: "lrType",
        header: "Type",
        cell: ({ row }) => (
          <Badge variant={TYPE_VARIANT[row.original.lrType] ?? "outline"}>
            {row.original.lrType.replace("_", " ")}
          </Badge>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <Badge variant={STATUS_VARIANT[row.original.status] ?? "outline"}>
            {row.original.status.replace("_", " ")}
          </Badge>
        ),
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => {
          const lr = row.original;
          const editHref = lr.isDummy ? `/lr/dummy?id=${lr.id}` : `/lr?id=${lr.id}`;
          return (
            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                <Link href={editHref} title="View / Edit">
                  <Pencil className="h-3.5 w-3.5" />
                </Link>
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                <Link href={`/print/lr/${lr.id}`} target="_blank" title="Print">
                  <Printer className="h-3.5 w-3.5" />
                </Link>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-primary"
                title="LR Status / Lifecycle"
                onClick={() => void openStatus(lr)}
              >
                <GitBranch className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                <Link
                  href={lr.isDummy ? `/lr/dummy?copy=${lr.id}` : `/lr?copy=${lr.id}`}
                  title="Copy to New LR"
                >
                  <Copy className="h-3.5 w-3.5" />
                </Link>
              </Button>
              {canDelete && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive"
                  title="Delete"
                  onClick={() => setToDelete(lr)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          );
        },
      },
    ];
  }, [canDelete, openStatus]);

  const exportColumns: ExportColumn<LrRegisterRow>[] = [
    { header: "LR No", key: "lrNo" },
    { header: "Date", key: "lrDate" },
    { header: "Source", key: "source" },
    { header: "Destination", key: "dest" },
    { header: "Consignor", key: "consignor", width: 28 },
    { header: "Consignee", key: "consignee", width: 28 },
    { header: "Billed To", key: "billTo", width: 28 },
    { header: "Vehicle", key: "vehicle" },
    { header: "Qty", key: "qty", numeric: true },
    { header: "Actual Wt", key: "actualWt", numeric: true },
    { header: "Charge Wt", key: "chargeWt", numeric: true },
    { header: "Freight", key: "freight", numeric: true },
    { header: "Grand Total", key: "grandTotal", numeric: true },
    { header: "Type", key: "lrType" },
    { header: "Status", key: "status" },
  ];

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      const res = await deleteLr(toDelete.id);
      if (res.ok) {
        toast({ title: `LR ${toDelete.lrNo} deleted` });
        setToDelete(null);
        router.refresh();
      } else {
        toast({ variant: "destructive", title: res.error });
      }
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <ExportButton rows={rows} columns={exportColumns} fileName="lr-register" sheetName="LR Register" />
      </div>
      <DataTable columns={columns} data={rows} emptyMessage="No LRs found." />

      <Dialog open={!!statusFor} onOpenChange={(o) => !o && setStatusFor(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              LR Status — {statusFor?.lrNo}
              {lifecycle && (
                <Badge variant={STATUS_VARIANT[lifecycle.booking.status] ?? "outline"}>
                  {lifecycle.booking.status.replace("_", " ")}
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              Complete lifecycle: Booking → Chalan → POD → Billing
            </DialogDescription>
          </DialogHeader>
          {statusLoading && (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading...</p>
          )}
          {!statusLoading && lifecycle && (
            <div className="grid gap-4 sm:grid-cols-2">
              <LifeCard title="1. Booking" done>
                <LifeRow label="LR Date" value={formatDate(lifecycle.booking.lrDate)} />
                <LifeRow label="Route" value={lifecycle.booking.route} />
                <LifeRow label="Consignor" value={lifecycle.booking.consignor} />
                <LifeRow label="Consignee" value={lifecycle.booking.consignee} />
                <LifeRow label="Vehicle" value={lifecycle.booking.vehicle} />
                <LifeRow label="Type" value={lifecycle.booking.lrType.replace("_", " ")} />
                <LifeRow label="Items" value={lifecycle.booking.items} />
                <LifeRow label="Freight" value={formatMoney(lifecycle.booking.freight)} />
                <LifeRow label="Grand Total" value={formatMoney(lifecycle.booking.grandTotal)} />
              </LifeCard>
              <LifeCard
                title="2. Chalan"
                done={lifecycle.chalans.length > 0}
                pendingText="Not yet loaded on a chalan."
              >
                {lifecycle.chalans.map((c) => (
                  <div key={c.chalanNo} className="space-y-1 border-b pb-2 last:border-b-0 last:pb-0">
                    <LifeRow label="Chalan No" value={c.chalanNo} />
                    <LifeRow label="Date" value={formatDate(c.chalanDate)} />
                    <LifeRow label="Broker" value={c.broker} />
                    <LifeRow label="Vehicle" value={c.vehicle} />
                    <LifeRow label="Driver" value={c.driver} />
                    <LifeRow label="Freight" value={formatMoney(c.freight)} />
                    <LifeRow
                      label="Unloaded"
                      value={c.unloadDate ? formatDate(c.unloadDate) : "Pending"}
                    />
                  </div>
                ))}
              </LifeCard>
              <LifeCard
                title="3. POD"
                done={lifecycle.pods.length > 0}
                pendingText="POD not yet received."
              >
                {lifecycle.pods.map((pod) => (
                  <div key={pod.docNo} className="space-y-1 border-b pb-2 last:border-b-0 last:pb-0">
                    <LifeRow label="POD No" value={pod.docNo} />
                    <LifeRow label="POD Date" value={formatDate(pod.docDate)} />
                    <LifeRow
                      label="Unload Date"
                      value={pod.unloadDate ? formatDate(pod.unloadDate) : "—"}
                    />
                    <LifeRow label="Ack No" value={pod.ackNo || "—"} />
                    <LifeRow
                      label="Received Wt"
                      value={pod.recWt != null ? pod.recWt.toFixed(3) : "—"}
                    />
                    <LifeRow
                      label="Shortage Wt"
                      value={pod.shortageWt != null ? pod.shortageWt.toFixed(3) : "—"}
                    />
                  </div>
                ))}
              </LifeCard>
              <LifeCard
                title="4. Billing"
                done={lifecycle.invoices.length > 0}
                pendingText="Not yet billed."
              >
                {lifecycle.invoices.map((inv) => (
                  <div key={inv.invoiceNo} className="space-y-1 border-b pb-2 last:border-b-0 last:pb-0">
                    <LifeRow label="Invoice No" value={inv.invoiceNo} />
                    <LifeRow label="Date" value={formatDate(inv.invoiceDate)} />
                    <LifeRow label="Kind" value={inv.kind.replace("_", " ")} />
                    <LifeRow label="Party" value={inv.party} />
                    <LifeRow label="Net Total" value={formatMoney(inv.netTotal)} />
                    <LifeRow label="Balance" value={formatMoney(inv.balance)} />
                  </div>
                ))}
              </LifeCard>
            </div>
          )}
          {!statusLoading && !lifecycle && statusFor && (
            <p className="py-6 text-center text-sm text-muted-foreground">LR not found.</p>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete LR {toDelete?.lrNo}?</DialogTitle>
            <DialogDescription>
              This will soft-delete the LR. It will no longer appear in registers or be available
              for chalans and billing.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setToDelete(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LifeCard({
  title,
  done,
  pendingText,
  children,
}: {
  title: string;
  done: boolean;
  pendingText?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold">{title}</span>
        <Badge variant={done ? "default" : "outline"}>{done ? "Done" : "Pending"}</Badge>
      </div>
      {done ? (
        <div className="space-y-1">{children}</div>
      ) : (
        <p className="text-sm italic text-muted-foreground">{pendingText}</p>
      )}
    </div>
  );
}

function LifeRow({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value || "—"}</span>
    </div>
  );
}
