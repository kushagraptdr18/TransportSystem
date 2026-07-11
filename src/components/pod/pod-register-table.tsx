"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumnMeta } from "@/components/data/data-table";
import { ExportButton } from "@/components/data/export-button";

export interface PodRegisterRow {
  id: string;
  docNo: string;
  docDate: string;
  lrNo: string;
  vehicle: string;
  ackNo: string;
  unloadDate: string | null;
  poNumber: string;
  gateEntryNo: string;
  recWt: number | null;
  shortageWt: number | null;
  filePath: string | null;
  status: string;
  sourceType: string;
}

function num(v: number | null): string {
  return v === null ? "" : v.toLocaleString("en-IN", { maximumFractionDigits: 3 });
}

const columns: ColumnDef<PodRegisterRow>[] = [
  { accessorKey: "docNo", header: "Doc No" },
  {
    accessorKey: "docDate",
    header: "Date",
    cell: ({ row }) => formatDate(row.original.docDate),
  },
  { accessorKey: "lrNo", header: "LR No" },
  { accessorKey: "vehicle", header: "Vehicle" },
  { accessorKey: "ackNo", header: "Ack No" },
  {
    accessorKey: "unloadDate",
    header: "Unload Date",
    cell: ({ row }) => formatDate(row.original.unloadDate),
  },
  { accessorKey: "poNumber", header: "PO No" },
  { accessorKey: "gateEntryNo", header: "Gate Entry" },
  {
    accessorKey: "recWt",
    header: "Rec Wt",
    cell: ({ row }) => num(row.original.recWt),
    meta: {
      numeric: true,
      total: (rows) => num(rows.reduce((s, r) => s + (r.recWt ?? 0), 0)),
    } satisfies DataTableColumnMeta<PodRegisterRow>,
  },
  {
    accessorKey: "shortageWt",
    header: "Shortage",
    cell: ({ row }) => num(row.original.shortageWt),
    meta: {
      numeric: true,
      total: (rows) => num(rows.reduce((s, r) => s + (r.shortageWt ?? 0), 0)),
    } satisfies DataTableColumnMeta<PodRegisterRow>,
  },
  {
    id: "file",
    header: "File",
    cell: ({ row }) =>
      row.original.filePath ? (
        <a
          href={`/api/uploads/${row.original.filePath}`}
          target="_blank"
          rel="noreferrer"
          className="text-primary underline"
          onClick={(e) => e.stopPropagation()}
        >
          View
        </a>
      ) : null,
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => (
      <Badge variant={row.original.status === "COMPLETED" ? "default" : "secondary"}>
        {row.original.status}
      </Badge>
    ),
  },
];

export function PodRegisterTable({ rows }: { rows: PodRegisterRow[] }) {
  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <ExportButton
          rows={rows}
          fileName="pod-register"
          sheetName="POD Register"
          columns={[
            { header: "Doc No", key: "docNo" },
            { header: "Date", accessor: (r) => formatDate(r.docDate) },
            { header: "LR No", key: "lrNo" },
            { header: "Vehicle", key: "vehicle" },
            { header: "Ack No", key: "ackNo" },
            { header: "Unload Date", accessor: (r) => formatDate(r.unloadDate) },
            { header: "PO No", key: "poNumber" },
            { header: "Gate Entry", key: "gateEntryNo" },
            { header: "Rec Wt", accessor: (r) => r.recWt ?? "", numeric: true },
            { header: "Shortage", accessor: (r) => r.shortageWt ?? "", numeric: true },
            { header: "Status", key: "status" },
          ]}
        />
      </div>
      <DataTable columns={columns} data={rows} emptyMessage="No PODs found." />
    </div>
  );
}
