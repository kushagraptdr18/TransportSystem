"use client";

import * as React from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";

export interface ExportColumn<TRow> {
  header: string;
  /** Row property key or accessor function. */
  key?: keyof TRow & string;
  accessor?: (row: TRow) => unknown;
  numeric?: boolean;
  width?: number;
}

interface ExportButtonProps<TRow> {
  rows: TRow[];
  columns: ExportColumn<TRow>[];
  fileName?: string;
  sheetName?: string;
  label?: string;
}

export function ExportButton<TRow>({
  rows,
  columns,
  fileName = "export",
  sheetName = "Sheet1",
  label = "Export",
}: ExportButtonProps<TRow>) {
  const [busy, setBusy] = React.useState(false);
  const { toast } = useToast();

  const handleExport = async () => {
    setBusy(true);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet(sheetName);

      ws.columns = columns.map((c) => ({
        header: c.header,
        key: c.key ?? c.header,
        width: c.width ?? Math.max(12, c.header.length + 4),
      }));
      ws.getRow(1).font = { bold: true };

      for (const row of rows) {
        ws.addRow(
          columns.map((c) => {
            const v = c.accessor
              ? c.accessor(row)
              : c.key
                ? (row as Record<string, unknown>)[c.key]
                : "";
            return v ?? "";
          })
        );
      }

      columns.forEach((c, i) => {
        if (c.numeric) {
          ws.getColumn(i + 1).alignment = { horizontal: "right" };
          ws.getColumn(i + 1).numFmt = "#,##0.00";
        }
      });

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${fileName}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Export failed",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    // icon-only below sm - the label is the first thing worth dropping when
    // three or four actions are competing for a phone's width. title and
    // aria-label keep it named for pointer and screen-reader users, and the
    // icon becomes a spinner so progress is still visible with the text gone.
    <Button
      variant="outline"
      size="sm"
      onClick={handleExport}
      disabled={busy || rows.length === 0}
      title={busy ? "Exporting..." : label}
      aria-label={label}
      className="max-sm:px-2.5"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      <span className="hidden sm:inline">{busy ? "Exporting..." : label}</span>
    </Button>
  );
}
