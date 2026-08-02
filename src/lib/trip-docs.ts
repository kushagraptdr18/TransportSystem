import type { Tx } from "./db";
import { round2 } from "./calc/tds";

/**
 * Grand Total of a chalan / broker slip, as consumed by the Trip Sheet.
 *
 *   Grand Total = Freight + Detention + ODC + Fine Slip + Other
 *                 − LD − Commission − Mamul − Courier − other deductions
 *
 * Both documents already compute and store exactly this figure - the chalan as
 * `grandTotal` (see `computeChalan`), the broker slip as `vNetAmt` (see
 * `computeBrokerSide`). This module deliberately does NOT recompute it from the
 * component columns: a second implementation of the same formula would drift
 * from the source document the first time either side changed. Reading the
 * stored total also means an edit to the chalan reflects in the trip sheet and
 * the vehicle report immediately, with nothing to re-save.
 *
 * Broker slips carry two sides. The trip sheet uses the OWNER side (`v*`), for
 * the same reason its rate and freight columns already do: the trip settles what
 * the vehicle earns, not what the customer is billed.
 */

export const TRIP_DOC_TYPES = ["CHALAN", "BROKER_SLIP"] as const;
export type TripDocType = (typeof TRIP_DOC_TYPES)[number];

function n(v: unknown): number {
  const x = Number(String(v ?? 0));
  return isNaN(x) ? 0 : x;
}

export interface DocTotals {
  /** base freight, before any addition or deduction */
  freight: number;
  /** detention + ODC + fine slip + other */
  additions: number;
  /** LD + commission + mamul + courier + TDS + shortage */
  deductions: number;
  /** freight + additions − deductions */
  grandTotal: number;
}

/** Shape of the chalan columns this module reads. */
interface ChalanLike {
  freight: unknown;
  detention: unknown;
  odcAmt: unknown;
  fineSlip: unknown;
  otherAmt: unknown;
  ldCharge: unknown;
  shortageAmt: unknown;
  mamool: unknown;
  courierCharge: unknown;
  commissionAmt: unknown;
  tdsAmt: unknown;
  grandTotal: unknown;
}

export function chalanTotals(c: ChalanLike): DocTotals {
  const freight = n(c.freight);
  const additions = round2(n(c.detention) + n(c.odcAmt) + n(c.fineSlip) + n(c.otherAmt));
  const deductions = round2(
    n(c.ldCharge) +
      n(c.shortageAmt) +
      n(c.mamool) +
      n(c.courierCharge) +
      n(c.commissionAmt) +
      n(c.tdsAmt)
  );
  return { freight, additions, deductions, grandTotal: n(c.grandTotal) };
}

/** Shape of the broker-slip owner-side columns this module reads. */
interface SlipLike {
  vFreight: unknown;
  vDetention: unknown;
  vOdcAmt: unknown;
  vFineAmt: unknown;
  vLdCharge: unknown;
  vShortageAmt: unknown;
  vMamool: unknown;
  vPaymentAmt: unknown;
  vCommAmt: unknown;
  vTdsAmt: unknown;
  vNetAmt: unknown;
}

export function slipTotals(s: SlipLike): DocTotals {
  const freight = n(s.vFreight);
  const additions = round2(n(s.vDetention) + n(s.vOdcAmt) + n(s.vFineAmt));
  const deductions = round2(
    n(s.vLdCharge) +
      n(s.vShortageAmt) +
      n(s.vMamool) +
      n(s.vPaymentAmt) +
      n(s.vCommAmt) +
      n(s.vTdsAmt)
  );
  return { freight, additions, deductions, grandTotal: n(s.vNetAmt) };
}

/**
 * Live trip income, keyed by trip id: the Grand Total of every chalan / broker
 * slip linked to that trip.
 *
 * The trip also stores a freight snapshot (`gFreight`), but the vehicle report
 * must reflect a later edit to the source document without the trip sheet being
 * re-saved, so it reads through the TripDoc links instead. Trips with no links -
 * legacy sheets entered before the link table existed - are simply absent from
 * the map, and the caller falls back to the stored figure.
 */
export async function tripGrandTotals(
  tx: Tx,
  tripIds: string[]
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!tripIds.length) return out;

  const links = await tx.tripDoc.findMany({
    where: { tripId: { in: tripIds } },
    select: { tripId: true, refType: true, refId: true },
  });
  if (!links.length) return out;

  const chalanIds = links.filter((l) => l.refType === "CHALAN").map((l) => l.refId);
  const slipIds = links.filter((l) => l.refType === "BROKER_SLIP").map((l) => l.refId);

  const [chalans, slips] = await Promise.all([
    chalanIds.length
      ? tx.chalan.findMany({ where: { id: { in: chalanIds }, deletedAt: null } })
      : Promise.resolve([]),
    slipIds.length
      ? tx.brokerSlip.findMany({ where: { id: { in: slipIds }, deletedAt: null } })
      : Promise.resolve([]),
  ]);

  const chalanTotal = new Map(chalans.map((c) => [c.id, chalanTotals(c).grandTotal]));
  const slipTotal = new Map(slips.map((s) => [s.id, slipTotals(s).grandTotal]));

  for (const l of links) {
    const amount =
      l.refType === "CHALAN" ? chalanTotal.get(l.refId) : slipTotal.get(l.refId);
    // a deleted source document contributes nothing, but the trip still counts
    // as linked - otherwise it would silently fall back to a stale snapshot
    out.set(l.tripId, round2((out.get(l.tripId) ?? 0) + (amount ?? 0)));
  }
  return out;
}
