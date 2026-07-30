"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { formatDate, parseDdMmYyyy } from "@/lib/utils";
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
import { DataTable, type DataTableColumnMeta } from "@/components/data/data-table";
import { DateInput } from "@/components/data/date-input";
import { ExportButton } from "@/components/data/export-button";
import { FilterBar } from "@/components/data/filter-bar";
import { MasterCombobox, type MasterOption } from "@/components/data/master-combobox";
import { deleteAdblueTxn, saveAdblueTxn } from "@/app/(app)/vehicle/adblue/actions";

export interface AdblueRow {
  id: string;
  type: string; // REFILL | ISSUE
  date: string;
  supplierName: string;
  vehicleId: string | null;
  vehicle: string;
  destination: string;
  qty: number;
  amount: number;
  bankPartyId: string | null;
  refNo: string;
  remarks: string;
}

function textToIso(text: string): string {
  const d = parseDdMmYyyy(text);
  if (!d) return "";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

const litres = (n: number) => `${n.toLocaleString("en-IN")} L`;

const emptyForm = {
  id: null as string | null,
  type: "REFILL" as "REFILL" | "ISSUE",
  dateText: formatDate(new Date()),
  supplierName: "",
  vehicleId: null as string | null,
  destination: "",
  qty: 0,
  amount: 0,
  bankPartyId: null as string | null,
  refNo: "",
  remarks: "",
};

export function AdblueClient({
  rows,
  totals,
  vehicleOptions,
  bankOptions,
  canDelete,
}: {
  rows: AdblueRow[];
  totals: { totalRefill: number; totalIssued: number; closing: number };
  vehicleOptions: MasterOption[];
  bankOptions: MasterOption[];
  canDelete: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState(emptyForm);
  const set = (p: Partial<typeof emptyForm>) => setForm((f) => ({ ...f, ...p }));

  const openNew = (type: "REFILL" | "ISSUE") => {
    setForm({ ...emptyForm, type });
    setOpen(true);
  };

  const submit = async () => {
    setBusy(true);
    try {
      const res = await saveAdblueTxn({
        id: form.id,
        type: form.type,
        date: textToIso(form.dateText),
        supplierName: form.supplierName,
        vehicleId: form.vehicleId,
        destination: form.destination,
        qty: form.qty,
        amount: form.amount,
        bankPartyId: form.bankPartyId,
        refNo: form.refNo,
        remarks: form.remarks,
      });
      if (res.ok) {
        toast({ title: `AdBlue ${form.type === "REFILL" ? "refill" : "issue"} saved — stock updated` });
        setOpen(false);
        router.refresh();
      } else toast({ variant: "destructive", title: "Save failed", description: res.error });
    } finally {
      setBusy(false);
    }
  };

  const columns: ColumnDef<AdblueRow>[] = [
    { accessorKey: "date", header: "Date", cell: ({ row }) => formatDate(row.original.date) },
    {
      accessorKey: "type",
      header: "Type",
      cell: ({ row }) =>
        row.original.type === "REFILL" ? (
          <Badge>REFILL</Badge>
        ) : (
          <Badge variant="destructive">ISSUE</Badge>
        ),
    },
    { accessorKey: "supplierName", header: "Supplier" },
    { accessorKey: "vehicle", header: "Vehicle" },
    { accessorKey: "destination", header: "Destination" },
    {
      accessorKey: "qty",
      header: "Litres",
      cell: ({ row }) => (
        <span className={row.original.type === "REFILL" ? "text-emerald-600" : ""}>
          {row.original.type === "REFILL" ? "+" : "−"}
          {row.original.qty.toLocaleString("en-IN")}
        </span>
      ),
      meta: { numeric: true } satisfies DataTableColumnMeta<AdblueRow>,
    },
    { accessorKey: "refNo", header: "Challan / Bill No" },
    { accessorKey: "remarks", header: "Remarks" },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => {
              setForm({
                id: row.original.id,
                type: row.original.type as "REFILL" | "ISSUE",
                dateText: formatDate(row.original.date),
                supplierName: row.original.supplierName,
                vehicleId: row.original.vehicleId,
                destination: row.original.destination,
                qty: row.original.qty,
                amount: row.original.amount,
                bankPartyId: row.original.bankPartyId,
                refNo: row.original.refNo,
                remarks: row.original.remarks,
              });
              setOpen(true);
            }}
          >
            Edit
          </Button>
          {canDelete && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-destructive"
              onClick={async () => {
                if (!confirm("Delete this entry? Stock balance will adjust.")) return;
                const res = await deleteAdblueTxn(row.original.id);
                if (res.ok) {
                  toast({ title: "Entry deleted" });
                  router.refresh();
                } else toast({ variant: "destructive", title: "Delete failed", description: res.error });
              }}
            >
              Delete
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">AdBlue (Urea) Stock</h1>
        <div className="flex gap-2">
          <ExportButton
            rows={rows}
            fileName="adblue-register"
            sheetName="AdBlue Register"
            columns={[
              { header: "Date", accessor: (r) => formatDate(r.date) },
              { header: "Type", key: "type" },
              { header: "Supplier", key: "supplierName" },
              { header: "Vehicle", key: "vehicle" },
              { header: "Destination", key: "destination" },
              { header: "Litres", key: "qty", numeric: true },
              { header: "Challan / Bill No", key: "refNo" },
              { header: "Remarks", key: "remarks" },
            ]}
          />
          <Button variant="outline" size="sm" onClick={() => openNew("REFILL")}>
            <Plus className="h-4 w-4" /> Total Refill
          </Button>
          <Button size="sm" onClick={() => openNew("ISSUE")}>
            <Plus className="h-4 w-4" /> Issue to Vehicle
          </Button>
        </div>
      </div>

      {/* stock position */}
      <div className="grid grid-cols-3 gap-2 sm:max-w-xl">
        {(
          [
            ["Total Refill", totals.totalRefill],
            ["Total Issued", totals.totalIssued],
            ["Closing Balance", totals.closing],
          ] as [string, number][]
        ).map(([label, v]) => (
          <div key={label} className="rounded-md border p-3">
            <div className="text-[11px] text-muted-foreground">{label}</div>
            <div className={`text-lg font-semibold ${label === "Closing Balance" && v < 0 ? "text-destructive" : ""}`}>
              {litres(v)}
            </div>
          </div>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        Litre-only stock register — no purchase value, no vouchers, no ledger effect. The amount is
        computed only inside a trip sheet (issued litres × the urea rate entered there).
      </p>

      <FilterBar
        filters={[
          {
            type: "select",
            key: "type",
            label: "Type",
            options: [
              { value: "REFILL", label: "Refill (Stock In)" },
              { value: "ISSUE", label: "Issue (Consumption)" },
            ],
          },
          { type: "combobox", key: "vehicle", label: "Vehicle", options: vehicleOptions },
          { type: "daterange", key: "date", label: "Date" },
        ]}
      />
      <DataTable columns={columns} data={rows} emptyMessage="No AdBlue entries yet." />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {form.id ? "Edit" : "New"} AdBlue {form.type === "REFILL" ? "Refill (Stock In)" : "Issue (Vehicle Consumption)"}
            </DialogTitle>
            <DialogDescription>
              Litres only — stock {form.type === "REFILL" ? "increases" : "decreases"}; no
              accounting entry is created.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Date *</Label>
              <DateInput className="h-8" value={form.dateText} onChange={(t) => set({ dateText: t })} />
            </div>
            {form.type === "REFILL" ? (
              <div className="space-y-1">
                <Label className="text-xs">Supplier Name (optional)</Label>
                <Input
                  className="h-8"
                  value={form.supplierName}
                  onChange={(e) => set({ supplierName: e.target.value })}
                />
              </div>
            ) : (
              <div className="space-y-1">
                <Label className="text-xs">Destination</Label>
                <Input
                  className="h-8"
                  value={form.destination}
                  onChange={(e) => set({ destination: e.target.value })}
                />
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs">
                Vehicle No {form.type === "ISSUE" ? "*" : "(optional)"}
              </Label>
              <MasterCombobox
                options={vehicleOptions}
                value={form.vehicleId}
                onChange={(v) => set({ vehicleId: v })}
                placeholder="Select vehicle..."
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">
                {form.type === "REFILL" ? "Total Refill (Litres) *" : "Quantity Issued (Litres) *"}
              </Label>
              <Input
                type="number"
                step="0.01"
                className="h-8 text-right"
                value={form.qty ? String(form.qty) : ""}
                onChange={(e) => set({ qty: Number(e.target.value) || 0 })}
              />
            </div>
            {form.type === "REFILL" && (
              <>
                <div className="space-y-1">
                  <Label className="text-xs">Challan / Bill No (optional)</Label>
                  <Input className="h-8" value={form.refNo} onChange={(e) => set({ refNo: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Purchase Amount (optional)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    className="h-8 text-right"
                    value={form.amount ? String(form.amount) : ""}
                    onChange={(e) => set({ amount: Number(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Paid From (Cash / Bank){form.amount > 0 ? " *" : ""}</Label>
                  <MasterCombobox
                    options={bankOptions}
                    value={form.bankPartyId}
                    onChange={(v) => set({ bankPartyId: v })}
                    placeholder="Select account..."
                  />
                  {form.amount > 0 && (
                    <p className="text-[11px] text-muted-foreground">
                      Amount posts to the Urea Expense Ledger; no vehicle-wise allocation happens
                      at purchase time.
                    </p>
                  )}
                </div>
              </>
            )}
            <div className="space-y-1">
              <Label className="text-xs">Remarks</Label>
              <Input className="h-8" value={form.remarks} onChange={(e) => set({ remarks: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button
              disabled={busy || form.qty <= 0 || (form.type === "ISSUE" && !form.vehicleId)}
              onClick={submit}
            >
              {busy ? "Saving..." : "Save Entry"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
