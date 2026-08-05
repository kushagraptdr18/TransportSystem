"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
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
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { DateInput } from "@/components/data/date-input";
import { MasterCombobox, type MasterOption } from "@/components/data/master-combobox";
import {
  bulkSetVehicleDocStatus,
  saveVehicleDocument,
} from "@/app/(app)/masters/vehicle-documents/actions";

export interface DocStatusRow {
  id: string;
  docTypeId: string;
  docTypeName: string;
  vehicleId: string;
  vehicleNumber: string;
  docNo: string;
  companyName: string;
  entryDate: string; // dd/mm/yyyy
  effectiveDate: string;
  expiryDate: string;
  expiredNow: boolean;
  status: string;
  remarks: string;
}

const STATUSES = [
  { value: "PENDING", label: "Pending" },
  { value: "PROCESSING", label: "Processing" },
  { value: "PROBLEM", label: "Problem" },
  { value: "DONE", label: "Done" },
] as const;

function StatusBadge({ status, remarks }: { status: string; remarks?: string }) {
  if (status === "DONE") return <Badge>Done</Badge>;
  if (status === "PROCESSING") return <Badge variant="secondary">Processing</Badge>;
  if (status === "PROBLEM")
    return (
      <Badge variant="destructive" title={remarks}>
        Problem
      </Badge>
    );
  return <Badge variant="outline">Pending</Badge>;
}

export function DocStatusClient({
  rows,
  docTypeOptions,
  vehicleOptions,
}: {
  rows: DocStatusRow[];
  docTypeOptions: MasterOption[];
  vehicleOptions: MasterOption[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = React.useState<string>("ALL");
  const [vehicleFilter, setVehicleFilter] = React.useState<string | null>(null);
  const [docTypeFilter, setDocTypeFilter] = React.useState<string | null>(null);
  const [q, setQ] = React.useState("");

  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = React.useState<(typeof STATUSES)[number]["value"]>("PROCESSING");
  const [bulkRemarks, setBulkRemarks] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  // edit popup: the registration's basic details
  const [edit, setEdit] = React.useState<DocStatusRow | null>(null);
  const [form, setForm] = React.useState({
    docNo: "",
    companyName: "",
    entryDate: "",
    effectiveDate: "",
    expiryDate: "",
    status: "PENDING",
    remarks: "",
  });

  const openEdit = (r: DocStatusRow) => {
    setEdit(r);
    setForm({
      docNo: r.docNo,
      companyName: r.companyName,
      entryDate: r.entryDate,
      effectiveDate: r.effectiveDate,
      expiryDate: r.expiryDate,
      status: r.status,
      remarks: r.remarks,
    });
  };

  const list = rows.filter((r) => {
    if (statusFilter !== "ALL" && r.status !== statusFilter) return false;
    if (vehicleFilter && r.vehicleId !== vehicleFilter) return false;
    if (docTypeFilter && r.docTypeId !== docTypeFilter) return false;
    if (q) {
      const n = q.toLowerCase();
      if (
        !r.vehicleNumber.toLowerCase().includes(n) &&
        !r.docTypeName.toLowerCase().includes(n) &&
        !r.docNo.toLowerCase().includes(n)
      )
        return false;
    }
    return true;
  });

  const counts = {
    PENDING: rows.filter((r) => r.status === "PENDING").length,
    PROCESSING: rows.filter((r) => r.status === "PROCESSING").length,
    PROBLEM: rows.filter((r) => r.status === "PROBLEM").length,
    DONE: rows.filter((r) => r.status === "DONE").length,
  };

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
        toast({ title: `${selected.size} document(s) marked ${STATUSES.find((s) => s.value === bulkStatus)?.label}` });
        setSelected(new Set());
        setBulkRemarks("");
        router.refresh();
      } else toast({ variant: "destructive", title: res.error });
    } finally {
      setSaving(false);
    }
  };

  const toIso = (t: string) => {
    const m = t.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
  };

  const submitEdit = async () => {
    if (!edit) return;
    if (form.status === "PROBLEM" && !form.remarks.trim()) {
      toast({ variant: "destructive", title: "Problem status needs remarks — likhiye kya dikkat hai" });
      return;
    }
    setSaving(true);
    try {
      const res = await saveVehicleDocument({
        id: edit.id,
        docTypeId: edit.docTypeId,
        vehicleId: edit.vehicleId,
        docNo: form.docNo || null,
        companyName: form.companyName || null,
        entryDate: toIso(form.entryDate) || form.entryDate,
        effectiveDate: form.effectiveDate ? toIso(form.effectiveDate) : null,
        expiryDate: form.expiryDate ? toIso(form.expiryDate) : null,
        status: form.status,
        remarks: form.remarks || null,
      });
      if (res.ok) {
        toast({ title: `${edit.vehicleNumber} — ${edit.docTypeName} updated` });
        setEdit(null);
        router.refresh();
      } else toast({ variant: "destructive", title: res.error });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 p-4">
      <div>
        <h1 className="page-title">Document Registration Status</h1>
        <p className="text-sm text-muted-foreground">
          Renewal workflow — tick rows for a bulk status, or Edit a single document&apos;s
          details. Problem status always needs the reason.
        </p>
      </div>

      {/* status chips + filters */}
      <div className="flex flex-wrap items-center gap-2">
        {(["ALL", "PENDING", "PROCESSING", "PROBLEM", "DONE"] as const).map((s) => (
          <Button
            key={s}
            size="sm"
            variant={statusFilter === s ? "default" : "outline"}
            className="h-8"
            onClick={() => setStatusFilter(s)}
          >
            {s === "ALL" ? `All (${rows.length})` : `${STATUSES.find((x) => x.value === s)?.label} (${counts[s]})`}
          </Button>
        ))}
        <div className="w-44">
          <MasterCombobox options={vehicleOptions} value={vehicleFilter} onChange={setVehicleFilter} placeholder="Vehicle..." />
        </div>
        <div className="w-48">
          <MasterCombobox options={docTypeOptions} value={docTypeFilter} onChange={setDocTypeFilter} placeholder="Document type..." />
        </div>
        <div className="w-52">
          <Input className="h-8" placeholder="Search..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {/* bulk bar */}
      <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 p-2">
        <span className="text-xs font-medium">Bulk update ({selected.size} selected):</span>
        {STATUSES.map((s) => (
          <Button
            key={s.value}
            size="sm"
            variant={bulkStatus === s.value ? "default" : "outline"}
            className="h-7 text-xs"
            onClick={() => setBulkStatus(s.value)}
          >
            {s.label}
          </Button>
        ))}
        {bulkStatus === "PROBLEM" && (
          <Input
            className="h-7 w-64 text-xs"
            placeholder="Remarks * (e.g. Fitness Failed)"
            value={bulkRemarks}
            onChange={(e) => setBulkRemarks(e.target.value)}
          />
        )}
        <Button
          size="sm"
          className="h-7 text-xs"
          disabled={saving || selected.size === 0 || (bulkStatus === "PROBLEM" && !bulkRemarks.trim())}
          onClick={() => void applyBulk()}
        >
          {saving ? "Updating..." : "Apply"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={() =>
            setSelected(selected.size === list.length ? new Set() : new Set(list.map((r) => r.id)))
          }
        >
          {selected.size === list.length && list.length > 0 ? "Clear All" : "Select All"}
        </Button>
      </div>

      {/* full list, no pagination */}
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted/80 backdrop-blur">
            <tr>
              {["", "S.No.", "Vehicle No.", "Document", "Doc No", "Company", "Expiry", "Status", "Remarks", "Edit"].map((h) => (
                <th key={h} className="whitespace-nowrap px-2 py-1.5 text-left text-xs font-medium text-muted-foreground">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={10} className="h-20 text-center text-muted-foreground">
                  No documents for this selection.
                </td>
              </tr>
            ) : (
              list.map((r, i) => (
                <tr key={r.id} className="border-t hover:bg-muted/40">
                  <td className="px-2 py-1.5">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-primary"
                      checked={selected.has(r.id)}
                      onChange={() => toggle(r.id)}
                    />
                  </td>
                  <td className="px-2 py-1.5 tabular-nums">{i + 1}</td>
                  <td className="px-2 py-1.5 font-medium">{r.vehicleNumber}</td>
                  <td className="px-2 py-1.5">{r.docTypeName}</td>
                  <td className="px-2 py-1.5">{r.docNo || "—"}</td>
                  <td className="px-2 py-1.5">{r.companyName || "—"}</td>
                  <td className={`whitespace-nowrap px-2 py-1.5 ${r.expiredNow ? "font-medium text-destructive" : ""}`}>
                    {r.expiryDate || "—"}
                  </td>
                  <td className="px-2 py-1.5">
                    <StatusBadge status={r.status} remarks={r.remarks} />
                  </td>
                  <td className="max-w-[220px] truncate px-2 py-1.5 text-xs text-muted-foreground" title={r.remarks}>
                    {r.remarks || ""}
                  </td>
                  <td className="px-2 py-1.5">
                    <Button variant="secondary" size="sm" className="h-7 px-2 text-xs" onClick={() => openEdit(r)}>
                      Edit
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* edit popup: basic registration details */}
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {edit?.vehicleNumber} — {edit?.docTypeName}
            </DialogTitle>
            <DialogDescription>
              Basic registration details. Problem status needs remarks.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Document No</Label>
              <Input className="h-9" value={form.docNo} onChange={(e) => setForm((f) => ({ ...f, docNo: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Company / Issuer</Label>
              <Input className="h-9" value={form.companyName} onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Entry Date *</Label>
              <DateInput className="h-9" value={form.entryDate} onChange={(t) => setForm((f) => ({ ...f, entryDate: t }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Effective Date</Label>
              <DateInput className="h-9" value={form.effectiveDate} onChange={(t) => setForm((f) => ({ ...f, effectiveDate: t }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Expiry Date</Label>
              <DateInput className="h-9" value={form.expiryDate} onChange={(t) => setForm((f) => ({ ...f, expiryDate: t }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <div className="flex flex-wrap gap-1 pt-1">
                {STATUSES.map((s) => (
                  <Button
                    key={s.value}
                    size="sm"
                    variant={form.status === s.value ? "default" : "outline"}
                    className="h-7 text-xs"
                    onClick={() => setForm((f) => ({ ...f, status: s.value }))}
                  >
                    {s.label}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">Remarks {form.status === "PROBLEM" ? "* (reason required)" : ""}</Label>
              <Textarea rows={2} value={form.remarks} onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={submitEdit} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
