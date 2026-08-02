"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Download, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import type { ImportSummary } from "@/lib/import-core";

export interface ImportConfig {
  /** Server action receiving FormData with a `file` entry. */
  action: (fd: FormData) => Promise<ImportSummary>;
  /** Column headers for the downloadable sample template. */
  templateHeaders: string[];
  /** One example row shown in the template (optional). */
  templateExample?: string[];
  templateName: string; // e.g. "cities"
}

/**
 * "Import from Excel/CSV" + "Sample Template" pair used on every master.
 * Shows an import summary toast: Imported / Updated / Skipped / Failed with
 * the first row-wise errors inline.
 */
export function ImportButton({ config }: { config: ImportConfig }) {
  const router = useRouter();
  const { toast } = useToast();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);

  const downloadTemplate = () => {
    const lines = [config.templateHeaders.join(",")];
    if (config.templateExample) {
      lines.push(
        config.templateExample.map((c) => (c.includes(",") ? `"${c}"` : c)).join(",")
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${config.templateName}-template.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const runImport = async (file: File) => {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const s = await config.action(fd);
      toast({
        variant: s.failed > 0 || !s.ok ? "destructive" : undefined,
        title: `Import finished — Imported: ${s.imported} · Updated: ${s.updated} · Skipped: ${s.skipped} · Failed: ${s.failed}`,
        description: s.errors.slice(0, 4).join(" | ") || undefined,
      });
      router.refresh();
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <span className="flex items-center gap-1">
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void runImport(f);
        }}
      />
      {/* labels drop below sm; the title text was already carrying the real
          explanation, so nothing is lost that a tooltip did not already say */}
      <Button
        type="button"
        variant="outline"
        size="sm"
        title="Download a sample template with the expected columns"
        aria-label="Download template"
        onClick={downloadTemplate}
        className="max-sm:px-2.5"
      >
        <Download className="h-4 w-4" />
        <span className="hidden sm:inline">Template</span>
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => fileRef.current?.click()}
        title="Import records from an Excel (.xlsx) or CSV file"
        aria-label="Import"
        className="max-sm:px-2.5"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        <span className="hidden sm:inline">{busy ? "Importing..." : "Import"}</span>
      </Button>
    </span>
  );
}
