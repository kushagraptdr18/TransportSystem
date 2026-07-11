"use client";

import * as React from "react";
import { cn, formatDate, parseDdMmYyyy } from "@/lib/utils";
import { Input } from "@/components/ui/input";

interface DateInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> {
  /** Value as dd/mm/yyyy text (or empty string). */
  value: string;
  onChange: (text: string, date: Date | null) => void;
}

/**
 * Text input for dd/mm/yyyy dates. Validates on blur; shows a red border when
 * the text is non-empty and not a valid dd/mm/yyyy date.
 */
export function DateInput({ value, onChange, className, onBlur, ...props }: DateInputProps) {
  const [invalid, setInvalid] = React.useState(false);

  return (
    <Input
      inputMode="numeric"
      placeholder="dd/mm/yyyy"
      value={value}
      onChange={(e) => {
        // light mask: keep digits and separators only
        const text = e.target.value.replace(/[^\d/\-]/g, "").slice(0, 10);
        setInvalid(false);
        onChange(text, parseDdMmYyyy(text));
      }}
      onBlur={(e) => {
        const text = e.target.value.trim();
        if (!text) {
          setInvalid(false);
        } else {
          const d = parseDdMmYyyy(text);
          if (d) {
            setInvalid(false);
            const normalized = formatDate(d);
            if (normalized !== text) onChange(normalized, d);
          } else {
            setInvalid(true);
          }
        }
        onBlur?.(e);
      }}
      aria-invalid={invalid || undefined}
      className={cn(invalid && "border-destructive focus-visible:ring-destructive", className)}
      {...props}
    />
  );
}
