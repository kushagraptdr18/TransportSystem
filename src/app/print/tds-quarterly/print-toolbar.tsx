"use client";

import { Button } from "@/components/ui/button";

export function PrintToolbar() {
  return (
    <div className="no-print mx-auto mb-4 flex max-w-[277mm] items-center justify-end gap-2 print:hidden">
      <span className="text-sm text-muted-foreground">
        Use the print dialog&apos;s &quot;Save as PDF&quot; for a PDF copy
      </span>
      <Button size="sm" onClick={() => window.print()}>
        Print
      </Button>
    </div>
  );
}
