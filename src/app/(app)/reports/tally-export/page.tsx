import Link from "next/link";
import { requireSession } from "@/lib/session";
import { authorize } from "@/lib/authz";
import { withTenant } from "@/lib/db";
import { voucherHash } from "@/lib/tally";
import { Button } from "@/components/ui/button";
import { FilterBar } from "@/components/data/filter-bar";
import { TallyExportClient, type TallyExportRow } from "@/components/reports/tally-export-client";
import { buildModuleDocs, type TallyModule } from "./build";

export const dynamic = "force-dynamic";

const MODULES: { value: TallyModule; label: string }[] = [
  { value: "CHALAN", label: "Chalan (Purchase side)" },
  { value: "BILLING", label: "Billing (Sales)" },
  { value: "SLIP", label: "Broker Slip (dono side)" },
  { value: "VOUCHERS", label: "Receipts / Payments (Accounts)" },
  { value: "EXPENSES", label: "Vehicle Expenses" },
  { value: "OFFICE", label: "Office Income / Expenses" },
];

const HINTS: Record<TallyModule, string> = {
  CHALAN:
    "Sirf Broker / Relative gaadiyon ke FINAL chalan — own gaadi ka chalan Tally mein nahi jata. Period chalan/advance/balance kisi bhi entry se match karta hai.",
  BILLING:
    "Har bill ek Sales voucher — pura amount ek saath, ref = bill no. Paisa aane ki entries 'Receipts / Payments' module se jayengi.",
  SLIP: "Party side (Sales + katauti journals + receipts) hamesha; owner side sirf Broker/Relative gaadi par — own gaadi ki sirf party side.",
  VOUCHERS:
    "Accounts ke Receipt/Payment vouchers — TDS/Shortage/Other/Round-off alag lines, allocations se bill-wise Agst Refs (billing receipts, voucher-settled chalans, supplier payments sab yahi).",
  EXPENSES:
    "Vehicle expense vouchers — paid wale Payment (Dr head / Cr bank-cash-card), udhaar wale Journal (Cr supplier). Gaadi-wise allocation ki koi entry nahi jati.",
  OFFICE: "Office income/expense entries — paid → Payment/Receipt, udhaar → Journal supplier ke saath.",
};

/** Reports → Tally Export: all modules in the user's exact Tally entry style,
 *  with a duplicate-proof export register. */
export default async function TallyExportPage({
  searchParams,
}: {
  searchParams: { date_from?: string; date_to?: string; module?: string };
}) {
  const session = requireSession();
  await authorize(session, "tally", "view");

  const activeModule = (MODULES.some((m) => m.value === searchParams.module)
    ? searchParams.module
    : "CHALAN") as TallyModule;
  const dateFrom = searchParams.date_from ? new Date(`${searchParams.date_from}T00:00:00`) : null;
  const dateTo = searchParams.date_to ? new Date(`${searchParams.date_to}T23:59:59`) : null;

  const rows = await withTenant(session.tenantId, async (tx) => {
    const { docs } = await buildModuleDocs(tx, session, activeModule, { dateFrom, dateTo });
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
        docId: d.id,
        refNo: d.refNo,
        dateIso: d.dateIso,
        party: d.party,
        detail: d.detail,
        amount: d.amount,
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
        <h1 className="text-xl font-semibold">Tally Export</h1>
        <Button asChild variant="outline" size="sm">
          <Link href="/settings/tally">Ledger Mapping</Link>
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        {HINTS[activeModule]} Download ke baad Tally Prime mein: <b>Alt+O → Import → Transactions</b>;
        pehli baar &quot;Party Masters&quot; bhi. Har voucher ek hi baar jata hai — badla hua
        document &quot;CHANGED&quot; dikhega aur dobara chala jayega.
      </p>
      <FilterBar
        filters={[
          {
            type: "select",
            key: "module",
            label: "Module",
            options: MODULES.map((m) => ({ value: m.value, label: m.label })),
          },
          { type: "daterange", key: "date", label: "Period (koi bhi entry)" },
        ]}
      />
      {/* key: filter/module change remounts the client so the selection resets */}
      <TallyExportClient
        key={`${activeModule}:${searchParams.date_from ?? ""}:${searchParams.date_to ?? ""}`}
        rows={rows}
        module={activeModule}
        dateFrom={searchParams.date_from ?? null}
        dateTo={searchParams.date_to ?? null}
      />
    </div>
  );
}
