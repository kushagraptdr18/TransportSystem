import { requireSession } from "@/lib/session";
import { authorize } from "@/lib/authz";
import { withTenant } from "@/lib/db";
import { EwayClient, type EwayRow, type EwayTab } from "./eway-client";

export const dynamic = "force-dynamic";

/**
 * E-Way Bill monitoring: five calendar-date tabs (today ±2, today default).
 * A tab lists every LR whose e-way expiry falls on that date — plus, on past
 * tabs, LRs that USED to expire that day and were extended (shown as
 * "Extended Till"). No pagination: the whole list renders, scrolling.
 */

const calDate = (d: Date) => new Date(d.getTime() + 12 * 3600 * 1000).toISOString().slice(0, 10);

export default async function EwayPage() {
  const session = requireSession();
  await authorize(session, "lr", "view");

  // today's calendar date in IST, independent of server timezone
  const todayCal = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
  const dayMs = 24 * 3600 * 1000;
  const base = new Date(`${todayCal}T00:00:00Z`).getTime();
  const tabs: EwayTab[] = [-2, -1, 0, 1, 2].map((off) => {
    const iso = new Date(base + off * dayMs).toISOString().slice(0, 10);
    return { date: iso, isPast: off < 0, isToday: off === 0 };
  });

  const { rows } = await withTenant(session.tenantId, async (tx) => {
    const lrs = await tx.lr.findMany({
      where: {
        firmId: session.firmId,
        fyId: session.fyId,
        deletedAt: null,
        ewayBillNo: { not: null },
        ewayExpiry: { not: null },
      },
      select: {
        id: true,
        lrNo: true,
        lrDate: true,
        vehicleId: true,
        vehicleText: true,
        ewayBillNo: true,
        ewayExpiry: true,
      },
      orderBy: { lrDate: "asc" },
    });
    const [vehicles, monitors] = await Promise.all([
      tx.vehicle.findMany({ select: { id: true, number: true } }),
      tx.ewayMonitor.findMany({ where: { lrId: { in: lrs.map((l) => l.id) } } }),
    ]);
    const vname = new Map(vehicles.map((v) => [v.id, v.number]));
    const mon = new Map(monitors.map((m) => [m.lrId, m]));

    const rows: EwayRow[] = lrs.map((l) => {
      const m = mon.get(l.id);
      return {
        lrId: l.id,
        lrNo: l.lrNo,
        lrDate: l.lrDate.toISOString(),
        vehicle: (l.vehicleId ? vname.get(l.vehicleId) : null) ?? l.vehicleText ?? "",
        ewayNo: l.ewayBillNo ?? "",
        expiry: calDate(l.ewayExpiry as Date),
        prevExpiries: Array.isArray(m?.prevExpiries) ? (m?.prevExpiries as string[]) : [],
        checked: !!m?.checkedAt,
        checkedBy: m?.checkedBy ?? null,
        checkedAt: m?.checkedAt ? m.checkedAt.toISOString() : null,
      };
    });
    return { rows };
  });

  return <EwayClient tabs={tabs} rows={rows} todayCal={todayCal} />;
}
