"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MasterCombobox, type MasterOption } from "@/components/data/master-combobox";
import {
  PartyCreateDialog,
  VehicleCreateDialog,
  CityCreateDialog,
} from "@/components/masters/inline-dialogs";
import { cn, toNum } from "@/lib/utils";
import type { LedgerGroup } from "@prisma/client";

/** Labelled field wrapper used across fleet forms. */
export function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

/** Numeric input that keeps a number in form state; Enter advances focus. */
export function NumInput({
  value,
  onChange,
  className,
  readOnly,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  value: number;
  onChange?: (n: number) => void;
}) {
  const [text, setText] = React.useState(value === 0 ? "" : String(value));
  React.useEffect(() => {
    // keep in sync when value changes externally (e.g. auto-computed)
    setText((prev) => (toNum(prev) === value ? prev : value === 0 ? "" : String(value)));
  }, [value]);
  return (
    <Input
      inputMode="decimal"
      className={cn("text-right tabular-nums", readOnly && "bg-muted", className)}
      value={text}
      readOnly={readOnly}
      onChange={(e) => {
        const t = e.target.value.replace(/[^\d.\-]/g, "");
        setText(t);
        onChange?.(toNum(t));
      }}
      onKeyDown={enterAdvances}
      {...props}
    />
  );
}

/** Enter key advances to the next focusable form field. */
export function enterAdvances(e: React.KeyboardEvent<HTMLElement>) {
  if (e.key !== "Enter") return;
  const form = (e.target as HTMLElement).closest("form");
  if (!form) return;
  e.preventDefault();
  const focusables = Array.from(
    form.querySelectorAll<HTMLElement>(
      "input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button[role=combobox]"
    )
  );
  const idx = focusables.indexOf(e.target as HTMLElement);
  if (idx >= 0 && idx < focusables.length - 1) focusables[idx + 1].focus();
}

/** Party combobox with inline create dialog. */
export function PartyCombobox({
  options,
  value,
  onChange,
  ledgerGroup = "OWNER_BROKER",
  placeholder = "Select party...",
  disabled,
}: {
  options: MasterOption[];
  value: string | null;
  onChange: (v: string | null, option?: MasterOption) => void;
  ledgerGroup?: LedgerGroup;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [local, setLocal] = React.useState<MasterOption[]>([]);
  const all = React.useMemo(
    () => [...options, ...local.filter((l) => !options.some((o) => o.value === l.value))],
    [options, local]
  );
  return (
    <MasterCombobox
      options={all}
      value={value}
      onChange={(v) => onChange(v, all.find((o) => o.value === v))}
      placeholder={placeholder}
      disabled={disabled}
      createLabel="+ Create party"
      renderCreateDialog={(closeAndSelect) => (
        <PartyCreateDialog
          open
          onOpenChange={(o: boolean) => {
            if (!o) closeAndSelect(value ?? "");
          }}
          defaultGroup={ledgerGroup}
          onCreated={(opt) => {
            setLocal((prev) => [...prev, opt]);
            closeAndSelect(opt.value);
          }}
        />
      )}
    />
  );
}

/** Vehicle combobox with inline create dialog. */
export function VehicleCombobox({
  options,
  value,
  onChange,
  disabled,
}: {
  options: MasterOption[];
  value: string | null;
  onChange: (v: string | null, option?: MasterOption) => void;
  disabled?: boolean;
}) {
  const [local, setLocal] = React.useState<MasterOption[]>([]);
  const all = React.useMemo(
    () => [...options, ...local.filter((l) => !options.some((o) => o.value === l.value))],
    [options, local]
  );
  return (
    <MasterCombobox
      options={all}
      value={value}
      onChange={(v) => onChange(v, all.find((o) => o.value === v))}
      placeholder="Select vehicle..."
      disabled={disabled}
      createLabel="+ Create vehicle"
      renderCreateDialog={(closeAndSelect) => (
        <VehicleCreateDialog
          open
          onOpenChange={(o: boolean) => {
            if (!o) closeAndSelect(value ?? "");
          }}
          onCreated={(opt) => {
            setLocal((prev) => [...prev, opt]);
            closeAndSelect(opt.value);
          }}
        />
      )}
    />
  );
}

/** City combobox with inline create dialog. */
export function CityCombobox({
  options,
  value,
  onChange,
  placeholder = "Select city...",
  disabled,
}: {
  options: MasterOption[];
  value: string | null;
  onChange: (v: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [local, setLocal] = React.useState<MasterOption[]>([]);
  const all = React.useMemo(
    () => [...options, ...local.filter((l) => !options.some((o) => o.value === l.value))],
    [options, local]
  );
  return (
    <MasterCombobox
      options={all}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
      createLabel="+ Create city"
      renderCreateDialog={(closeAndSelect) => (
        <CityCreateDialog
          open
          onOpenChange={(o: boolean) => {
            if (!o) closeAndSelect(value ?? "");
          }}
          onCreated={(opt) => {
            setLocal((prev) => [...prev, opt]);
            closeAndSelect(opt.value);
          }}
        />
      )}
    />
  );
}
