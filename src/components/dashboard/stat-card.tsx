import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatMoney } from "@/lib/utils";

export interface StatCardProps {
  label: string;
  count: number;
  /** This-month amount (optional). */
  amount?: number | null;
  href: string;
  icon: LucideIcon;
}

export function StatCard({ label, count, amount, href, icon: Icon }: StatCardProps) {
  return (
    <Link href={href} className="block">
      <Card className="transition-colors hover:border-primary/50 hover:bg-accent/40">
        <CardContent className="flex items-start gap-3 p-4">
          <div className="rounded-md bg-primary/10 p-2 text-primary">
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-xs font-medium text-muted-foreground">{label}</div>
            <div className="text-xl font-semibold tabular-nums">
              {count.toLocaleString("en-IN")}
            </div>
            {amount !== undefined && amount !== null && (
              <div className="truncate text-xs tabular-nums text-muted-foreground">
                ₹ {formatMoney(amount)} <span className="opacity-70">this month</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
