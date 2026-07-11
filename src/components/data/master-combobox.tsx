"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface MasterOption {
  value: string;
  label: string;
  meta?: string;
}

interface MasterComboboxProps {
  options: MasterOption[];
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  placeholder?: string;
  /**
   * The ubiquitous "+ Create new" pattern: render a dialog; call
   * closeAndSelect(newValue) once the new record is created to select it.
   */
  renderCreateDialog?: (closeAndSelect: (value: string) => void) => React.ReactNode;
  createLabel?: string;
  disabled?: boolean;
  className?: string;
}

export function MasterCombobox({
  options,
  value,
  onChange,
  placeholder = "Select...",
  renderCreateDialog,
  createLabel = "+ Create new",
  disabled,
  className,
}: MasterComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [creating, setCreating] = React.useState(false);

  const selected = options.find((o) => o.value === value);

  const closeAndSelect = React.useCallback(
    (newValue: string) => {
      setCreating(false);
      onChange(newValue);
    },
    [onChange]
  );

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn("w-full justify-between font-normal", !selected && "text-muted-foreground", className)}
          >
            <span className="truncate">{selected ? selected.label : placeholder}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[240px] p-0" align="start">
          <Command
            filter={(itemValue, search) =>
              itemValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
            }
          >
            <CommandInput placeholder="Search..." />
            <CommandList>
              <CommandEmpty>No match found.</CommandEmpty>
              <CommandGroup>
                {options.map((opt) => (
                  <CommandItem
                    key={opt.value}
                    value={`${opt.label} ${opt.meta ?? ""}`}
                    onSelect={() => {
                      onChange(opt.value === value ? null : opt.value);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn("h-4 w-4", value === opt.value ? "opacity-100" : "opacity-0")}
                    />
                    <span className="flex-1 truncate">{opt.label}</span>
                    {opt.meta && (
                      <span className="ml-2 truncate text-xs text-muted-foreground">{opt.meta}</span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
              {renderCreateDialog && (
                <>
                  <CommandSeparator />
                  <CommandGroup forceMount>
                    <CommandItem
                      forceMount
                      value="__create_new__"
                      onSelect={() => {
                        setOpen(false);
                        setCreating(true);
                      }}
                      className="text-primary"
                    >
                      <Plus className="h-4 w-4" />
                      {createLabel}
                    </CommandItem>
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {creating && renderCreateDialog?.(closeAndSelect)}
    </>
  );
}
