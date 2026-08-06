"use server";

import { requireSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { toNum } from "@/lib/utils";
import { round2 } from "@/lib/calc/tds";

/**
 * Income & margin summary cards on the dashboard. The date filter lives only
 * on this section — the rest of the dashboard is untouched by it.
 */

export interface FinanceCards {
  income: number;
  booking: { lrFreight: number; marketFreight: number; ownFreight: number; margin: number };
  broker: { partyAmt: number; ownerAmt: number; margin: number };
  commission: number;
  mamool: number;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function getFinanceCards(input: {
  from: string;
  to: string;
}): Promise<{ ok: true; data: FinanceCards } | { ok: false; error: string }> {
  const session = requireSession();
  if (!DATE_RE.test(input.from) || !DATE_RE.test(input.to)) {
    return { ok: false, error: "Valid date range is required" };
  }
  if (input.from > input.to) {
    return { ok: false, error: "From date is after To date" };
  }
  try {
    const gte = new Date(`${input.from}T00:00:00`);
    const lt = new Date(new Date(`${input.to}T00:00:00`).getTime() + 24 * 3600 * 1000);
    const scope = { firmId: session.firmId, fyId: session.fyId };

    const data = await withTenant(session.tenantId, async (tx) => {
      const heads = await tx.accountHead.findMany({ select: { id: true, name: true, kind: true } });
      const incomeHeadIds = heads.filter((h) => h.kind === "INCOME").map((h) => h.id);
      const headIdByName = new Map(heads.map((h) => [h.name.toLowerCase(), h.id]));

      const ledgerNet = async (headIds: string[]): Promise<number> => {
        if (!headIds.length) return 0;
        const grouped = await tx.ledgerEntry.groupBy({
          by: ["side"],
          where: { ...scope, accountHeadId: { in: headIds }, date: { gte, lt } },
          _sum: { amount: true },
        });
        const of = (side: string) =>
          toNum(String(grouped.find((g) => g.side === side)?._sum.amount ?? 0));
        // income direction: credit builds the balance, debit reduces it
        return round2(of("CREDIT") - of("DEBIT"));
      };

      const [income, commission, mamool, lrAgg, chalans, slipAgg] = await Promise.all([
        ledgerNet(incomeHeadIds),
        ledgerNet([headIdByName.get("commission")].filter(Boolean) as string[]),
        ledgerNet(
          [headIdByName.get("mamool") ?? headIdByName.get("mamul")].filter(Boolean) as string[]
        ),
        tx.lr.aggregate({
          where: {
            ...scope,
            deletedAt: null,
            lrType: { notIn: ["CANCELLED", "PAPER_CHANGE"] },
            lrDate: { gte, lt },
          },
          _sum: { freight: true },
        }),
        // only active (non-cancelled) chalans count toward the margin
        tx.chalan.findMany({
          where: { ...scope, deletedAt: null, cancelledAt: null, chalanDate: { gte, lt } },
          select: { vehicleId: true, freight: true },
        }),
        tx.brokerSlip.aggregate({
          where: { ...scope, deletedAt: null, slipDate: { gte, lt } },
          _sum: { pChalanAmt: true, vChalanAmt: true },
        }),
      ]);

      const brokerVehicles = new Set(
        (
          await tx.vehicle.findMany({ where: { ownershipType: "BROKER" }, select: { id: true } })
        ).map((v) => v.id)
      );
      let marketFreight = 0;
      let ownFreight = 0;
      for (const c of chalans) {
        const f = toNum(String(c.freight));
        if (brokerVehicles.has(c.vehicleId)) marketFreight += f;
        else ownFreight += f;
      }
      marketFreight = round2(marketFreight);
      ownFreight = round2(ownFreight);

      const lrFreight = round2(toNum(String(lrAgg._sum.freight ?? 0)));
      const partyAmt = round2(toNum(String(slipAgg._sum.pChalanAmt ?? 0)));
      const ownerAmt = round2(toNum(String(slipAgg._sum.vChalanAmt ?? 0)));

      return {
        income,
        booking: {
          lrFreight,
          marketFreight,
          ownFreight,
          margin: round2(lrFreight - marketFreight - ownFreight),
        },
        broker: { partyAmt, ownerAmt, margin: round2(partyAmt - ownerAmt) },
        commission,
        mamool,
      } satisfies FinanceCards;
    });
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to load summary" };
  }
}
