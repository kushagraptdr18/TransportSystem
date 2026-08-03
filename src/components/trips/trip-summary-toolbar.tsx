"use client";

import { Button } from "@/components/ui/button";

/**
 * Toolbar for the 360° Trip Summary. The sections are native <details>
 * elements, so Expand/Collapse simply flips their open attribute; Print
 * expands everything first so the paper always carries the full picture.
 */
export function TripSummaryToolbar({ tripId }: { tripId: string }) {
  const setAll = (open: boolean) => {
    document.querySelectorAll("details").forEach((d) => {
      d.open = open;
    });
  };
  return (
    <div className="mb-3 flex flex-wrap justify-end gap-2 print:hidden">
      <Button variant="outline" size="sm" onClick={() => setAll(true)}>
        Expand All
      </Button>
      <Button variant="outline" size="sm" onClick={() => setAll(false)}>
        Collapse All
      </Button>
      <Button variant="outline" size="sm" asChild>
        <a href={`/trips?id=${tripId}`} target="_blank" rel="noreferrer">
          Open Source Record
        </a>
      </Button>
      <Button
        size="sm"
        onClick={() => {
          setAll(true);
          setTimeout(() => window.print(), 50);
        }}
      >
        Print / PDF
      </Button>
    </div>
  );
}
