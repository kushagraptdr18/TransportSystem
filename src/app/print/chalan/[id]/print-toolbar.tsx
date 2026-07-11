"use client";

import { useRouter, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function PrintToolbar({ copies }: { copies: number }) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <div className="no-print mx-auto mb-4 flex max-w-[190mm] items-center justify-end gap-2 print:hidden">
      <span className="text-sm text-muted-foreground">Copies</span>
      <Select
        value={String(copies)}
        onValueChange={(v) => router.replace(`${pathname}?copies=${v}`)}
      >
        <SelectTrigger className="h-8 w-16">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {[1, 2, 3].map((n) => (
            <SelectItem key={n} value={String(n)}>
              {n}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button size="sm" onClick={() => window.print()}>
        Print
      </Button>
    </div>
  );
}
