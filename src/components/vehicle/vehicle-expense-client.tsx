"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus, Trash2 } from "lucide-react";
import { formatDate, formatMoney, parseDdMmYyyy } from "@/lib/utils";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { DataTable, type DataTableColumnMeta } from "@/components/data/data-table";
import { DateInput } from "@/components/data/date-input";
import { ExportButton } from "@/components/data/export-button";
import { FileUploadField } from "@/components/data/file-upload-field";
import { FilterBar } from "@/components/data/filter-bar";
import { MasterCombobox, type MasterOption } from "@/components/data/master-combobox";
import {
  deleteVehicleExpenseTxn,
  saveVehicleExpenseTxn,
} from "@/app/(app)/vehicle/expenses/actions";

export interface VehicleExpenseItemRow {
  vehicleId: string;
  vehicle: string;
  ownership: string;
  amount: number;
}

export interface VehicleExpenseRow {
  id: string;
  voucherNo: string;
  date: string;
  txnType: string;
  headId: string;
  head: string;
  partyId: string | null;
  party: string;
  paymentMode: string; // "" = credit
  bankPartyId: string | null;
  bank: string;
  amount: number;
  refNo: string;
  remarks: string;
  attachmentPath: string | null;
  attachmentName: string;
  items: VehicleExpenseItemRow[];
}

function textToIso(text: string): string {
  const d = parseDdMmYyyy(text);
  if (!d) return "";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

interface FormItem {
  vehicleId: string | null;
  amount: number;
}

const emptyForm = {
  id: null as string | null,
  dateText: formatDate(new Date()),
  txnType: "EXPENSE" as "EXPENSE" | "INCOME",
  headId: null as string | null,
  partyId: null as string | null,
  paymentMode: "CASH" as "CASH" | "BANK" | "CREDIT",
  bankPartyId: null as string | null,
  refNo: "",
  remarks: "",
  attachmentPath: null as string | null,
  attachmentName: "",
  items: [{ vehicleId: null, amount: 0 }] as FormItem[],
};

export function VehicleExpenseClient({
  rows,
  vehicleOptions,
  headOptions,
  partyOptions,
  bankOptions,
  canDelete,
}: {
  rows: VehicleExpenseRow[];
  vehicleOptions: MasterOption[];
  headOptions: MasterOption[];
  partyOptions: MasterOption[];
  bankOptions: MasterOption[];
  canDelete: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState(emptyForm);
  const set = (p: Partial<typeof emptyForm>) => setForm((f) => ({ ...f, ...p }));
  const setItem = (idx: number, p: Partial<FormItem>) =>
    setForm((f) => ({ ...f, items: f.items.map((it, i) => (i === idx ? { ...it, ...p } : it)) }));

  const validItems = form.items.filter((i) => i.vehicleId && i.amount > 0);
  const total = Math.round(validItems.reduce((s, i) => s + i.amount, 0) * 100) / 100;
  const heads = headOptions.filter((h) => h.meta === form.txnType);

  /** split a total equally across the current vehicle rows */
  const splitEqually = (grand: number) => {
    const n = form.items.filter((i) => i.vehicleId).length || form.items.length;
    if (!n || grand <= 0) return;
    const share = Math.round((grand / n) * 100) / 100;
    setForm((f) => ({ ...f, items: f.items.map((it) => ({ ...it, amount: share })) }));
  };

  const openEdit = (row: VehicleExpenseRow) => {
    setForm({
      id: row.id,
      dateText: formatDate(row.date),
      txnType: row.txnType as "EXPENSE" | "INCOME",
      headId: row.headId,
      partyId: row.partyId,
      paymentMode: (row.paymentMode || "CREDIT") as "CASH" | "BANK" | "CREDIT",
      bankPartyId: row.bankPartyId,
      refNo: row.refNo,
      remarks: row.remarks,
      attachmentPath: row.attachmentPath,
      attachmentName: row.attachmentName,
      items: row.items.map((i) => ({ vehicleId: i.vehicleId, amount: i.amount })),
    });
    setOpen(true);
  };

  const submit = async () => {
    setBusy(true);
    try {
      const res = await saveVehicleExpenseTxn({
        id: form.id,
        date: textToIso(form.dateText),
        txnType: form.txnType,
        headId: form.headId ?? "",
        partyId: form.partyId,
        paymentMode: form.paymentMode === "CREDIT" ? null : form.paymentMode,
        bankPartyId: form.paymentMode === "CREDIT" ? null : form.bankPartyId,
        refNo: form.refNo,
        remarks: form.remarks,
        attachmentPath: form.attachmentPath,
        attachmentName: form.attachmentName,
        items: validItems.map((i) => ({ vehicleId: i.vehicleId!, amount: i.amount })),
      });
      if (res.ok) {
        toast({
          title: `${res.voucherNo} saved`,
          description:
            "Single accounting voucher posted; relative-vehicle shares moved to owner ledgers.",
        });
        setOpen(false);
        router.refresh();
      } else toast({ variant: "destructive", title: "Save failed", description: res.error });
    } finally {
      setBusy(false);
    }
  };

  const columns: ColumnDef<VehicleExpenseRow>[] = [
    { accessorKey: "voucherNo", header: "Voucher No" },
    { accessorKey: "date", header: "Date", cell: ({ row }) => formatDate(row.original.date) },
    { accessorKey: "head", header: "Head" },
    {
      id: "vehicles",
      header: "Vehicles",
      cell: ({ row }) => (
        <div className="flex max-w-md flex-wrap gap-1">
          {row.original.items.map((i, idx) => (
            <Badge key={idx} variant="outline" className="font-normal">
              {i.vehicle}
              {i.ownership === "RELATIVE" ? " (Rel)" : ""} — {formatMoney(i.amount)}
            </Badge>
          ))}
        </div>
      ),
    },
    { accessorKey: "party", header: "Supplier / Party" },
    {
      accessorKey: "paymentMode",
      header: "Mode",
      cell: ({ row }) =>
        row.original.paymentMode ? (
          <Badge variant="secondary">{row.original.paymentMode}</Badge>
        ) : (
          <Badge variant="outline">CREDIT</Badge>
        ),
    },
    {
      accessorKey: "amount",
      header: "Total Amount",
      cell: ({ row }) => formatMoney(row.original.amount),
      meta: {
        numeric: true,
        total: (rs) => formatMoney(rs.reduce((s, r) => s + r.amount, 0)),
      } satisfies DataTableColumnMeta<VehicleExpenseRow>,
    },
    { accessorKey: "refNo", header: "Ref No" },
    {
      id: "attachment",
      header: "Bill",
      cell: ({ row }) =>
        row.original.attachmentPath ? (
          <a
            href={`/api/uploads/${row.original.attachmentPath}`}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-primary underline"
            onClick={(e) => e.stopPropagation()}
          >
            View
          </a>
        ) : null,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => openEdit(row.original)}
          >
            Edit
          </Button>
          {canDelete && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-destructive"
              onClick={async () => {
                if (!confirm(`Delete ${row.original.voucherNo}? Ledger will be reversed.`)) return;
                const res = await deleteVehicleExpenseTxn(row.original.id);
                if (res.ok) {
                  toast({ title: `${row.original.voucherNo} deleted` });
                  router.refresh();
                } else
                  toast({ variant: "destructive", title: "Delete failed", description: res.error });
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
        <h1 className="text-xl font-semibold">Vehicle Expenses</h1>
        <div className="flex gap-2">
          <ExportButton
            rows={rows.flatMap((r) =>
              r.items.map((i) => ({
                ...r,
                vehicle: i.vehicle,
                ownership: i.ownership,
                itemAmount: i.amount,
              }))
            )}
            fileName="vehicle-expense-register"
            sheetName="Vehicle Expenses"
            columns={[
              { header: "Voucher No", key: "voucherNo" },
              { header: "Date", accessor: (r) => formatDate(String(r.date)) },
              { header: "Type", key: "txnType" },
              { header: "Head", key: "head" },
              { header: "Vehicle", key: "vehicle" },
              { header: "Vehicle Type", key: "ownership" },
              { header: "Vehicle Amount", key: "itemAmount", numeric: true },
              { header: "Supplier / Party", key: "party" },
              { header: "Mode", accessor: (r) => r.paymentMode || "CREDIT" },
              { header: "Ref No", key: "refNo" },
              { header: "Remarks", key: "remarks" },
            ]}
          />
          <Button size="sm" onClick={() => { setForm(emptyForm); setOpen(true); }}>
            <Plus className="h-4 w-4" /> New Entry
          </Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        One bill, unlimited vehicles — a single accounting voucher with vehicle-wise records.
        Relative-vehicle shares transfer automatically to the owner&apos;s ledger. Trip sheets only
        fetch Diesel / Toll from here.
      </p>
      <FilterBar
        filters={[
          { type: "text", key: "q", label: "Voucher / Ref No..." },
          { type: "combobox", key: "vehicle", label: "Vehicle", options: vehicleOptions },
          { type: "combobox", key: "head", label: "Head", options: headOptions },
          {
            type: "select",
            key: "ownership",
            label: "Vehicle Type",
            options: [
              { value: "OWNER", label: "Own" },
              { value: "RELATIVE", label: "Relative" },
              { value: "BROKER", label: "Market / Broker" },
            ],
          },
          {
            type: "select",
            key: "type",
            label: "Type",
            options: [
              { value: "EXPENSE", label: "Expense" },
              { value: "INCOME", label: "Income" },
            ],
          },
          { type: "daterange", key: "date", label: "Date" },
        ]}
      />
      <DataTable columns={columns} data={rows} emptyMessage="No vehicle expenses yet." />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[95vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              {form.id ? "Edit" : "New"} Vehicle {form.txnType === "EXPENSE" ? "Expense" : "Income"}
              {form.id ? "" : " — voucher number auto-generates"}
            </DialogTitle>
            <DialogDescription>
              Heads come from the common Income &amp; Expense Head master. Add unlimited vehicles —
              the total is the sum of vehicle amounts, booked as ONE accounting voucher.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-xs">Date *</Label>
              <DateInput className="h-8" value={form.dateText} onChange={(t) => set({ dateText: t })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Type</Label>
              <Select
                value={form.txnType}
                onValueChange={(v) => set({ txnType: v as "EXPENSE" | "INCOME", headId: null })}
              >
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="EXPENSE">Expense (default)</SelectItem>
                  <SelectItem value="INCOME">Income</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">
                {form.txnType === "EXPENSE" ? "Expense Head *" : "Income Head *"}
              </Label>
              <MasterCombobox
                options={heads}
                value={form.headId}
                onChange={(v) => set({ headId: v })}
                placeholder="From heads master..."
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Supplier / Party (optional)</Label>
              <MasterCombobox
                options={partyOptions}
                value={form.partyId}
                onChange={(v) => set({ partyId: v })}
                placeholder="None..."
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Payment Mode (optional)</Label>
              <Select
                value={form.paymentMode}
                onValueChange={(v) =>
                  set({
                    paymentMode: v as "CASH" | "BANK" | "CREDIT",
                    ...(v === "CREDIT" ? { bankPartyId: null } : {}),
                  })
                }
              >
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CASH">Cash</SelectItem>
                  <SelectItem value="BANK">Bank</SelectItem>
                  <SelectItem value="CREDIT">Credit — settle later</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.paymentMode !== "CREDIT" && (
              <div className="space-y-1">
                <Label className="text-xs">Cash / Bank Account *</Label>
                <MasterCombobox
                  options={bankOptions.filter((b) =>
                    form.paymentMode === "CASH" ? b.meta === "CASH" : b.meta === "BANK"
                  )}
                  value={form.bankPartyId}
                  onChange={(v) => set({ bankPartyId: v })}
                  placeholder="Select account..."
                />
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs">Reference / Bill No</Label>
              <Input className="h-8" value={form.refNo} onChange={(e) => set({ refNo: e.target.value })} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">Remarks</Label>
              <Input className="h-8" value={form.remarks} onChange={(e) => set({ remarks: e.target.value })} />
            </div>
          </div>

          {/* vehicle allocation grid */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label className="text-xs font-medium">
                Vehicle Selection ({validItems.length} vehicle{validItems.length === 1 ? "" : "s"} —
                total {formatMoney(total)})
              </Label>
              <div className="flex gap-2">
                <SplitControl onSplit={splitEqually} />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7"
                  onClick={() =>
                    set({ items: [...form.items, { vehicleId: null, amount: 0 }] })
                  }
                >
                  <Plus className="h-3 w-3" /> Add Vehicle
                </Button>
              </div>
            </div>
            {form.items.map((it, i) => (
              <div key={i} className="grid grid-cols-[1fr_140px_2rem] gap-1">
                <MasterCombobox
                  options={vehicleOptions.filter(
                    (v) =>
                      v.value === it.vehicleId ||
                      !form.items.some((x) => x.vehicleId === v.value)
                  )}
                  value={it.vehicleId}
                  onChange={(v) => setItem(i, { vehicleId: v })}
                  placeholder="Select vehicle..."
                />
                <Input
                  type="number"
                  className="h-9 text-right"
                  placeholder="Amount"
                  value={it.amount ? String(it.amount) : ""}
                  onChange={(e) => setItem(i, { amount: Number(e.target.value) || 0 })}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-9 w-8 p-0 text-destructive"
                  disabled={form.items.length === 1}
                  onClick={() =>
                    set({ items: form.items.filter((_, idx) => idx !== i) })
                  }
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <FileUploadField
              label="Attachment (Bill / Image / PDF)"
              endpoint="/api/uploads/docreg"
              filePath={form.attachmentPath}
              fileName={form.attachmentName || null}
              onChange={(path, name) =>
                set({ attachmentPath: path, attachmentName: name ?? "" })
              }
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button
              disabled={
                busy ||
                !form.headId ||
                validItems.length === 0 ||
                (form.paymentMode === "CREDIT" ? !form.partyId : !form.bankPartyId)
              }
              onClick={submit}
            >
              {busy ? "Saving..." : form.id ? "Update & Re-post" : "Save & Post"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** "total amount + split equally" helper control */
function SplitControl({ onSplit }: { onSplit: (grand: number) => void }) {
  const [grand, setGrand] = React.useState(0);
  return (
    <div className="flex items-center gap-1">
      <Input
        type="number"
        className="h-7 w-28 text-right text-xs"
        placeholder="Bill total..."
        value={grand ? String(grand) : ""}
        onChange={(e) => setGrand(Number(e.target.value) || 0)}
      />
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="h-7 text-xs"
        disabled={grand <= 0}
        onClick={() => onSplit(grand)}
      >
        Split Equally
      </Button>
    </div>
  );
}
