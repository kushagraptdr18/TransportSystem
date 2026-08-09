"use client";

import { Button } from "@/components/ui/button";

/**
 * Screen-only toolbar. Hidden on paper so the sheet prints as a plain
 * challan with nothing marking it as audit output.
 */
export function AuditPrintToolbar({ count }: { count: number }) {
  return (
    <div className="no-print mx-auto mb-4 flex max-w-[190mm] items-center justify-end gap-3 print:hidden">
      {count > 1 && (
        <span className="text-sm text-muted-foreground">
          {count} challans — one per page
        </span>
      )}
      <Button size="sm" onClick={() => window.print()}>
        Print
      </Button>
    </div>
  );
}
