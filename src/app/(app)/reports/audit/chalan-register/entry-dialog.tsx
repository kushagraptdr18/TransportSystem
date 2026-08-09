"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { saveAuditChalan, type AuditChalanInput } from "./actions";
import type { AuditChalanRow } from "./register-client";

/**
 * Add / Edit an Audit Challan.
 *
 * Every field is a free-text or numeric input — there is no combobox, no
 * master lookup and no "create this transport?" prompt anywhere. Typing a
 * transport that exists nowhere else in the system is normal input here.
 */

const TEXT_FIELDS: { key: keyof AuditChalanInput; label: string; placeholder?: string }[] = [
  { key: "chalanNo", label: "Challan No." },
  { key: "transportName", label: "Transport Name", placeholder: "e.g. RAJA TPT" },
  { key: "ownerName", label: "Owner Name" },
  { key: "panCard", label: "PAN Card" },
  { key: "loadingFrom", label: "Loading From" },
  { key: "toLocation", label: "To" },
];

const WEIGHT_FIELDS: { key: keyof AuditChalanInput; label: string }[] = [
  { key: "actualWt", label: "Actual WT" },
  { key: "chargeWt", label: "Charge WT" },
  { key: "freightRate", label: "Freight Rate" },
  { key: "freightAmount", label: "Freight Amount" },
];

/** these subtract from Freight Amount to suggest a Balance */
const DEDUCTION_FIELDS: { key: keyof AuditChalanInput; label: string }[] = [
  { key: "tdsAmount", label: "TDS Amount" },
  { key: "advanceBank", label: "Advances in Bank" },
  { key: "cash", label: "Cash" },
  { key: "diesel", label: "Diesel" },
  { key: "tyre", label: "Tyre" },
  { key: "uria", label: "Uria" },
  { key: "other", label: "Other" },
];

const EMPTY: AuditChalanInput = {
  chalanNo: "",
  chalanDate: "",
  transportName: "",
  ownerName: "",
  panCard: "",
  loadingFrom: "",
  toLocation: "",
  actualWt: 0,
  chargeWt: 0,
  freightRate: 0,
  freightAmount: 0,
  tdsAmount: 0,
  advanceBank: 0,
  cash: 0,
  diesel: 0,
  tyre: 0,
  uria: 0,
  other: 0,
  balance: 0,
};

function toInput(row: AuditChalanRow): AuditChalanInput {
  return {
    id: row.id,
    chalanNo: row.chalanNo,
    chalanDate: row.chalanDate.slice(0, 10),
    transportName: row.transportName,
    ownerName: row.ownerName,
    panCard: row.panCard,
    loadingFrom: row.loadingFrom,
    toLocation: row.toLocation,
    actualWt: row.actualWt,
    chargeWt: row.chargeWt,
    freightRate: row.freightRate,
    freightAmount: row.freightAmount,
    tdsAmount: row.tdsAmount,
    advanceBank: row.advanceBank,
    cash: row.cash,
    diesel: row.diesel,
    tyre: row.tyre,
    uria: row.uria,
    other: row.other,
    balance: row.balance,
  };
}

export function AuditEntryDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: AuditChalanRow | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [form, setForm] = React.useState<AuditChalanInput>(EMPTY);
  const [busy, setBusy] = React.useState(false);
  // once the user types a Balance by hand we stop overwriting it, so an
  // imported-style figure that does not equal freight minus deductions is
  // never "corrected" behind their back
  const [balanceTouched, setBalanceTouched] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setForm(editing ? toInput(editing) : EMPTY);
    setBalanceTouched(!!editing);
  }, [open, editing]);

  const set = (key: keyof AuditChalanInput, value: string | number) =>
    setForm((f) => ({ ...f, [key]: value }));

  const deductionTotal = DEDUCTION_FIELDS.reduce(
    (s, f) => s + Number(form[f.key] ?? 0),
    0
  );
  const suggestedBalance = Number(form.freightAmount ?? 0) - deductionTotal;

  // convenience only, and only while the user has not set a Balance himself
  React.useEffect(() => {
    if (balanceTouched) return;
    setForm((f) => ({ ...f, balance: suggestedBalance }));
  }, [suggestedBalance, balanceTouched]);

  const submit = async () => {
    setBusy(true);
    try {
      const res = await saveAuditChalan(form);
      if (!res.ok) {
        toast({ variant: "destructive", title: "Could not save", description: res.error });
        return;
      }
      toast({ title: editing ? "Audit Challan updated" : "Audit Challan added" });
      onOpenChange(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  // a plain render helper, NOT a nested component — a component declared in
  // the render body gets a new identity every keystroke, which remounts the
  // input and throws away focus mid-typing
  const numberField = (k: keyof AuditChalanInput, label: string) => (
    <div key={k} className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        step="any"
        className="h-9"
        value={String(form[k] ?? 0)}
        onChange={(e) => set(k, e.target.value === "" ? 0 : Number(e.target.value))}
      />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Audit Challan" : "Add Audit Challan"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Basic Details
            </h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label className="text-xs">Date</Label>
                <Input
                  type="date"
                  className="h-9"
                  value={form.chalanDate}
                  onChange={(e) => set("chalanDate", e.target.value)}
                />
              </div>
              {TEXT_FIELDS.map((f) => (
                <div key={f.key} className="space-y-1">
                  <Label className="text-xs">{f.label}</Label>
                  <Input
                    className="h-9"
                    placeholder={f.placeholder}
                    value={String(form[f.key] ?? "")}
                    onChange={(e) => set(f.key, e.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Weight &amp; Freight
            </h3>
            <div className="grid gap-3 sm:grid-cols-4">
              {WEIGHT_FIELDS.map((f) => numberField(f.key, f.label))}
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Deduction / Advance / Expense
            </h3>
            <div className="grid gap-3 sm:grid-cols-4">
              {DEDUCTION_FIELDS.map((f) => numberField(f.key, f.label))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <div className="space-y-1">
              <Label className="text-xs">Balance</Label>
              <Input
                type="number"
                step="any"
                className="h-9 font-semibold"
                value={String(form.balance ?? 0)}
                onChange={(e) => {
                  setBalanceTouched(true);
                  set("balance", e.target.value === "" ? 0 : Number(e.target.value));
                }}
              />
              <p className="text-[11px] text-muted-foreground">
                Auto-filled as Freight &minus; deductions until you edit it.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {editing ? "Save Changes" : "Add Record"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
