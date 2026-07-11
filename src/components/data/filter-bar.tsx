"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import { cn, formatDate, parseDdMmYyyy } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterDef {
  type: "text" | "select" | "combobox" | "daterange";
  key: string;
  label: string;
  options?: FilterOption[];
}

interface FilterBarProps {
  filters: FilterDef[];
  className?: string;
}

function toIso(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function fromIso(s: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s + "T00:00:00");
  return isNaN(d.getTime()) ? null : d;
}

const PRESETS = ["Today", "This Week", "This Month", "This FY"] as const;

function presetRange(preset: (typeof PRESETS)[number]): [Date, Date] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (preset) {
    case "Today":
      return [today, today];
    case "This Week": {
      const day = (today.getDay() + 6) % 7; // Monday-based
      const start = new Date(today);
      start.setDate(today.getDate() - day);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      return [start, end];
    }
    case "This Month":
      return [
        new Date(today.getFullYear(), today.getMonth(), 1),
        new Date(today.getFullYear(), today.getMonth() + 1, 0),
      ];
    case "This FY": {
      const fyStartYear = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
      return [new Date(fyStartYear, 3, 1), new Date(fyStartYear + 1, 2, 31)];
    }
  }
}

function DateRangeFilter({
  def,
  from,
  to,
  onChange,
}: {
  def: FilterDef;
  from: string | null;
  to: string | null;
  onChange: (from: string | null, to: string | null) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [fromText, setFromText] = React.useState("");
  const [toText, setToText] = React.useState("");

  React.useEffect(() => {
    setFromText(from ? formatDate(fromIso(from)) : "");
    setToText(to ? formatDate(fromIso(to)) : "");
  }, [from, to]);

  const label =
    from || to
      ? `${from ? formatDate(fromIso(from)) : "..."} - ${to ? formatDate(fromIso(to)) : "..."}`
      : def.label;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 justify-between font-normal">
          {label}
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-3" align="start">
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <Button
              key={p}
              variant="secondary"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                const [s, e] = presetRange(p);
                onChange(toIso(s), toIso(e));
                setOpen(false);
              }}
            >
              {p}
            </Button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">From</Label>
            <Input
              value={fromText}
              onChange={(e) => setFromText(e.target.value)}
              placeholder="dd/mm/yyyy"
              className="h-8"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">To</Label>
            <Input
              value={toText}
              onChange={(e) => setToText(e.target.value)}
              placeholder="dd/mm/yyyy"
              className="h-8"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onChange(null, null);
              setOpen(false);
            }}
          >
            Clear
          </Button>
          <Button
            size="sm"
            onClick={() => {
              const f = parseDdMmYyyy(fromText);
              const t = parseDdMmYyyy(toText);
              onChange(f ? toIso(f) : null, t ? toIso(t) : null);
              setOpen(false);
            }}
          >
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ComboboxFilter({
  def,
  value,
  onChange,
}: {
  def: FilterDef;
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const selected = def.options?.find((o) => o.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          role="combobox"
          aria-expanded={open}
          className="h-9 min-w-[140px] justify-between font-normal"
        >
          <span className="truncate">{selected ? selected.label : def.label}</span>
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[240px] p-0" align="start">
        <Command>
          <CommandInput placeholder={`Search ${def.label.toLowerCase()}...`} />
          <CommandList>
            <CommandEmpty>No results.</CommandEmpty>
            <CommandGroup>
              {(def.options ?? []).map((opt) => (
                <CommandItem
                  key={opt.value}
                  value={opt.label}
                  onSelect={() => {
                    onChange(opt.value === value ? null : opt.value);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn("h-4 w-4", value === opt.value ? "opacity-100" : "opacity-0")}
                  />
                  {opt.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function FilterBar({ filters, className }: FilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const textFilter = filters.find((f) => f.type === "text");
  const [search, setSearch] = React.useState(
    textFilter ? searchParams.get(textFilter.key) ?? "" : ""
  );

  const setParams = React.useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (v === null || v === "") params.delete(k);
        else params.set(k, v);
      }
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  // debounced text search -> URL
  React.useEffect(() => {
    if (!textFilter) return;
    const current = searchParams.get(textFilter.key) ?? "";
    if (search === current) return;
    const t = setTimeout(() => setParams({ [textFilter.key]: search || null }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // active chips
  const chips: { key: string; label: string; clear: Record<string, string | null> }[] = [];
  for (const f of filters) {
    if (f.type === "text") {
      const v = searchParams.get(f.key);
      if (v) chips.push({ key: f.key, label: `${f.label}: ${v}`, clear: { [f.key]: null } });
    } else if (f.type === "daterange") {
      const from = searchParams.get(`${f.key}_from`);
      const to = searchParams.get(`${f.key}_to`);
      if (from || to)
        chips.push({
          key: f.key,
          label: `${f.label}: ${from ? formatDate(fromIso(from)) : "..."} - ${
            to ? formatDate(fromIso(to)) : "..."
          }`,
          clear: { [`${f.key}_from`]: null, [`${f.key}_to`]: null },
        });
    } else {
      const v = searchParams.get(f.key);
      if (v) {
        const opt = f.options?.find((o) => o.value === v);
        chips.push({
          key: f.key,
          label: `${f.label}: ${opt?.label ?? v}`,
          clear: { [f.key]: null },
        });
      }
    }
  }

  const clearAll = () => {
    const updates: Record<string, string | null> = {};
    for (const f of filters) {
      if (f.type === "daterange") {
        updates[`${f.key}_from`] = null;
        updates[`${f.key}_to`] = null;
      } else {
        updates[f.key] = null;
      }
    }
    setSearch("");
    setParams(updates);
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-center gap-2">
        {textFilter && (
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={textFilter.label}
              className="w-56 pl-8"
            />
          </div>
        )}
        {filters
          .filter((f) => f.type !== "text")
          .map((f) => {
            if (f.type === "daterange") {
              return (
                <DateRangeFilter
                  key={f.key}
                  def={f}
                  from={searchParams.get(`${f.key}_from`)}
                  to={searchParams.get(`${f.key}_to`)}
                  onChange={(from, to) =>
                    setParams({ [`${f.key}_from`]: from, [`${f.key}_to`]: to })
                  }
                />
              );
            }
            if (f.type === "combobox") {
              return (
                <ComboboxFilter
                  key={f.key}
                  def={f}
                  value={searchParams.get(f.key)}
                  onChange={(v) => setParams({ [f.key]: v })}
                />
              );
            }
            // select
            return (
              <Select
                key={f.key}
                value={searchParams.get(f.key) ?? ""}
                onValueChange={(v) => setParams({ [f.key]: v === "__all__" ? null : v })}
              >
                <SelectTrigger className="h-9 w-auto min-w-[140px]">
                  <SelectValue placeholder={f.label} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All {f.label}</SelectItem>
                  {(f.options ?? []).map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            );
          })}
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((chip) => (
            <Badge key={chip.key} variant="secondary" className="gap-1 pr-1 font-normal">
              {chip.label}
              <button
                type="button"
                className="rounded-full p-0.5 hover:bg-muted-foreground/20"
                onClick={() => {
                  const t = filters.find((f) => f.key === chip.key);
                  if (t?.type === "text") setSearch("");
                  setParams(chip.clear);
                }}
                aria-label={`Remove ${chip.label}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={clearAll}>
            Clear all
          </Button>
        </div>
      )}
    </div>
  );
}
