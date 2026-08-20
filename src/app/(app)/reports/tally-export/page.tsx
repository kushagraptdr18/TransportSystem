import Link from "next/link";
import { requireSession } from "@/lib/session";
import { authorize } from "@/lib/authz";
import { withTenant } from "@/lib/db";
import { voucherHash } from "@/lib/tally";
import { Button } from "@/components/ui/button";
import { FilterBar } from "@/components/data/filter-bar";
import { TallyExportClient, type TallyExportRow } from "@/components/reports/tally-export-client";
import { buildChalanVouchers } from "./build";

export const dynamic = "force-dynamic";

/**
 * Reports → Tally Export. Phase 1: chalan vouchers (broker/relative vehicles
 * only) in the user's exact Tally entry style, with a duplicate-proof export
 * register. Billing / broker slip / expenses follow as further phases.
 */
export default async function TallyExportPage({
  searchParams,
}: {
  searchParams: { date_from?: string; date_to?: string };
}) {
  const session = requireSession();
  await authorize(session, "reports", "view");

  const dateFrom = searchParams.date_from ? new Date(`${searchParams.date_from}T00:00:00`) : null;
  const dateTo = searchParams.date_to ? new Date(`${searchParams.date_to}T23:59:59`) : null;

  const rows = await withTenant(session.tenantId, async (tx) => {
    const { docs } = await buildChalanVouchers(tx, session, { dateFrom, dateTo });
    const keys = docs.flatMap((d) => d.vouchers.map((v) => v.key));
    const registry = new Map(
      (
        await tx.tallyExportEntry.findMany({
          where: { firmId: session.firmId, key: { in: keys } },
        })
      ).map((r) => [r.key, r.hash])
    );
    return docs.map((d): TallyExportRow => {
      let fresh = 0;
      let changed = 0;
      let done = 0;
      for (const v of d.vouchers) {
        const prev = registry.get(v.key);
        if (prev === undefined) fresh += 1;
        else if (prev === voucherHash(v)) done += 1;
        else changed += 1;
      }
      return {
        chalanId: d.chalanId,
        chalanNo: d.chalanNo,
        dateIso: d.dateIso,
        broker: d.broker,
        vehicle: d.vehicle,
        ownership: d.ownership === "BROKER" ? "Broker" : "Relative",
        grandTotal: d.grandTotal,
        voucherCount: d.vouchers.length,
        fresh,
        changed,
        done,
      };
    });
  });

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Tally Export — Chalan</h1>
        <Button asChild variant="outline" size="sm">
          <Link href="/settings/tally">Ledger Mapping</Link>
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Sirf Broker / Relative gaadiyon ke FINAL chalan (own gaadi ka chalan Tally mein nahi
        jata). Download ke baad Tally Prime mein: <b>Alt+O → Import → Transactions</b>. Pehli
        baar &quot;Party Masters&quot; bhi import kar lena. Har voucher ek hi baar jata hai —
        badla hua chalan &quot;Changed&quot; dikhega aur dobara chala jayega.
      </p>
      <FilterBar filters={[{ type: "daterange", key: "date", label: "Chalan Date" }]} />
      <TallyExportClient
        rows={rows}
        dateFrom={searchParams.date_from ?? null}
        dateTo={searchParams.date_to ?? null}
      />
    </div>
  );
}
