"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Pencil, Printer, Trash2 } from "lucide-react";
import { formatMoney } from "@/lib/utils";
import { deleteLr } from "@/app/(app)/lr/actions";
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
  }, [canDelete]);

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
