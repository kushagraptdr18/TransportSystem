import { requireSession } from "@/lib/session";
import { authorize } from "@/lib/authz";
import { withTenant } from "@/lib/db";
import { toNum } from "@/lib/utils";
import { DriverFnfClient, type FnfRow } from "@/components/vehicle/driver-fnf-client";

export const dynamic = "force-dynamic";

export default async function DriverFnfPage() {
  const session = requireSession();
  await authorize(session, "maintenance", "view");

  const { rows, drivers, banks } = await withTenant(session.tenantId, async (tx) => {
    const [fnfs, drivers, banks] = await Promise.all([
      tx.driverFnf.findMany({
        where: { firmId: session.firmId, deletedAt: null },
        orderBy: { createdAt: "desc" },
      }),
      tx.driver.findMany({ where: { firmId: session.firmId, deletedAt: null }, orderBy: { name: "asc" } }),
      tx.party.findMany({
        where: { isActive: true, ledgerGroup: { in: ["BANK", "CASH"] } },
        orderBy: { name: "asc" },
      }),
    ]);
    return { rows: fnfs, drivers, banks };
  });

  const driverName = new Map(drivers.map((d) => [d.id, `${d.name} (${d.driverCode})`]));

  const data: FnfRow[] = rows.map((f) => ({
    id: f.id,
    settlementNo: f.settlementNo,
    date: f.date.toISOString(),
    driver: driverName.get(f.driverId) ?? "",
    lastWorkingDate: f.lastWorkingDate ? f.lastWorkingDate.toISOString() : null,
    grossSalary: toNum(String(f.grossSalary)),
    shortageAdjust: toNum(String(f.shortageAdjust)),
    advanceAdjust: toNum(String(f.advanceAdjust)),
    negativeAdjust: toNum(String(f.negativeAdjust)),
    otherRecoveries: toNum(String(f.otherRecoveries)),
    otherPayments: toNum(String(f.otherPayments)),
    finalPayable: toNum(String(f.finalPayable)),
    paymentMode: f.paymentMode ?? "",
    remarks: f.remarks ?? "",
  }));

  return (
    <div className="space-y-4 p-4">
      <DriverFnfClient
        rows={data}
        driverOptions={drivers
          .filter((d) => d.status === "ACTIVE")
          .map((d) => ({ value: d.id, label: `${d.name} (${d.driverCode})` }))}
        bankOptions={banks.map((b) => ({ value: b.id, label: b.name, meta: b.ledgerGroup }))}
      />
    </div>
  );
}
