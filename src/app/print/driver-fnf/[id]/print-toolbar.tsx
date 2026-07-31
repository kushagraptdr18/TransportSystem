"use client";

import { Button } from "@/components/ui/button";

export function PrintToolbar() {
  return (
    <div className="no-print mx-auto mb-4 flex max-w-[190mm] items-center justify-end gap-2 print:hidden">
      <Button size="sm" onClick={() => window.print()}>
        Print
      </Button>
    </div>
  );
}
