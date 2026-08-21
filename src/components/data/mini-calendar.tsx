"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

const sameDay = (a: Date | null, b: Date | null) =>
  !!a && !!b &&
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

/**
 * Theme-matched month-grid date picker for the filter date-range popover:
 * prev/next arrows, month + year jump selects, and from→to range shading.
 * Deliberately dependency-free — the whole thing is a small grid of buttons.
 */
export function MiniCalendar({
  month,
  onMonthChange,
  from,
  to,
  onPick,
}: {
  /** first-of-month anchor for the visible grid */
  month: Date;
  onMonthChange: (m: Date) => void;
  from: Date | null;
  to: Date | null;
  onPick: (d: Date) => void;
}) {
  const y = month.getFullYear();
  const m = month.getMonth();
  const today = new Date();

  // Monday-based leading gap, then every day of the month
  const firstDay = (new Date(y, m, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array.from({ length: firstDay }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(y, m, i + 1)),
  ];

  // year jump: a window around the current year keeps the select short but
  // reaches every FY the firm can realistically hold data for
  const years = Array.from({ length: 12 }, (_, i) => today.getFullYear() - 8 + i);
  if (!years.includes(y)) years.unshift(y);

  const inRange = (d: Date) => !!from && !!to && d > from && d < to;

  return (
    <div className="select-none">
      <div className="mb-1.5 flex items-center gap-1">
        <button
          type="button"
          aria-label="Previous month"
          className="rounded-md p-1 hover:bg-accent"
          onClick={() => onMonthChange(new Date(y, m - 1, 1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <select
          aria-label="Month"
          className="h-7 flex-1 rounded-md border border-input bg-background px-1 text-xs"
          value={m}
          onChange={(e) => onMonthChange(new Date(y, Number(e.target.value), 1))}
        >
          {MONTHS.map((name, i) => (
            <option key={name} value={i}>
              {name}
            </option>
          ))}
        </select>
        <select
          aria-label="Year"
          className="h-7 rounded-md border border-input bg-background px-1 text-xs"
          value={y}
          onChange={(e) => onMonthChange(new Date(Number(e.target.value), m, 1))}
        >
          {years.map((yy) => (
            <option key={yy} value={yy}>
              {yy}
            </option>
          ))}
        </select>
        <button
          type="button"
          aria-label="Next month"
          className="rounded-md p-1 hover:bg-accent"
          onClick={() => onMonthChange(new Date(y, m + 1, 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 text-center">
        {WEEKDAYS.map((d) => (
          <span key={d} className="py-1 text-[10px] font-medium text-muted-foreground">
            {d}
          </span>
        ))}
        {cells.map((d, i) =>
          d ? (
            <button
              key={i}
              type="button"
              onClick={() => onPick(d)}
              className={cn(
                "mx-auto flex h-7 w-7 items-center justify-center rounded-md text-xs tabular-nums",
                sameDay(d, from) || sameDay(d, to)
                  ? "bg-primary font-semibold text-primary-foreground"
                  : inRange(d)
                    ? "bg-secondary"
                    : "hover:bg-accent",
                sameDay(d, today) && !sameDay(d, from) && !sameDay(d, to) && "ring-1 ring-primary"
              )}
            >
              {d.getDate()}
            </button>
          ) : (
            <span key={i} />
          )
        )}
      </div>
    </div>
  );
}
