import type { Prisma } from "@prisma/client";
import { requireSession } from "@/lib/session";
import { authorize } from "@/lib/authz";
import { withTenant } from "@/lib/db";
import { toNum } from "@/lib/utils";
import {
  DriverSalaryClient,
  type DriverSalaryRow,
} from "@/components/vehicle/driver-salary-client";

export const dynamic = "force-dynamic";

export default async function DriverSalaryPage({
  searchParams,
}: {
  searchParams: { driver?: string; status?: string };
}) {
  const session = requireSession();
  await authorize(session, "maintenance", "view");

  const { salaries, shortages, drivers, banks } = await withTenant(session.tenantId, async (tx) => {
    const where: Prisma.DriverSalaryWhereInput = {
      firmId: session.firmId,
      fyId: session.fyId,
      deletedAt: null,
    };
    if (searchParams.driver) where.driverId = searchParams.driver;
    if (searchParams.status === "PENDING" || searchParams.status === "PAID") {
      where.paymentStatus = searchParams.status;
    }
    const [salaries, shortages, drivers, banks] = await Promise.all([
      tx.driverSalary.findMany({ where, orderBy: [{ month: "asc" }, { createdAt: "asc" }] }),
      tx.driverShortage.findMany({
        where: { firmId: session.firmId, deletedAt: null },
        orderBy: { date: "desc" },
      }),
      tx.driver.findMany({ where: { firmId: session.firmId, deletedAt: null }, orderBy: { name: "asc" } }),
      tx.party.findMany({
        where: { isActive: true, ledgerGroup: { in: ["BANK", "CASH"] } },
        orderBy: { name: "asc" },
      }),
    ]);
    return { salaries, shortages, drivers, banks };
  });

  const driverName = new Map(drivers.map((d) => [d.id, d.name]));

  // pending shortage (remaining) per driver — offered for adjustment at pay time
  const shortagePendingByDriver = new Map<string, number>();
  for (const s of shortages) {
    if (s.status !== "PENDING") continue;
    const remaining = toNum(String(s.amount)) - toNum(String(s.adjustedAmount));
    if (remaining <= 0) continue;
    shortagePendingByDriver.set(
      s.driverId,
      Math.round(((shortagePendingByDriver.get(s.driverId) ?? 0) + remaining) * 100) / 100
    );
  }

  // running salary balance per driver, chronological (unpaid carries forward)
  const runningByDriver = new Map<string, number>();
  const rows: DriverSalaryRow[] = salaries.map((s) => {
    const net = toNum(String(s.netPayable));
    const paid = toNum(String(s.paidAmount));
    const outstanding = Math.round((net - paid) * 100) / 100;
    const prevPending = runningByDriver.get(s.driverId) ?? 0;
    const running = Math.round((prevPending + outstanding) * 100) / 100;
    runningByDriver.set(s.driverId, running);
    return {
      id: s.id,
      driverId: s.driverId,
      driver: driverName.get(s.driverId) ?? "",
      month: s.month,
      salaryAmount: toNum(String(s.salaryAmount)),
      incentive: toNum(String(s.incentive)),
      bonus: toNum(String(s.bonus)),
      otherAllowance: toNum(String(s.otherAllowance)),
      advanceAdjust: toNum(String(s.advanceAdjust)),
      shortageDeduction: toNum(String(s.shortageDeduction)),
      otherDeductions: toNum(String(s.otherDeductions)),
      netPayable: net,
      paidAmount: paid,
      outstanding,
      prevPending,
      runningBalance: running,
      shortagePending: shortagePendingByDriver.get(s.driverId) ?? 0,
      paymentStatus:
        s.paymentStatus === "PAID" ? "PAID" : paid > 0 ? "PARTIAL" : "PENDING",
      paymentDate: s.paymentDate ? s.paymentDate.toISOString() : null,
      remarks: s.remarks ?? "",
    };
  });
  rows.reverse(); // newest first for display

  const shortageRows = shortages.map((s) => ({
    id: s.id,
    date: s.date.toISOString(),
    driver: driverName.get(s.driverId) ?? "",
    tripRef: s.tripRef ?? "",
    amount: toNum(String(s.amount)),
    status: s.status,
    remarks: s.remarks ?? "",
  }));

  return (
    <div className="space-y-4 p-4">
      <DriverSalaryClient
        rows={rows}
        shortages={shortageRows}
        driverOptions={drivers
          .filter((d) => d.status === "ACTIVE")
          .map((d) => ({ value: d.id, label: `${d.name} (${d.driverCode})` }))}
        allDriverOptions={drivers.map((d) => ({ value: d.id, label: d.name }))}
        bankOptions={banks.map((b) => ({ value: b.id, label: b.name, meta: b.ledgerGroup }))}
        canDelete={session.role === "ADMIN" || session.role === "OWNER"}
      />
    </div>
  );
}
