"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus, Trash2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { DataTable } from "@/components/data/data-table";
import { FilterBar, type FilterDef } from "@/components/data/filter-bar";
import { MasterCombobox, type MasterOption } from "@/components/data/master-combobox";
import { DateInput } from "@/components/data/date-input";
import { ExportButton, type ExportColumn } from "@/components/data/export-button";

export type ActionResult = { ok: true; id: string } | { ok: false; error: string };

export type FormState = Record<string, unknown>;

export interface CreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (option: MasterOption) => void;
}

export interface FieldDef {
  name: string;
  label: string;
  type: "text" | "number" | "textarea" | "switch" | "select" | "combobox" | "date" | "radio";
  options?: MasterOption[];
  placeholder?: string;
  /** Render field only when true. */
  visibleIf?: (form: FormState) => boolean;
  /** Inline "+ create" dialog for combobox fields. */
  createDialog?: (props: CreateDialogProps) => React.ReactNode;
  /** Span both columns of the dialog grid. */
  span2?: boolean;
  uppercase?: boolean;
}

interface SimpleMasterProps<T> {
  title: string;
  newLabel?: string;
  rows: T[];
  columns: ColumnDef<T, unknown>[];
  exportColumns: ExportColumn<T>[];
  exportName: string;
  filters?: FilterDef[];
  fields: FieldDef[];
  defaults: FormState;
  toForm: (row: T) => FormState;
  getId: (row: T) => string;
  save: (input: unknown) => Promise<ActionResult>;
  remove?: (id: string) => Promise<ActionResult>;
  canDelete: boolean;
  /** Optional payload transform before calling `save`. */
  transform?: (form: FormState) => unknown;
  /** Extra content rendered below the fields (hints, computed values). */
  renderExtra?: (form: FormState, set: (name: string, value: unknown) => void) => React.ReactNode;
  dialogClassName?: string;
}

export function SimpleMaster<T>({
  title,
  newLabel = "New",
  rows,
  columns,
  exportColumns,
  exportName,
  filters,
  fields,
  defaults,
  toForm,
  getId,
  save,
  remove,
  canDelete,
  transform,
  renderExtra,
  dialogClassName,
}: SimpleMasterProps<T>) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<FormState>(defaults);
  const [busy, setBusy] = React.useState(false);
  const [extraOptions, setExtraOptions] = React.useState<Record<string, MasterOption[]>>({});

  const set = React.useCallback(
    (name: string, value: unknown) => setForm((f) => ({ ...f, [name]: value })),
    []
  );

  const openNew = () => {
    setEditingId(null);
    setForm(defaults);
    setOpen(true);
  };

  const openEdit = (row: T) => {
    setEditingId(getId(row));
    setForm(toForm(row));
    setOpen(true);
  };

  const handleSave = async () => {
    setBusy(true);
    try {
      const payload = transform ? transform(form) : form;
      const res = await save({ ...(payload as object), id: editingId ?? undefined });
      if (res.ok) {
        toast({ title: `${title} saved` });
        setOpen(false);
        router.refresh();
      } else {
        toast({ variant: "destructive", title: "Save failed", description: res.error });
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!editingId || !remove) return;
    if (!window.confirm(`Delete this ${title.toLowerCase()}? This cannot be undone.`)) return;
    setBusy(true);
    try {
      const res = await remove(editingId);
      if (res.ok) {
        toast({ title: `${title} deleted` });
        setOpen(false);
        router.refresh();
      } else {
        toast({ variant: "destructive", title: "Delete failed", description: res.error });
      }
    } finally {
      setBusy(false);
    }
  };

  const renderField = (f: FieldDef) => {
    if (f.visibleIf && !f.visibleIf(form)) return null;
    const value = form[f.name];
    const wrapCls = f.span2 ? "space-y-1.5 sm:col-span-2" : "space-y-1.5";
    let control: React.ReactNode;
    switch (f.type) {
      case "textarea":
        control = (
          <Textarea
            value={(value as string) ?? ""}
            onChange={(e) => set(f.name, e.target.value)}
            placeholder={f.placeholder}
            rows={2}
          />
        );
        break;
      case "number":
        control = (
          <Input
            type="number"
            inputMode="decimal"
            value={value === null || value === undefined ? "" : String(value)}
            onChange={(e) => set(f.name, e.target.value === "" ? "" : e.target.value)}
            placeholder={f.placeholder}
            className="text-right"
          />
        );
        break;
      case "switch":
        control = (
          <div className="flex h-10 items-center">
            <Switch checked={Boolean(value)} onCheckedChange={(v) => set(f.name, v)} />
          </div>
        );
        break;
      case "select":
        control = (
          <Select
            value={(value as string) ?? ""}
            onValueChange={(v) => set(f.name, v)}
          >
            <SelectTrigger>
              <SelectValue placeholder={f.placeholder ?? "Select..."} />
            </SelectTrigger>
            <SelectContent>
              {(f.options ?? []).map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
        break;
      case "radio":
        control = (
          <div className="flex h-10 flex-wrap items-center gap-4">
            {(f.options ?? []).map((o) => (
              <label key={o.value} className="flex cursor-pointer items-center gap-1.5 text-sm">
                <input
                  type="radio"
                  name={f.name}
                  checked={value === o.value}
                  onChange={() => set(f.name, o.value)}
                  className="h-4 w-4 accent-primary"
                />
                {o.label}
              </label>
            ))}
          </div>
        );
        break;
      case "combobox": {
        const options = [...(f.options ?? []), ...(extraOptions[f.name] ?? [])];
        control = (
          <MasterCombobox
            options={options}
            value={(value as string) ?? null}
            onChange={(v) => set(f.name, v)}
            placeholder={f.placeholder ?? "Select..."}
            renderCreateDialog={
              f.createDialog
                ? (closeAndSelect) =>
                    f.createDialog!({
                      open: true,
                      onOpenChange: (o) => {
                        if (!o) closeAndSelect((value as string) ?? "");
                      },
                      onCreated: (opt) => {
                        setExtraOptions((prev) => ({
                          ...prev,
                          [f.name]: [...(prev[f.name] ?? []), opt],
                        }));
                        closeAndSelect(opt.value);
                      },
                    })
                : undefined
            }
          />
        );
        break;
      }
      case "date":
        control = (
          <DateInput
            value={(value as string) ?? ""}
            onChange={(text) => set(f.name, text)}
          />
        );
        break;
      default:
        control = (
          <Input
            value={(value as string) ?? ""}
            onChange={(e) =>
              set(f.name, f.uppercase ? e.target.value.toUpperCase() : e.target.value)
            }
            placeholder={f.placeholder}
          />
        );
    }
    return (
      <div key={f.name} className={wrapCls}>
        <Label className="text-xs">{f.label}</Label>
        {control}
      </div>
    );
  };

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">{title}</h1>
        <div className="flex items-center gap-2">
          <ExportButton rows={rows} columns={exportColumns} fileName={exportName} />
          <Button size="sm" onClick={openNew}>
            <Plus className="h-4 w-4" />
            {newLabel}
          </Button>
        </div>
      </div>

      {filters && filters.length > 0 && <FilterBar filters={filters} />}

      <DataTable columns={columns} data={rows} onRowClick={openEdit} />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className={dialogClassName ?? "max-h-[90vh] overflow-y-auto sm:max-w-xl"}>
          <DialogHeader>
            <DialogTitle>
              {editingId ? `Edit ${title}` : `New ${title}`}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">{fields.map(renderField)}</div>
          {renderExtra?.(form, set)}
          <DialogFooter className="gap-2">
            {editingId && canDelete && remove && (
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={busy}
                className="sm:mr-auto"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            )}
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={busy}>
              {busy ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
