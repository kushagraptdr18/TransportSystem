"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Download, Loader2, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { formatDate, formatMoney } from "@/lib/utils";
import {
  commitAuditChalanImport,
  downloadAuditChalanTemplate,
  previewAuditChalanImport,
  type AuditImportPreview,
} from "./import-actions";

/**
 * Import Excel -> Preview -> Confirm.
 *
 * The preview is the whole point: the user sees exactly what will be stored,
 * including names that match nothing in any master. Unknown names are not
 * flagged, because they are not errors here. The only warnings are structural
 * (unreadable date, blank challan no) plus a duplicate count.
 */
export function AuditImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [preview, setPreview] = React.useState<AuditImportPreview | null>(null);
  const [fileName, setFileName] = React.useState("");
  const [skipDuplicates, setSkipDuplicates] = React.useState(true);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (open) return;
    setPreview(null);
    setFileName("");
    setSkipDuplicates(true);
  }, [open]);

  const template = async () => {
    const res = await downloadAuditChalanTemplate();
    if (!res.ok) {
      toast({ variant: "destructive", title: "Template failed", description: res.error });
      return;
    }
    const bytes = Uint8Array.from(atob(res.base64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "audit-challan-template.xlsx";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const pick = async (file: File) => {
    setBusy(true);
    setFileName(file.name);
    try {
      const fd = new FormData();
      fd.append("file", file);
      setPreview(await previewAuditChalanImport(fd));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const confirm = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      const res = await commitAuditChalanImport(preview.rows, skipDuplicates);
      if (!res.ok) {
        toast({ variant: "destructive", title: "Import failed", description: res.error });
        return;
      }
      toast({
        title: `Imported ${res.imported} record${res.imported === 1 ? "" : "s"}`,
        description: res.skipped > 0 ? `${res.skipped} duplicate row(s) skipped.` : undefined,
      });
      onOpenChange(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const willImport = preview
    ? skipDuplicates
      ? preview.rows.filter((r) => !r.duplicate).length
      : preview.rows.length
    : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Audit Challans from Excel</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void pick(f);
              }}
            />
            <Button variant="outline" size="sm" onClick={template}>
              <Download className="h-4 w-4" />
              Template
            </Button>
            <Button size="sm" onClick={() => fileRef.current?.click()} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Choose File
            </Button>
            {fileName && <span className="text-sm text-muted-foreground">{fileName}</span>}
          </div>

          <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
            Values are stored exactly as they appear in the file. Transport, owner and location
            names are <b>not</b> checked against any master — a name that exists nowhere else in
            the system imports normally and no master record is created.
          </p>

          {preview?.fatal && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{preview.fatal}</span>
            </div>
          )}

          {preview && !preview.fatal && (
            <>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant="secondary">{preview.rows.length} ready</Badge>
                {preview.duplicates > 0 && (
                  <Badge variant="secondary">{preview.duplicates} duplicate</Badge>
                )}
                {preview.errors.length > 0 && (
                  <Badge variant="destructive">{preview.errors.length} unreadable</Badge>
                )}
                <span className="text-muted-foreground">
                  of {preview.totalRows} data row(s) in the file
                </span>
              </div>

              {preview.duplicates > 0 && (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="skip-dupes"
                    checked={skipDuplicates}
                    onCheckedChange={(v) => setSkipDuplicates(v === true)}
                  />
                  <Label htmlFor="skip-dupes" className="text-sm font-normal">
                    Skip rows whose Challan No. + Date already exist in this register
                  </Label>
                </div>
              )}

              {preview.errors.length > 0 && (
                <div className="max-h-32 overflow-y-auto rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
                  {preview.errors.map((e) => (
                    <div key={e}>{e}</div>
                  ))}
                </div>
              )}

              {preview.rows.length > 0 && (
                <div className="max-h-80 overflow-auto rounded-md border">
                  <table className="w-full border-collapse text-xs">
                    <thead className="sticky top-0 bg-muted">
                      <tr>
                        {[
                          "Row",
                          "Challan No.",
                          "Date",
                          "Transport Name",
                          "Owner Name",
                          "PAN Card",
                          "From",
                          "To",
                          "Freight Amt",
                          "Balance",
                        ].map((h) => (
                          <th key={h} className="whitespace-nowrap px-2 py-1 text-left font-medium">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows.slice(0, 200).map((r) => (
                        <tr
                          key={r.rowNo}
                          className={r.duplicate ? "bg-amber-500/10" : undefined}
                        >
                          <td className="px-2 py-1 text-muted-foreground">{r.rowNo}</td>
                          <td className="whitespace-nowrap px-2 py-1">
                            {r.chalanNo}
                            {r.duplicate && (
                              <Badge variant="secondary" className="ml-1 px-1 text-[10px]">
                                dup
                              </Badge>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-2 py-1">
                            {formatDate(r.chalanDate)}
                          </td>
                          <td className="whitespace-nowrap px-2 py-1">{r.transportName}</td>
                          <td className="whitespace-nowrap px-2 py-1">{r.ownerName}</td>
                          <td className="whitespace-nowrap px-2 py-1">{r.panCard}</td>
                          <td className="whitespace-nowrap px-2 py-1">{r.loadingFrom}</td>
                          <td className="whitespace-nowrap px-2 py-1">{r.toLocation}</td>
                          <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums">
                            {formatMoney(r.freightAmount)}
                          </td>
                          <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums">
                            {formatMoney(r.balance)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {preview.rows.length > 200 && (
                    <div className="border-t p-2 text-center text-xs text-muted-foreground">
                      Showing the first 200 of {preview.rows.length} rows — all of them import.
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={confirm} disabled={busy || willImport === 0}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirm Import ({willImport})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
