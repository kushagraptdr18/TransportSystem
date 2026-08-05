"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import type { MasterOption } from "@/components/data/master-combobox";
import { SimpleMaster } from "@/components/masters/simple-master";
import {
  saveVehicleDocument,
  deleteVehicleDocument,
  importVehicleDocuments,
  bulkSetVehicleDocStatus,
} from "@/app/(app)/masters/vehicle-documents/actions";
import { formatDate } from "@/lib/utils";
import { FileUploadField } from "@/components/data/file-upload-field";

export interface VehicleDocRow {
  id: string;
  docTypeId: string;
  docTypeName: string;
  vehicleId: string;
  vehicleNumber: string;
  docNo: string | null;
  companyName: string | null;
  status: string;
  entryDate: string; // dd/mm/yyyy
  effectiveDate: string;
  expiryDate: string;
  expiredNow: boolean;
  remarks: string | null;
  filePath: string | null;
  fileName: string | null;
}

/** renewal workflow badge: Pending -> Processing -> Done; Problem = attention */
function StatusBadge({ status, remarks }: { status: string; remarks?: string | null }) {
  if (status === "DONE") return <Badge>Done</Badge>;
  if (status === "PROCESSING") return <Badge variant="secondary">Processing</Badge>;
  if (status === "PROBLEM")
    return (
      <Badge variant="destructive" title={remarks ?? undefined}>
        Problem
      </Badge>
    );
  return <Badge variant="outline">Pending</Badge>;
}

const columns: ColumnDef<VehicleDocRow, unknown>[] = [
  { accessorKey: "docTypeName", header: "Document" },
  { accessorKey: "vehicleNumber", header: "Vehicle" },
  { accessorKey: "docNo", header: "Doc No" },
  { accessorKey: "companyName", header: "Company" },
  { accessorKey: "entryDate", header: "Entry" },
  {
    accessorKey: "expiryDate",
    header: "Expiry",
    cell: ({ row }) => (
      <span className={row.original.expiredNow ? "font-medium text-destructive" : undefined}>
        {row.original.expiryDate}
      </span>
    ),
  },
  {
    id: "doc",
    header: "Document",
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
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => (
      <span className="flex items-center gap-1">
        <StatusBadge status={row.original.status} remarks={row.original.remarks} />
        {row.original.status === "PROBLEM" && row.original.remarks && (
          <span className="max-w-[160px] truncate text-[11px] text-muted-foreground" title={row.original.remarks}>
            {row.original.remarks}
          </span>
        )}
      </span>
    ),
  },
];

const BULK_STATUSES = [
  { value: "PENDING", label: "Pending" },
  { value: "PROCESSING", label: "Processing" },
  { value: "PROBLEM", label: "Problem" },
  { value: "DONE", label: "Done" },
] as const;

export function VehicleDocumentsClient({
  rows,
  docTypeOptions,
  vehicleOptions,
  canDelete,
  embedded,
}: {
  rows: VehicleDocRow[];
  docTypeOptions: MasterOption[];
  vehicleOptions: MasterOption[];
  canDelete: boolean;
  embedded?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [bulkOpen, setBulkOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = React.useState<(typeof BULK_STATUSES)[number]["value"]>("PROCESSING");
  const [bulkRemarks, setBulkRemarks] = React.useState("");
  const [bulkQ, setBulkQ] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const bulkList = rows.filter((r) => {
    if (!bulkQ) return true;
    const n = bulkQ.toLowerCase();
    return (
      r.vehicleNumber.toLowerCase().includes(n) ||
      r.docTypeName.toLowerCase().includes(n) ||
      (r.docNo ?? "").toLowerCase().includes(n)
    );
  });

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const applyBulk = async () => {
    setSaving(true);
    try {
      const res = await bulkSetVehicleDocStatus({
        ids: Array.from(selected),
        status: bulkStatus,
        remarks: bulkRemarks || null,
      });
      if (res.ok) {
        toast({
          title: `${selected.size} registration(s) marked ${BULK_STATUSES.find((s) => s.value === bulkStatus)?.label}`,
        });
        setBulkOpen(false);
        setSelected(new Set());
        setBulkRemarks("");
        router.refresh();
      } else toast({ variant: "destructive", title: res.error });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => setBulkOpen(true)}>
          Bulk Status Update
        </Button>
      </div>

      <SimpleMaster
        title="Document Registration"
        embedded={embedded}
        newLabel="New Registration"
        rows={rows}
        columns={columns}
        exportColumns={[
          { header: "Document", key: "docTypeName" },
          { header: "Vehicle", key: "vehicleNumber" },
          { header: "Doc No", key: "docNo" },
          { header: "Company", key: "companyName" },
          { header: "Entry", key: "entryDate" },
          { header: "Effective", key: "effectiveDate" },
          { header: "Expiry", key: "expiryDate" },
          { header: "Status", key: "status" },
          { header: "Remarks", key: "remarks" },
        ]}
        exportName="vehicle-documents"
        filters={[
          { type: "combobox", key: "vehicle", label: "Vehicle", options: vehicleOptions },
          { type: "combobox", key: "docType", label: "Document Type", options: docTypeOptions },
          {
            type: "select",
            key: "due",
            label: "Expiry",
            options: [
              { value: "expired", label: "Expired" },
              { value: "30", label: "Due in 30 days" },
            ],
          },
          {
            type: "select",
            key: "status",
            label: "Status",
            options: [
              { value: "PENDING", label: "Pending" },
              { value: "PROCESSING", label: "Processing" },
              { value: "PROBLEM", label: "Problem" },
              { value: "DONE", label: "Done" },
            ],
          },
        ]}
        fields={[
          { name: "docTypeId", label: "Document Type *", type: "combobox", options: docTypeOptions },
          { name: "vehicleId", label: "Vehicle *", type: "combobox", options: vehicleOptions },
          { name: "docNo", label: "Document No", type: "text" },
          { name: "companyName", label: "Company / Issuer", type: "text" },
          { name: "entryDate", label: "Entry Date *", type: "date" },
          { name: "effectiveDate", label: "Effective Date", type: "date" },
          { name: "expiryDate", label: "Expiry Date", type: "date" },
          {
            name: "status",
            label: "Status (Problem needs remarks)",
            type: "radio",
            options: [
              { value: "PENDING", label: "Pending" },
              { value: "PROCESSING", label: "Processing" },
              { value: "PROBLEM", label: "Problem" },
              { value: "DONE", label: "Done" },
            ],
          },
          { name: "remarks", label: "Remarks (mandatory for Problem)", type: "textarea", span2: true },
        ]}
        defaults={{ status: "PENDING", entryDate: formatDate(new Date()), filePath: null, fileName: null }}
        renderExtra={(form, set) => (
          <FileUploadField
            label="Upload Document (registration copy)"
            endpoint="/api/uploads/docreg"
            filePath={(form.filePath as string) ?? null}
            fileName={(form.fileName as string) ?? null}
            onChange={(fp, fn) => {
              set("filePath", fp);
              set("fileName", fn);
            }}
          />
        )}
        toForm={(r) => ({ ...r })}
        getId={(r) => r.id}
        save={saveVehicleDocument}
        remove={deleteVehicleDocument}
        importConfig={{
          action: importVehicleDocuments,
          templateHeaders: ["Vehicle No", "Document Type", "Entry Date", "Doc No", "Effective Date", "Expiry Date", "Status", "Company", "Remarks"],
          templateExample: ["CG04AB1234", "INSURANCE", "01/07/2026", "POL123", "01/07/2026", "30/06/2027", "DONE", "ICICI LOMBARD", ""],
          templateName: "document-registrations",
        }}
        canDelete={canDelete}
      />

      {/* bulk status dialog: tick registrations, pick one status, apply once */}
      <Dialog open={bulkOpen} onOpenChange={(o) => !o && setBulkOpen(false)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Bulk Status Update</DialogTitle>
            <DialogDescription>
              Tick the registrations, choose the status, apply — all selected rows update in one
              click. Individual rows can still be changed later from Edit.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap items-center gap-2">
            {BULK_STATUSES.map((s) => (
              <Button
                key={s.value}
                size="sm"
                variant={bulkStatus === s.value ? "default" : "outline"}
                className="h-8"
                onClick={() => setBulkStatus(s.value)}
              >
                {s.label}
              </Button>
            ))}
            <Input
              className="h-8 w-52"
              placeholder="Filter vehicle / document..."
              value={bulkQ}
              onChange={(e) => setBulkQ(e.target.value)}
            />
            <Button
              variant="ghost"
              size="sm"
              className="h-8"
              onClick={() =>
                setSelected(
                  selected.size === bulkList.length ? new Set() : new Set(bulkList.map((r) => r.id))
                )
              }
            >
              {selected.size === bulkList.length ? "Clear All" : "Select All"}
            </Button>
            <span className="text-xs text-muted-foreground">{selected.size} selected</span>
          </div>

          {bulkStatus === "PROBLEM" && (
            <div className="space-y-1">
              <Label className="text-xs">Remarks * (reason — e.g. Fitness Failed, RTO Query Pending)</Label>
              <Input className="h-9" value={bulkRemarks} onChange={(e) => setBulkRemarks(e.target.value)} />
            </div>
          )}

          <div className="max-h-72 overflow-y-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/80">
                <tr>
                  {["", "Vehicle", "Document", "Doc No", "Expiry", "Current Status"].map((h) => (
                    <th key={h} className="px-2 py-1 text-left text-xs font-medium text-muted-foreground">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bulkList.map((r) => (
                  <tr
                    key={r.id}
                    className="cursor-pointer border-t hover:bg-muted/40"
                    onClick={() => toggle(r.id)}
                  >
                    <td className="px-2 py-1">
                      <input type="checkbox" readOnly checked={selected.has(r.id)} className="h-4 w-4 accent-primary" />
                    </td>
                    <td className="px-2 py-1 font-medium">{r.vehicleNumber}</td>
                    <td className="px-2 py-1">{r.docTypeName}</td>
                    <td className="px-2 py-1">{r.docNo ?? ""}</td>
                    <td className={`px-2 py-1 ${r.expiredNow ? "font-medium text-destructive" : ""}`}>{r.expiryDate}</td>
                    <td className="px-2 py-1">
                      <StatusBadge status={r.status} remarks={r.remarks} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              onClick={applyBulk}
              disabled={saving || selected.size === 0 || (bulkStatus === "PROBLEM" && !bulkRemarks.trim())}
            >
              {saving ? "Updating..." : `Apply to ${selected.size} selected`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
