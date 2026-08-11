"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Prints the current page — the app chrome is `no-print`, so only content goes to paper. */
export function PrintButton() {
  return (
    <Button type="button" variant="outline" size="sm" className="no-print" onClick={() => window.print()}>
      <Printer className="mr-1 h-4 w-4" />
      Print
    </Button>
  );
}
