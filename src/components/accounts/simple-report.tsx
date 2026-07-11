"use client";

import * as React from "react";
import Link from "next/link";
import { type ColumnDef } from "@tanstack/react-table";
import { formatDate, formatMoney, toNum } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { DataTable, DataTableColumnMeta } from "@/components/data/data-table";
import { ExportButton, ExportColumn } from "@/components/data/export-button";

/** Serializable column spec so server components can define report tables. */
export interface ReportColumn {
  key: string;
  header: string;
  /** money: right-aligned, formatted, totalled; date: dd/mm/yyyy; badge: coloured pill */
  kind?: "text" | "money" | "date" | "badge";
  /** money columns get a totals footer unless disabled */
  total?: boolean;
  /** render cell as link to `${linkBase}${row[linkParamKey]}` */
  linkBase?: string;
  linkParamKey?: string;
}

export type ReportRow = Record<string, string | number | null>;

const BADGE_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  RECEIPT: "default",
  PAYMENT: "destructive",
  CONTRA: "secondary",
};

export function SimpleReport({
  columns,
  rows,
  fileName,
  title,
  emptyMessage,
}: {
  columns: ReportColumn[];
  rows: ReportRow[];
  fileName: string;
  title?: string;
  emptyMessage?: string;
}) {
  const columnDefs = React.useMemo<ColumnDef<ReportRow, unknown>[]>(
    () =>
      columns.map((c) => {
        const meta: DataTableColumnMeta<ReportRow> = {
          numeric: c.kind === "money",
          total:
            c.kind === "money" && c.total !== false
              ? (all: ReportRow[]) => formatMoney(all.reduce((s, r) => s + toNum(r[c.key]), 0))
              : undefined,
        };
        return {
          id: c.key,
          accessorKey: c.key,
          header: c.header,
          meta,
          cell: ({ row }) => {
            const v = row.original[c.key];
            let content: React.ReactNode;
            if (v === null || v === undefined || v === "") content = "";
            else if (c.kind === "money") content = formatMoney(toNum(v));
            else if (c.kind === "date") content = formatDate(String(v));
            else if (c.kind === "badge")
              content = (
                <Badge variant={BADGE_VARIANTS[String(v)] ?? "outline"}>{String(v)}</Badge>
              );
            else content = String(v);
            if (c.linkBase && c.linkParamKey && row.original[c.linkParamKey]) {
              return (
                <Link
                  href={`${c.linkBase}${row.original[c.linkParamKey]}`}
                  className="text-primary underline-offset-2 hover:underline"
                >
                  {content}
                </Link>
              );
            }
            return content;
          },
        };
      }),
    [columns]
  );

  const exportColumns = React.useMemo<ExportColumn<ReportRow>[]>(
    () =>
      columns.map((c) => ({
        header: c.header,
        numeric: c.kind === "money",
        accessor: (row: ReportRow) => {
          const v = row[c.key];
          if (c.kind === "money") return toNum(v);
          if (c.kind === "date" && v) return formatDate(String(v));
          return v ?? "";
        },
      })),
    [columns]
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
        <ExportButton rows={rows} columns={exportColumns} fileName={fileName} />
      </div>
      <DataTable columns={columnDefs} data={rows} emptyMessage={emptyMessage} />
    </div>
  );
}
