import { requireSession } from "@/lib/session";
import { authorize } from "@/lib/authz";
import { withTenant } from "@/lib/db";
import { toNum } from "@/lib/utils";
import { RoutesClient, type RouteRow } from "./routes-client";

export const dynamic = "force-dynamic";

/**
 * Route Heartbeat — which lanes are alive, cooling or asleep. Built entirely
 * from data already entered (LRs and broker slips); nothing new to key in.
 *
 * Status by days since the last trip: ≤7 ALIVE, 8–20 COOLING, >20 SLEEPING.
 * A lane with fewer than 3 lifetime trips stays in the OCCASIONAL bucket so a
 * one-off route can never cry wolf in red.
 */

const ALIVE_DAYS = 7;
const COOLING_DAYS = 20;
const MIN_TRIPS = 3;

export default async function RoutesPage() {
  const session = requireSession();
  await authorize(session, "reports", "view");

  const data = await withTenant(session.tenantId, async (tx) => {
    const scope = { firmId: session.firmId, fyId: session.fyId, deletedAt: null as null };
    const [lrs, slips, cities, parties] = await Promise.all([
      tx.lr.findMany({
        where: { ...scope, lrType: { notIn: ["CANCELLED", "PAPER_CHANGE"] } },
        select: {
          sourceCityId: true,
          destCityId: true,
          lrDate: true,
          grandTotal: true,
          consignorId: true,
        },
      }),
      tx.brokerSlip.findMany({
        where: scope,
        select: {
          loadStationId: true,
          destCityId: true,
          slipDate: true,
          pChalanAmt: true,
          partyId: true,
        },
      }),
      tx.city.findMany({ select: { id: true, name: true } }),
      tx.party.findMany({ select: { id: true, name: true, mobile: true } }),
    ]);
    return { lrs, slips, cities, parties };
  });

  const cityName = new Map(data.cities.map((c) => [c.id, c.name]));
  const partyOf = new Map(data.parties.map((p) => [p.id, p]));

  interface Trip {
    date: Date;
    freight: number;
    partyId: string | null;
  }
  const routes = new Map<string, { from: string; to: string; trips: Trip[] }>();
  const push = (fromId: string | null, toId: string | null, t: Trip) => {
    if (!fromId || !toId) return;
    const from = cityName.get(fromId);
    const to = cityName.get(toId);
    if (!from || !to) return;
    const key = `${from}→${to}`;
    const r = routes.get(key) ?? { from, to, trips: [] };
    r.trips.push(t);
    routes.set(key, r);
  };
  for (const l of data.lrs) {
    push(l.sourceCityId, l.destCityId, {
      date: l.lrDate,
      freight: toNum(l.grandTotal),
      partyId: l.consignorId,
    });
  }
  for (const s of data.slips) {
    push(s.loadStationId, s.destCityId, {
      date: s.slipDate,
      freight: toNum(s.pChalanAmt),
      partyId: s.partyId,
    });
  }

  const now = new Date();
  const monthKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}`;
  const thisMonth = monthKey(now);
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonth = monthKey(lastMonthDate);

  const rows: RouteRow[] = Array.from(routes.entries()).map(([key, r]) => {
    const total = r.trips.length;
    const last = r.trips.reduce((m, t) => (t.date > m ? t.date : m), r.trips[0].date);
    const daysSince = Math.floor((now.getTime() - last.getTime()) / 86400000);
    const tripsThisMonth = r.trips.filter((t) => monthKey(t.date) === thisMonth).length;
    const tripsLastMonth = r.trips.filter((t) => monthKey(t.date) === lastMonth).length;
    const avgFreight =
      Math.round((r.trips.reduce((s, t) => s + t.freight, 0) / Math.max(1, total)) * 100) / 100;
    const status =
      total < MIN_TRIPS
        ? "OCCASIONAL"
        : daysSince <= ALIVE_DAYS
          ? "ALIVE"
          : daysSince <= COOLING_DAYS
            ? "COOLING"
            : "SLEEPING";
    // top parties on this lane, by trips — the people to call when it sleeps
    const byParty = new Map<string, number>();
    for (const t of r.trips) {
      if (t.partyId) byParty.set(t.partyId, (byParty.get(t.partyId) ?? 0) + 1);
    }
    const topParties = Array.from(byParty.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, trips]) => ({
        name: partyOf.get(id)?.name ?? "",
        mobile: partyOf.get(id)?.mobile ?? null,
        trips,
      }))
      .filter((p) => p.name);
    return {
      route: key,
      totalTrips: total,
      tripsThisMonth,
      tripsLastMonth,
      lastTripDate: last.toISOString(),
      daysSince,
      avgFreight,
      status,
      topParties,
    };
  });

  rows.sort((a, b) => b.daysSince - a.daysSince);

  return <RoutesClient rows={rows} />;
}
