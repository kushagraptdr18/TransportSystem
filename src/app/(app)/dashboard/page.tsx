import { FileCheck2 } from "lucide-react";
import { requireSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

/**
 * Operational dashboard — E-Way Bill monitoring front door. The card opens the
 * full monitoring screen (five date tabs, check + extend) in a new window.
 */

const calDate = (d: Date) => new Date(d.getTime() + 12 * 3600 * 1000).toISOString().slice(0, 10);

export default async function DashboardPage() {
  const session = requireSession();

  const todayCal = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
  const dayMs = 24 * 3600 * 1000;
  const base = new Date(`${todayCal}T00:00:00Z`).getTime();
  const window = [-2, -1, 0, 1, 2].map((off) => new Date(base + off * dayMs).toISOString().slice(0, 10));

  const { expiredCount, todayCount, upcomingCount } = await withTenant(
    session.tenantId,
    async (tx) => {
      const lrs = await tx.lr.findMany({
        where: {
          firmId: session.firmId,
          fyId: session.fyId,
          deletedAt: null,
          ewayBillNo: { not: null },
          ewayExpiry: { not: null },
        },
        select: { ewayExpiry: true },
      });
      let expiredCount = 0;
      let todayCount = 0;
      let upcomingCount = 0;
      for (const l of lrs) {
        const c = calDate(l.ewayExpiry as Date);
        if (!window.includes(c)) continue;
        if (c < todayCal) expiredCount++;
        else if (c === todayCal) todayCount++;
        else upcomingCount++;
      }
      return { expiredCount, todayCount, upcomingCount };
    }
  );

  return (
    <div className="space-y-4 p-4">
      <h1 className="page-title">Dashboard</h1>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <a href="/eway" target="_blank" rel="noreferrer" className="group">
          <Card className="h-full transition-all hover:border-primary/40 hover:shadow-card">
            <CardContent className="flex items-start gap-3 p-5">
              <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <FileCheck2 className="h-6 w-6" />
              </span>
              <span className="min-w-0">
                <span className="block text-lg font-semibold group-hover:text-primary">
                  E-Way Bill (3 Days)
                </span>
                <span className="block text-sm text-muted-foreground">
                  Expiring e-way bills — check &amp; extend from one screen
                </span>
                <span className="mt-2 flex flex-wrap gap-2 text-xs font-medium">
                  <span className="rounded bg-red-500/10 px-2 py-0.5 text-red-600">
                    Expired: {expiredCount}
                  </span>
                  <span className="rounded bg-amber-500/10 px-2 py-0.5 text-amber-600">
                    Today: {todayCount}
                  </span>
                  <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-emerald-600">
                    Next 2 days: {upcomingCount}
                  </span>
                </span>
              </span>
            </CardContent>
          </Card>
        </a>
      </div>
    </div>
  );
}
