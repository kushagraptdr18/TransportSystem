"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Pencil, Plus, Printer, Trash2, Upload } from "lucide-react";
import { formatDate, formatMoney } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/components/ui/use-toast";
import { DataTable, type DataTableColumnMeta } from "@/components/data/data-table";
import { ExportButton, type ExportColumn } from "@/components/data/export-button";
import { FilterBar, type FilterDef } from "@/components/data/filter-bar";
import { deleteAuditChalan, deleteAuditChalans } from "./actions";
import { AuditEntryDialog } from "./entry-dialog";
import { AuditImportDialog } from "./import-dialog";

export interface AuditChalanRow {
  id: string;
  chalanNo: string;
  chalanDate: string;
  transportName: string;
  ownerName: string;
  panCard: string;
  loadingFrom: string;
  toLocation: string;
  actualWt: number;
  chargeWt: number;
  freightRate: number;
  freightAmount: number;
  tdsAmount: number;
  advanceBank: number;
  cash: number;
  diesel: number;
  tyre: number;
  uria: number;
  other: number;
  balance: number;
}

const FILTERS: FilterDef[] = [
  { type: "text", key: "q", label: "Search challan / transport / owner / PAN / route" },
  { type: "daterange", key: "date", label: "Date Range" },
];

/** money column with a footer total */
function moneyCol(
  key: keyof AuditChalanRow,
  header: string
): ColumnDef<AuditChalanRow, unknown> {
  return {
    accessorKey: key,
    header,
    cell: ({ row }) => formatMoney(row.original[key] as number),
    meta: {
      numeric: true,
      total: (rows: AuditChalanRow[]) =>
        formatMoney(rows.reduce((s, r) => s + (r[key] as number), 0)),
    } satisfies DataTableColumnMeta<AuditChalanRow>,
  };
}

const EXPORT_COLUMNS: ExportColumn<AuditChalanRow>[] = [
  { header: "Challan No.", key: "chalanNo" },
  { header: "Date", accessor: (r) => formatDate(r.chalanDate) },
  { header: "Transport Name", key: "transportName", width: 22 },
  { header: "Owner Name", key: "ownerName", width: 18 },
  { header: "PAN Card", key: "panCard" },
  { header: "Loading From", key: "loadingFrom" },
  { header: "To", key: "toLocation" },
  { header: "Actual WT", key: "actualWt", numeric: true },
  { header: "Charge WT", key: "chargeWt", numeric: true },
  { header: "Freight Rate", key: "freightRate", numeric: true },
  { header: "Freight Amount", key: "freightAmount", numeric: true },
  { header: "TDS Amount", key: "tdsAmount", numeric: true },
  { header: "Advances in Bank", key: "advanceBank", numeric: true },
  { header: "Cash", key: "cash", numeric: true },
  { header: "Diesel", key: "diesel", numeric: true },
  { header: "Tyre", key: "tyre", numeric: true },
  { header: "Uria", key: "uria", numeric: true },
  { header: "Other", key: "other", numeric: true },
  { header: "Balance", key: "balance", numeric: true },
];

export function AuditChalanRegisterClient({
  rows,
  canCreate,
  canDelete,
}: {
  rows: AuditChalanRow[];
  canCreate: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [entryOpen, setEntryOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<AuditChalanRow | null>(null);
  const [importOpen, setImportOpen] = React.useState(false);

  // a filter change replaces the row set, so a stale selection would silently
  // print or delete records the user can no longer see
  const rowIds = React.useMemo(() => rows.map((r) => r.id).join(","), [rows]);
  React.useEffect(() => setSelected(new Set()), [rowIds]);

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allSelected = rows.length > 0 && selected.size === rows.length;

  const openAdd = () => {
    setEditing(null);
    setEntryOpen(true);
  };
  const openEdit = (row: AuditChalanRow) => {
    setEditing(row);
    setEntryOpen(true);
  };

  const removeOne = async (row: AuditChalanRow) => {
    if (
      !window.confirm(
        `Delete Audit Challan ${row.chalanNo}?\n\nThis removes the audit register record only — no live challan, payment, ledger or balance is affected.`
      )
    ) {
      return;
    }
    const res = await deleteAuditChalan(row.id);
    if (!res.ok) {
      toast({ variant: "destructive", title: "Delete failed", description: res.error });
      return;
    }
    toast({ title: "Audit Challan deleted" });
    router.refresh();
  };

  const removeSelected = async () => {
    const ids = Array.from(selected);
    if (
      !window.confirm(
        `Delete ${ids.length} audit record(s)?\n\nThis removes audit register records only — no live challan, payment, ledger or balance is affected.`
      )
    ) {
      return;
    }
    const res = await deleteAuditChalans(ids);
    if (!res.ok) {
      toast({ variant: "destructive", title: "Delete failed", description: res.error });
      return;
    }
    toast({ title: `${res.deleted} record(s) deleted` });
    setSelected(new Set());
    router.refresh();
  };

  // Bulk print follows the selection when there is one, otherwise the whole
  // filtered set — so "filter a month, click Bulk Print" gives one page per
  // challan for every row on screen.
  const bulkPrintHref = React.useMemo(() => {
    if (selected.size > 0) {
      return `/print/audit-chalan/bulk?ids=${Array.from(selected).join(",")}`;
    }
    const params = new URLSearchParams();
    for (const key of ["date_from", "date_to", "q"]) {
      const v = searchParams.get(key);
      if (v) params.set(key, v);
    }
    const qs = params.toString();
    return `/print/audit-chalan/bulk${qs ? `?${qs}` : ""}`;
  }, [selected, searchParams]);

  const columns: ColumnDef<AuditChalanRow, unknown>[] = [
    {
      id: "select",
      enableSorting: false,
      header: () => (
        <Checkbox
          checked={allSelected}
          onCheckedChange={(v) =>
            setSelected(v === true ? new Set(rows.map((r) => r.id)) : new Set())
          }
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={selected.has(row.original.id)}
          onCheckedChange={() => toggle(row.original.id)}
          aria-label={`Select ${row.original.chalanNo}`}
        />
      ),
    },
    {
      id: "sno",
      header: "S.No.",
      enableSorting: false,
      cell: ({ row }) => <span className="text-muted-foreground">{row.index + 1}</span>,
    },
    { accessorKey: "chalanNo", header: "Challan No." },
    {
      accessorKey: "chalanDate",
      header: "Date",
      cell: ({ row }) => formatDate(row.original.chalanDate),
    },
    { accessorKey: "transportName", header: "Transport Name" },
    { accessorKey: "ownerName", header: "Owner Name" },
    { accessorKey: "panCard", header: "PAN Card" },
    { accessorKey: "loadingFrom", header: "Loading From" },
    { accessorKey: "toLocation", header: "To" },
    {
      accessorKey: "actualWt",
      header: "Actual WT",
      meta: { numeric: true } satisfies DataTableColumnMeta<AuditChalanRow>,
    },
    {
      accessorKey: "chargeWt",
      header: "Charge WT",
      meta: { numeric: true } satisfies DataTableColumnMeta<AuditChalanRow>,
    },
    {
      accessorKey: "freightRate",
      header: "Freight Rate",
      cell: ({ row }) => formatMoney(row.original.freightRate),
      meta: { numeric: true } satisfies DataTableColumnMeta<AuditChalanRow>,
    },
    moneyCol("freightAmount", "Freight Amount"),
    moneyCol("tdsAmount", "TDS Amount"),
    moneyCol("advanceBank", "Advances in Bank"),
    moneyCol("cash", "Cash"),
    moneyCol("diesel", "Diesel"),
    moneyCol("tyre", "Tyre"),
    moneyCol("uria", "Uria"),
    moneyCol("other", "Other"),
    moneyCol("balance", "Balance"),
    {
      id: "actions",
      header: "",
      enableSorting: false,
      cell: ({ row }) => (
        <span className="flex items-center gap-1">
          <Button asChild variant="ghost" size="sm" className="h-7 px-2" title="Print this challan">
            <Link href={`/print/audit-chalan/${row.original.id}`} target="_blank">
              <Printer className="h-3.5 w-3.5" />
            </Link>
          </Button>
          {canCreate && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              title="Edit"
              onClick={() => openEdit(row.original)}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
          {canDelete && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-destructive"
              title="Delete audit record"
              onClick={() => void removeOne(row.original)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">Audit Challan Register</h1>
          <p className="text-sm text-muted-foreground">
            Independent audit and reference register. Records here are stored exactly as entered,
            are not linked to any master, and have no effect on challans, vouchers, ledgers or
            balances.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canCreate && (
            <Button size="sm" onClick={openAdd}>
              <Plus className="h-4 w-4" />
              Add New Entry
            </Button>
          )}
          {canCreate && (
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              <Upload className="h-4 w-4" />
              Import
            </Button>
          )}
          <ExportButton
            rows={rows}
            columns={EXPORT_COLUMNS}
            fileName="audit-challan-register"
            sheetName="Audit Challan"
            label="Export"
          />
          <Button asChild variant="outline" size="sm" disabled={rows.length === 0}>
            <Link href={bulkPrintHref} target="_blank">
              <Printer className="h-4 w-4" />
              Bulk Print{selected.size > 0 ? ` (${selected.size})` : ""}
            </Link>
          </Button>
        </div>
      </div>

      <FilterBar filters={FILTERS} />

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/40 px-3 py-2 text-sm">
          <span>{selected.size} selected</span>
          <Button variant="ghost" size="sm" className="h-7" onClick={() => setSelected(new Set())}>
            Clear selection
          </Button>
          {canDelete && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-destructive"
              onClick={() => void removeSelected()}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete selected
            </Button>
          )}
        </div>
      )}

      <DataTable
        columns={columns}
        data={rows}
        emptyMessage="No audit challans yet — add an entry or import an Excel file."
      />

      <AuditEntryDialog open={entryOpen} onOpenChange={setEntryOpen} editing={editing} />
      <AuditImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}
