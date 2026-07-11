"use client";

import * as React from "react";
import { formatDate, parseDdMmYyyy, toNum } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const TRIP_EXPENSE_CATEGORIES = [
  "DIESEL",
  "TOLL",
  "DRIVER_BATA",
  "LOADING",
  "UNLOADING",
  "PARKING",
  "POLICE_RTO",
  "MISC",
] as const;

export const VEHICLE_EXPENSE_CATEGORIES = [
  "TYRE_PURCHASE",
  "TYRE_REPAIR",
  "SERVICE",
  "SPARE_PARTS",
  "REPAIR",
  "INSURANCE",
  "FITNESS",
  "PERMIT",
  "ROAD_TAX",
  "RTO_PAPERS",
  "POLLUTION",
  "DRIVER_SALARY",
  "CLEANER_SALARY",
  "EMI",
  "GPS_RECHARGE",
  "FASTAG_RECHARGE",
  "WASHING",
  "OTHER",
] as const;

export function categoryLabel(c: string): string {
  return c
    .split("_")
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");
}

/** dd/mm/yyyy text -> ISO yyyy-mm-dd (or null). */
export function isoFromText(text: string): string | null {
  const d = parseDdMmYyyy(text);
  if (!d) return null;
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** ISO / Date -> dd/mm/yyyy text ("" when null). */
export function textFromIso(v: string | Date | null | undefined): string {
  if (!v) return "";
  return formatDate(typeof v === "string" && !v.includes("T") ? new Date(`${v}T00:00:00`) : v);
}

export function todayText(): string {
  return formatDate(new Date());
}

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
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

/** Right-aligned numeric input bound to a number state. */
export function NumInput({
  value,
  onChange,
  className,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  value: number;
  onChange: (n: number) => void;
}) {
  const [text, setText] = React.useState(value === 0 ? "" : String(value));
  React.useEffect(() => {
    if (toNum(text) !== value) setText(value === 0 ? "" : String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <Input
      type="number"
      inputMode="decimal"
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        onChange(toNum(e.target.value));
      }}
      className={`text-right ${className ?? ""}`}
      {...props}
    />
  );
}
