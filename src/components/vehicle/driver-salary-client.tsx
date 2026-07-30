"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
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
import { FilterBar } from "@/components/data/filter-bar";
import { MasterCombobox, type MasterOption } from "@/components/data/master-combobox";
import {
  deleteDriverSalary,
  getPendingShortages,
  payDriverSalary,
  processDriverSalary,
  saveDriverShortage,
} from "@/app/(app)/vehicle/driver-salary/actions";

export interface DriverSalaryRow {
  id: string;
  driverId: string;
  driver: string;
  month: string;
  salaryAmount: number;
  incentive: number;
  bonus: number;
  otherAllowance: number;
  advanceAdjust: number;
  shortageDeduction: number;
  otherDeductions: number;
  netPayable: number;
  paymentStatus: string;
  paymentDate: string | null;
  remarks: string;
}

interface ShortageRow {
  id: string;
  date: string;
  driver: string;
  tripRef: string;
  amount: number;
  status: string;
  remarks: string;
}

function textToIso(text: string): string {
  const d = parseDdMmYyyy(text);
  if (!d) return "";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

const thisMonth = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
};

const emptyForm = {
  id: null as string | null,
  driverId: null as string | null,
  month: thisMonth(),
  salaryAmount: 0,
  incentive: 0,
  bonus: 0,
  otherAllowance: 0,
  advanceAdjust: 0,
  adjustShortage: false,
  otherDeductions: 0,
  remarks: "",
};

export function DriverSalaryClient({
  rows,
  shortages,
  driverOptions,
  allDriverOptions,
  bankOptions,
  canDelete,
}: {
  rows: DriverSalaryRow[];
  shortages: ShortageRow[];
  driverOptions: MasterOption[];
  allDriverOptions: MasterOption[];
  bankOptions: MasterOption[];
  canDelete: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = React.useState(false);

  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState(emptyForm);
  const set = (p: Partial<typeof emptyForm>) => setForm((f) => ({ ...f, ...p }));
  const [pendingShortage, setPendingShortage] = React.useState<{
    total: number;
    rows: { id: string; date: string; tripRef: string; amount: number; remarks: string }[];
  }>({ total: 0, rows: [] });

  // fetch pending shortages when driver changes in the salary dialog
  React.useEffect(() => {
    if (!open || !form.driverId) {
      setPendingShortage({ total: 0, rows: [] });
      return;
    }
    getPendingShortages(form.driverId).then(setPendingShortage).catch(() => setPendingShortage({ total: 0, rows: [] }));
  }, [open, form.driverId]);

  const [payOf, setPayOf] = React.useState<DriverSalaryRow | null>(null);
  const [pay, setPay] = React.useState({
    dateText: formatDate(new Date()),
    paymentHeadId: null as string | null,
  });

  const [shortOpen, setShortOpen] = React.useState(false);
  const [short, setShort] = React.useState({
    dateText: formatDate(new Date()),
    driverId: null as string | null,
    tripRef: "",
    amount: 0,
    remarks: "",
  });

  const gross = form.salaryAmount + form.incentive + form.bonus + form.otherAllowance;
  const shortageAmt = form.adjustShortage ? pendingShortage.total : 0;
  const net = Math.round((gross - form.advanceAdjust - shortageAmt - form.otherDeductions) * 100) / 100;

  const columns: ColumnDef<DriverSalaryRow>[] = [
    { accessorKey: "month", header: "Month" },
    { accessorKey: "driver", header: "Driver" },
    {
      accessorKey: "salaryAmount",
      header: "Salary",
      cell: ({ row }) => formatMoney(row.original.salaryAmount),
      meta: { numeric: true } satisfies DataTableColumnMeta<DriverSalaryRow>,
    },
    {
      id: "extras",
      header: "Incentive/Bonus/Allow",
      cell: ({ row }) =>
        formatMoney(row.original.incentive + row.original.bonus + row.original.otherAllowance),
      meta: { numeric: true } satisfies DataTableColumnMeta<DriverSalaryRow>,
    },
    {
      accessorKey: "advanceAdjust",
      header: "Adv Adj",
      cell: ({ row }) => formatMoney(row.original.advanceAdjust),
      meta: { numeric: true } satisfies DataTableColumnMeta<DriverSalaryRow>,
    },
    {
      accessorKey: "shortageDeduction",
      header: "Shortage Ded",
      cell: ({ row }) => formatMoney(row.original.shortageDeduction),
      meta: { numeric: true } satisfies DataTableColumnMeta<DriverSalaryRow>,
    },
    {
      accessorKey: "otherDeductions",
      header: "Other Ded",
      cell: ({ row }) => formatMoney(row.original.otherDeductions),
      meta: { numeric: true } satisfies DataTableColumnMeta<DriverSalaryRow>,
    },
    {
      accessorKey: "netPayable",
      header: "Net Payable",
      cell: ({ row }) => <b>{formatMoney(row.original.netPayable)}</b>,
      meta: {
        numeric: true,
        total: (rs) => formatMoney(rs.reduce((s, r) => s + r.netPayable, 0)),
      } satisfies DataTableColumnMeta<DriverSalaryRow>,
    },
    {
      accessorKey: "paymentStatus",
      header: "Status",
      cell: ({ row }) =>
        row.original.paymentStatus === "PAID" ? (
          <Badge>PAID {row.original.paymentDate ? formatDate(row.original.paymentDate) : ""}</Badge>
        ) : (
          <Badge variant="outline">PENDING</Badge>
        ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) =>
        row.original.paymentStatus === "PENDING" ? (
          <div className="flex gap-0.5" onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => {
                setForm({
                  id: row.original.id,
                  driverId: row.original.driverId,
                  month: row.original.month,
                  salaryAmount: row.original.salaryAmount,
                  incentive: row.original.incentive,
                  bonus: row.original.bonus,
                  otherAllowance: row.original.otherAllowance,
                  advanceAdjust: row.original.advanceAdjust,
                  adjustShortage: row.original.shortageDeduction > 0,
                  otherDeductions: row.original.otherDeductions,
                  remarks: row.original.remarks,
                });
                setOpen(true);
              }}
            >
              Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => {
                setPay({ dateText: formatDate(new Date()), paymentHeadId: null });
                setPayOf(row.original);
              }}
            >
              Pay
            </Button>
            {canDelete && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-destructive"
                onClick={async () => {
                  if (!confirm(`Delete salary ${row.original.month} of ${row.original.driver}?`)) return;
                  const res = await deleteDriverSalary(row.original.id);
                  if (res.ok) {
                    toast({ title: "Salary deleted; shortages released, ledger reversed" });
                    router.refresh();
                  } else toast({ variant: "destructive", title: "Delete failed", description: res.error });
                }}
              >
                Delete
              </Button>
            )}
          </div>
        ) : null,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Driver Salary</h1>
        <div className="flex gap-2">
          <ExportButton
            rows={rows}
            fileName="driver-salary-register"
            sheetName="Driver Salary"
            columns={[
              { header: "Month", key: "month" },
              { header: "Driver", key: "driver" },
              { header: "Salary", key: "salaryAmount", numeric: true },
              { header: "Incentive", key: "incentive", numeric: true },
              { header: "Bonus", key: "bonus", numeric: true },
              { header: "Other Allowance", key: "otherAllowance", numeric: true },
              { header: "Advance Adjustment", key: "advanceAdjust", numeric: true },
              { header: "Shortage Deduction", key: "shortageDeduction", numeric: true },
              { header: "Other Deductions", key: "otherDeductions", numeric: true },
              { header: "Net Payable", key: "netPayable", numeric: true },
              { header: "Status", key: "paymentStatus" },
            ]}
          />
          <Button variant="outline" size="sm" onClick={() => setShortOpen(true)}>
            <Plus className="h-4 w-4" /> Record Shortage
          </Button>
          <Button size="sm" onClick={() => { setForm(emptyForm); setOpen(true); }}>
            <Plus className="h-4 w-4" /> Process Salary
          </Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Salary is fully separate from trip settlement and driver advance. Pending shortages appear
        before payment — adjusting them is always the user&apos;s choice, never forced.
      </p>
      <FilterBar
        filters={[
          { type: "combobox", key: "driver", label: "Driver", options: allDriverOptions },
          {
            type: "select",
            key: "status",
            label: "Status",
            options: [
              { value: "PENDING", label: "Pending" },
              { value: "PAID", label: "Paid" },
            ],
          },
        ]}
      />
      <DataTable columns={columns} data={rows} emptyMessage="No salary records yet." />

      {/* shortage register */}
      <div className="space-y-1">
        <h2 className="text-sm font-medium text-muted-foreground">Driver Shortage Register</h2>
        <DataTable
          columns={[
            { accessorKey: "date", header: "Date", cell: ({ row }) => formatDate(row.original.date) },
            { accessorKey: "driver", header: "Driver" },
            { accessorKey: "tripRef", header: "Trip Ref" },
            {
              accessorKey: "amount",
              header: "Shortage Amt",
              cell: ({ row }) => formatMoney(row.original.amount),
              meta: { numeric: true } satisfies DataTableColumnMeta<ShortageRow>,
            },
            {
              accessorKey: "status",
              header: "Status",
              cell: ({ row }) =>
                row.original.status === "PENDING" ? (
                  <Badge variant="outline">PENDING</Badge>
                ) : (
                  <Badge>ADJUSTED</Badge>
                ),
            },
            { accessorKey: "remarks", header: "Remarks" },
          ] satisfies ColumnDef<ShortageRow>[]}
          data={shortages}
          emptyMessage="No shortages recorded."
        />
      </div>

      {/* process salary dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[95vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit" : "Process"} Driver Salary</DialogTitle>
            <DialogDescription>
              Net payable updates live. Pending shortages are adjusted only if you choose Yes.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-xs">Driver *</Label>
              <MasterCombobox
                options={driverOptions}
                value={form.driverId}
                onChange={(v) => set({ driverId: v })}
                placeholder="Select driver..."
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Salary Month *</Label>
              <Input
                type="month"
                className="h-8"
                value={form.month}
                onChange={(e) => set({ month: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Salary Amount *</Label>
              <Input
                type="number"
                className="h-8 text-right"
                value={form.salaryAmount ? String(form.salaryAmount) : ""}
                onChange={(e) => set({ salaryAmount: Number(e.target.value) || 0 })}
              />
            </div>
            {(
              [
                ["incentive", "Incentive"],
                ["bonus", "Bonus"],
                ["otherAllowance", "Other Allowance"],
                ["advanceAdjust", "Salary Advance Adjustment"],
                ["otherDeductions", "Other Deductions"],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="space-y-1">
                <Label className="text-xs">{label}</Label>
                <Input
                  type="number"
                  className="h-8 text-right"
                  value={form[key] ? String(form[key]) : ""}
                  onChange={(e) => set({ [key]: Number(e.target.value) || 0 } as Partial<typeof emptyForm>)}
                />
              </div>
            ))}
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">Remarks</Label>
              <Input className="h-8" value={form.remarks} onChange={(e) => set({ remarks: e.target.value })} />
            </div>
          </div>

          {/* shortage decision */}
          <div className="rounded-md border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm">
                <b>Total Pending Shortage: {formatMoney(pendingShortage.total)}</b>
                {pendingShortage.rows.length > 0 && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    ({pendingShortage.rows.length} entr{pendingShortage.rows.length === 1 ? "y" : "ies"})
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-sm">
                Adjust in Salary?
                <Select
                  value={form.adjustShortage ? "YES" : "NO"}
                  onValueChange={(v) => set({ adjustShortage: v === "YES" })}
                >
                  <SelectTrigger className="h-8 w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NO">No — pay full salary</SelectItem>
                    <SelectItem value="YES">Yes — deduct now</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {pendingShortage.rows.length > 0 && (
              <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                {pendingShortage.rows.map((r) => (
                  <div key={r.id}>
                    {formatDate(r.date)} — {formatMoney(r.amount)}
                    {r.tripRef ? ` (trip ${r.tripRef})` : ""} {r.remarks}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-md bg-muted/50 p-2 text-sm font-semibold">
            Net Salary Payable: {formatMoney(net)}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button
              disabled={busy || !form.driverId || gross <= 0 || net < 0}
              onClick={async () => {
                setBusy(true);
                try {
                  const res = await processDriverSalary({
                    id: form.id,
                    driverId: form.driverId ?? "",
                    month: form.month,
                    salaryAmount: form.salaryAmount,
                    incentive: form.incentive,
                    bonus: form.bonus,
                    otherAllowance: form.otherAllowance,
                    advanceAdjust: form.advanceAdjust,
                    adjustShortage: form.adjustShortage,
                    otherDeductions: form.otherDeductions,
                    remarks: form.remarks,
                  });
                  if (res.ok) {
                    toast({ title: `Salary processed — net ${formatMoney(res.netPayable)}` });
                    setOpen(false);
                    router.refresh();
                  } else toast({ variant: "destructive", title: "Failed", description: res.error });
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Saving..." : "Save Salary"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* pay dialog */}
      <Dialog open={!!payOf} onOpenChange={(o) => !o && setPayOf(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Pay {formatMoney(payOf?.netPayable ?? 0)} to {payOf?.driver} ({payOf?.month})
            </DialogTitle>
            <DialogDescription>Posts to the driver ledger and cash/bank book.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Payment Date *</Label>
              <DateInput
                className="h-8"
                value={pay.dateText}
                onChange={(t) => setPay((f) => ({ ...f, dateText: t }))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Cash / Bank Account *</Label>
              <MasterCombobox
                options={bankOptions}
                value={pay.paymentHeadId}
                onChange={(v) => setPay((f) => ({ ...f, paymentHeadId: v }))}
                placeholder="Select account..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayOf(null)} disabled={busy}>Cancel</Button>
            <Button
              disabled={busy || !pay.paymentHeadId}
              onClick={async () => {
                setBusy(true);
                try {
                  const res = await payDriverSalary({
                    id: payOf!.id,
                    paymentDate: textToIso(pay.dateText),
                    paymentHeadId: pay.paymentHeadId ?? "",
                  });
                  if (res.ok) {
                    toast({ title: "Salary paid" });
                    setPayOf(null);
                    router.refresh();
                  } else toast({ variant: "destructive", title: "Failed", description: res.error });
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Paying..." : "Pay Salary"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* record shortage dialog */}
      <Dialog open={shortOpen} onOpenChange={setShortOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Record Driver Shortage</DialogTitle>
            <DialogDescription>
              Stays pending until adjusted in a salary (with your Yes) or left outstanding.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Date *</Label>
              <DateInput
                className="h-8"
                value={short.dateText}
                onChange={(t) => setShort((f) => ({ ...f, dateText: t }))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Driver *</Label>
              <MasterCombobox
                options={driverOptions}
                value={short.driverId}
                onChange={(v) => setShort((f) => ({ ...f, driverId: v }))}
                placeholder="Select driver..."
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Trip Reference</Label>
              <Input
                className="h-8"
                value={short.tripRef}
                onChange={(e) => setShort((f) => ({ ...f, tripRef: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Shortage Amount *</Label>
              <Input
                type="number"
                className="h-8 text-right"
                value={short.amount ? String(short.amount) : ""}
                onChange={(e) => setShort((f) => ({ ...f, amount: Number(e.target.value) || 0 }))}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">Remarks</Label>
              <Input
                className="h-8"
                value={short.remarks}
                onChange={(e) => setShort((f) => ({ ...f, remarks: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShortOpen(false)} disabled={busy}>Cancel</Button>
            <Button
              disabled={busy || !short.driverId || short.amount <= 0}
              onClick={async () => {
                setBusy(true);
                try {
                  const res = await saveDriverShortage({
                    date: textToIso(short.dateText),
                    driverId: short.driverId ?? "",
                    tripRef: short.tripRef,
                    amount: short.amount,
                    remarks: short.remarks,
                  });
                  if (res.ok) {
                    toast({ title: "Shortage recorded" });
                    setShortOpen(false);
                    setShort({ dateText: formatDate(new Date()), driverId: null, tripRef: "", amount: 0, remarks: "" });
                    router.refresh();
                  } else toast({ variant: "destructive", title: "Failed", description: res.error });
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Saving..." : "Save Shortage"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
