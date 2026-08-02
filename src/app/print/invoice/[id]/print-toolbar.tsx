"use client";

import { Button } from "@/components/ui/button";

export function PrintToolbar({ wide }: { wide?: boolean }) {
  return (
    <div
      className={`no-print mx-auto mb-4 flex items-center justify-end gap-2 print:hidden ${
        // match the sheet below it, so Print sits at its right edge either way
        wide ? "max-w-[277mm]" : "max-w-[190mm]"
      }`}
    >
      <Button size="sm" onClick={() => window.print()}>
        Print
      </Button>
    </div>
  );
}
