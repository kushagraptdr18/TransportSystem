"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Trash2 } from "lucide-react";
import { formatDate, formatMoney } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { DataTable, type DataTableColumnMeta } from "@/components/data/data-table";
import { ExportButton } from "@/components/data/export-button";
import { deleteBrokerSlip } from "@/app/(app)/broker/actions";

export interface BrokerRegisterRow {
  id: string;
  slipNo: string;
  slipDate: string;
  vehicle: string;
  transporter: string;
  owner: string;
  loadStation: string;
  destination: string;
  qty: number;
  actualWt: number;
  pFreight: number;
  pBalance: number;
  vFreight: number;
  vNetAmt: number;
  vAdvance: number;
  vBalance: number;
}

const money = (
  key: keyof Pick<
    BrokerRegisterRow,
    "pFreight" | "pBalance" | "vFreight" | "vNetAmt" | "vAdvance" | "vBalance"
  >,
  header: string
): ColumnDef<BrokerRegisterRow> => ({
  accessorKey: key,
  header,
  cell: ({ row }) => formatMoney(row.original[key]),
  meta: {
    numeric: true,
    total: (rows) => formatMoney(rows.reduce((s, r) => s + r[key], 0)),
  } satisfies DataTableColumnMeta<BrokerRegisterRow>,
});

export function BrokerRegisterTable({
  data,
  canDelete,
}: {
  data: BrokerRegisterRow[];
  canDelete: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [toDelete, setToDelete] = React.useState<BrokerRegisterRow | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      const res = await deleteBrokerSlip(toDelete.id);
      if (res.ok) {
        toast({ title: `Broker slip ${toDelete.slipNo} deleted` });
        setToDelete(null);
        router.refresh();
      } else {
        toast({ variant: "destructive", title: "Delete failed", description: res.error });
      }
    } finally {
      setDeleting(false);
    }
  };

  const columns: ColumnDef<BrokerRegisterRow>[] = [
    { accessorKey: "slipNo", header: "Slip No" },
    {
      accessorKey: "slipDate",
      header: "Date",
      cell: ({ row }) => formatDate(row.original.slipDate),
    },
    { accessorKey: "vehicle", header: "Vehicle" },
    { accessorKey: "transporter", header: "Transporter" },
    { accessorKey: "owner", header: "Owner" },
    { accessorKey: "loadStation", header: "From" },
    { accessorKey: "destination", header: "To" },
    {
      accessorKey: "qty",
      header: "Qty",
      cell: ({ row }) => row.original.qty.toLocaleString("en-IN", { maximumFractionDigits: 3 }),
      meta: {
        numeric: true,
        total: (rows) =>
          rows.reduce((s, r) => s + r.qty, 0).toLocaleString("en-IN", { maximumFractionDigits: 3 }),
      } satisfies DataTableColumnMeta<BrokerRegisterRow>,
    },
    money("pFreight", "Party Freight"),
    money("pBalance", "Party Balance"),
    money("vFreight", "Owner Freight"),
    money("vNetAmt", "Owner Net"),
    money("vAdvance", "Advance"),
    money("vBalance", "Owner Balance"),
    ...(canDelete
      ? [
          {
            id: "actions",
            header: "",
            cell: ({ row }) => (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  setToDelete(row.original);
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            ),
          } satisfies ColumnDef<BrokerRegisterRow>,
        ]
      : []),
  ];

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <ExportButton
          rows={data}
          fileName="broker-register"
          sheetName="Broker Register"
          columns={[
            { header: "Slip No", key: "slipNo" },
            { header: "Date", accessor: (r) => formatDate(r.slipDate) },
            { header: "Vehicle", key: "vehicle" },
            { header: "Transporter", key: "transporter" },
            { header: "Owner", key: "owner" },
            { header: "From", key: "loadStation" },
            { header: "To", key: "destination" },
            { header: "Qty", key: "qty", numeric: true },
            { header: "Party Freight", key: "pFreight", numeric: true },
            { header: "Party Balance", key: "pBalance", numeric: true },
            { header: "Owner Freight", key: "vFreight", numeric: true },
            { header: "Owner Net", key: "vNetAmt", numeric: true },
            { header: "Advance", key: "vAdvance", numeric: true },
            { header: "Owner Balance", key: "vBalance", numeric: true },
          ]}
        />
      </div>
      <DataTable
        columns={columns}
        data={data}
        emptyMessage="No broker slips found."
        onRowClick={(row) => router.push(`/broker/slip?id=${row.id}`)}
      />

      <Dialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete broker slip {toDelete?.slipNo}?</DialogTitle>
            <DialogDescription>
              The slip will be soft-deleted and removed from registers. This cannot be undone here.
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
