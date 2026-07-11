"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { type ColumnDef } from "@tanstack/react-table";
import { Trash2 } from "lucide-react";
import { formatDate, formatMoney } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { DataTable, DataTableColumnMeta } from "@/components/data/data-table";
import { ExportButton, ExportColumn } from "@/components/data/export-button";
import { deleteVoucher } from "@/app/(app)/accounts/vouchers/actions";

export interface RegisterRow {
  id: string;
  voucherNo: string;
  voucherDate: string; // ISO
  type: string;
  partyName: string | null;
  moduleLink: string;
  bankName: string | null;
  chequeNo: string | null;
  amount: number;
  tdsAmt: number;
  deduction: number;
  netAmount: number;
  [key: string]: string | number | null;
}

const TYPE_VARIANT: Record<string, "default" | "destructive" | "secondary"> = {
  RECEIPT: "default",
  PAYMENT: "destructive",
  CONTRA: "secondary",
};

function money(key: keyof RegisterRow & string): DataTableColumnMeta<RegisterRow> {
  return {
    numeric: true,
    total: (rows: RegisterRow[]) =>
      formatMoney(rows.reduce((s, r) => s + (Number(r[key]) || 0), 0)),
  };
}

export function VoucherRegisterTable({ rows, canDelete }: { rows: RegisterRow[]; canDelete: boolean }) {
  const router = useRouter();
  const { toast } = useToast();

  const columns = React.useMemo<ColumnDef<RegisterRow, unknown>[]>(() => {
    const cols: ColumnDef<RegisterRow, unknown>[] = [
      { accessorKey: "voucherNo", header: "Voucher No" },
      {
        accessorKey: "voucherDate",
        header: "Date",
        cell: ({ row }) => formatDate(new Date(row.original.voucherDate)),
      },
      {
        accessorKey: "type",
        header: "Type",
        cell: ({ row }) => (
          <Badge variant={TYPE_VARIANT[row.original.type] ?? "secondary"}>
            {row.original.type}
          </Badge>
        ),
      },
      { accessorKey: "partyName", header: "Party" },
      {
        accessorKey: "moduleLink",
        header: "Module",
        cell: ({ row }) => row.original.moduleLink.replace(/_/g, " "),
      },
      { accessorKey: "bankName", header: "Bank" },
      { accessorKey: "chequeNo", header: "Cheque No" },
      {
        accessorKey: "amount",
        header: "Amount",
        meta: money("amount"),
        cell: ({ row }) => formatMoney(row.original.amount),
      },
      {
        accessorKey: "tdsAmt",
        header: "TDS",
        meta: money("tdsAmt"),
        cell: ({ row }) => formatMoney(row.original.tdsAmt),
      },
      {
        accessorKey: "deduction",
        header: "Deduction",
        meta: money("deduction"),
        cell: ({ row }) => formatMoney(row.original.deduction),
      },
      {
        accessorKey: "netAmount",
        header: "Net",
        meta: money("netAmount"),
        cell: ({ row }) => formatMoney(row.original.netAmount),
      },
    ];
    if (canDelete) {
      cols.push({
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive"
            onClick={async (e) => {
              e.stopPropagation();
              if (!confirm(`Delete voucher ${row.original.voucherNo}?`)) return;
              const res = await deleteVoucher(row.original.id);
              if (res.ok) {
                toast({ title: "Voucher deleted" });
                router.refresh();
              } else {
                toast({ variant: "destructive", title: "Delete failed", description: res.error });
              }
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        ),
      });
    }
    return cols;
  }, [canDelete, router, toast]);

  const exportColumns: ExportColumn<RegisterRow>[] = [
    { header: "Voucher No", key: "voucherNo" },
    { header: "Date", accessor: (r) => formatDate(new Date(r.voucherDate)) },
    { header: "Type", key: "type" },
    { header: "Party", key: "partyName" },
    { header: "Module", key: "moduleLink" },
    { header: "Bank", key: "bankName" },
    { header: "Cheque No", key: "chequeNo" },
    { header: "Amount", key: "amount", numeric: true },
    { header: "TDS", key: "tdsAmt", numeric: true },
    { header: "Deduction", key: "deduction", numeric: true },
    { header: "Net", key: "netAmount", numeric: true },
  ];

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <ExportButton rows={rows} columns={exportColumns} fileName="voucher-register" />
      </div>
      <DataTable columns={columns} data={rows} emptyMessage="No vouchers found." />
    </div>
  );
}
