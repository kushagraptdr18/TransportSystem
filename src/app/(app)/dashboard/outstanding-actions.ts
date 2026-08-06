"use server";

import { requireSession } from "@/lib/session";
import { withTenant, type Tx } from "@/lib/db";
import { toNum } from "@/lib/utils";
import { round2 } from "@/lib/calc/tds";
import { invoiceSettlement, payableSettlement } from "@/lib/settlement";

/**
 * Receivables & Payables with party-wise ageing. Same settlement math as the
 * Outstanding browser, bucketed by document age: 0-30 / 31-60 / 61-90 / 90+.
 */

export type OutSide = "RECV" | "PAY";

export interface AgeingDoc {
  refNo: string;
  date: string; // ISO
  type: string;
  amount: number;
  settled: number;
  outstanding: number;
  days: number;
}

export interface AgeingRow {
  partyId: string | null;
  party: string;
  mobile: string | null;
  b0: number; // 0-30 days
  b31: number; // 31-60
  b61: number; // 61-90
  b90: number; // 90+
  total: number;
  oldestDays: number;
  docs: AgeingDoc[];
}

export interface OutstandingData {
  rows: AgeingRow[];
  totals: { b0: number; b31: number; b61: number; b90: number; total: number; parties: number };
}

const dayMs = 24 * 3600 * 1000;

type RawDoc = {
  partyId: string | null;
  partyName: string | null; // fallback label when there is no party link (hire slips)
  refNo: string;
  date: Date;
  type: string;
  amount: number;
  settled: number;
  outstanding: number;
};

async function collect(tx: Tx, scope: { firmId: string; fyId: string }, side: OutSide): Promise<RawDoc[]> {
  const out: RawDoc[] = [];
  if (side === "RECV") {
    const invoices = await tx.invoice.findMany({ where: { ...scope, deletedAt: null } });
    const settle = await invoiceSettlement(tx, { ...scope, invoices });
    for (const i of invoices) {
      const s = settle.get(i.id);
      if (!s || s.outstanding <= 0.009) continue;
      out.push({
        partyId: i.partyId,
        partyName: null,
        refNo: i.invoiceNo,
        date: i.invoiceDate,
        type: `BILL (${i.kind})`,
        amount: s.net,
        settled: s.received,
        outstanding: s.outstanding,
      });
    }
    return out;
  }
  const [chalans, slips, hires, brokerVehicles] = await Promise.all([
    tx.chalan.findMany({ where: { ...scope, deletedAt: null, cancelledAt: null, isFinal: true } }),
    tx.brokerSlip.findMany({ where: { ...scope, deletedAt: null } }),
    tx.hireSlip.findMany({ where: { ...scope, deletedAt: null } }),
    tx.vehicle.findMany({ where: { ownershipType: "BROKER" }, select: { id: true } }),
  ]);
  const market = new Set(brokerVehicles.map((v) => v.id));
  const marketChalans = chalans.filter((c) => market.has(c.vehicleId));
  const chalanPos = await payableSettlement(tx, {
    ...scope,
    refType: "FREIGHT_CHALLAN",
    docs: marketChalans.map((c) => ({
      id: c.id,
      balance: toNum(String(c.balance)),
      ownPaid: toNum(String(c.balPaidAmount)),
      ownShortage: toNum(String(c.balShortage)),
      ownRoundOff: toNum(String(c.balRoundOff)),
      ownAdvanceAdjusted: toNum(String(c.balAdvanceAdjusted)),
    })),
  });
  for (const c of marketChalans) {
    const p = chalanPos.get(c.id);
    if (!p || p.outstanding <= 0.009) continue;
    out.push({
      partyId: c.brokerId,
      partyName: null,
      refNo: c.chalanNo,
      date: c.chalanDate,
      type: "CHALAN",
      amount: p.balance,
      settled: p.settled,
      outstanding: p.outstanding,
    });
  }
  const slipPos = await payableSettlement(tx, {
    ...scope,
    refType: "BROKER_ENTRY",
    docs: slips.map((s) => ({
      id: s.id,
      balance: toNum(String(s.vBalance)),
      ownPaid: toNum(String(s.vPaidAmount)),
      ownShortage: toNum(String(s.vShortage)),
      ownRoundOff: toNum(String(s.vRoundOff)),
    })),
  });
  for (const s of slips) {
    const p = slipPos.get(s.id);
    if (!p || p.outstanding <= 0.009) continue;
    out.push({
      partyId: s.ownerId,
      partyName: s.ownerName ?? null,
      refNo: s.slipNo,
      date: s.slipDate,
      type: "BROKER SLIP",
      amount: p.balance,
      settled: p.settled,
      outstanding: p.outstanding,
    });
  }
  const hirePos = await payableSettlement(tx, {
    ...scope,
    refType: "LORRY_HIRE",
    docs: hires.map((h) => ({
      id: h.id,
      balance: toNum(String(h.balance)),
      ownPaid: 0,
      ownShortage: 0,
      ownRoundOff: 0,
    })),
  });
  for (const h of hires) {
    const p = hirePos.get(h.id);
    if (!p || p.outstanding <= 0.009) continue;
    out.push({
      partyId: null,
      partyName: h.ownerName || h.brokerName || "(hire slip)",
      refNo: h.slipNo,
      date: h.slipDate,
      type: "HIRE SLIP",
      amount: p.balance,
      settled: p.settled,
      outstanding: p.outstanding,
    });
  }
  return out;
}

export async function getOutstandingAgeing(input: {
  side: OutSide;
}): Promise<{ ok: true; data: OutstandingData } | { ok: false; error: string }> {
  const session = requireSession();
  try {
    const scope = { firmId: session.firmId, fyId: session.fyId };
    const data = await withTenant(session.tenantId, async (tx) => {
      const [docs, parties] = await Promise.all([
        collect(tx, scope, input.side),
        tx.party.findMany({ select: { id: true, name: true, mobile: true } }),
      ]);
      const partyById = new Map(parties.map((p) => [p.id, p]));
      const now = Date.now();

      const byParty = new Map<string, AgeingRow>();
      for (const d of docs) {
        const key = d.partyId ?? `name:${(d.partyName ?? "").toLowerCase()}`;
        const p = d.partyId ? partyById.get(d.partyId) : null;
        let row = byParty.get(key);
        if (!row) {
          row = {
            partyId: d.partyId,
            party: p?.name ?? d.partyName ?? "(unknown)",
            mobile: p?.mobile ?? null,
            b0: 0,
            b31: 0,
            b61: 0,
            b90: 0,
            total: 0,
            oldestDays: 0,
            docs: [],
          };
          byParty.set(key, row);
        }
        const days = Math.max(0, Math.floor((now - d.date.getTime()) / dayMs));
        if (days <= 30) row.b0 += d.outstanding;
        else if (days <= 60) row.b31 += d.outstanding;
        else if (days <= 90) row.b61 += d.outstanding;
        else row.b90 += d.outstanding;
        row.total += d.outstanding;
        row.oldestDays = Math.max(row.oldestDays, days);
        row.docs.push({
          refNo: d.refNo,
          date: d.date.toISOString(),
          type: d.type,
          amount: round2(d.amount),
          settled: round2(d.settled),
          outstanding: round2(d.outstanding),
          days,
        });
      }
      const rows = Array.from(byParty.values())
        .map((r) => ({
          ...r,
          b0: round2(r.b0),
          b31: round2(r.b31),
          b61: round2(r.b61),
          b90: round2(r.b90),
          total: round2(r.total),
          docs: r.docs.sort((a, b) => b.days - a.days),
        }))
        .sort((a, b) => b.total - a.total);
      const totals = {
        b0: round2(rows.reduce((s, r) => s + r.b0, 0)),
        b31: round2(rows.reduce((s, r) => s + r.b31, 0)),
        b61: round2(rows.reduce((s, r) => s + r.b61, 0)),
        b90: round2(rows.reduce((s, r) => s + r.b90, 0)),
        total: round2(rows.reduce((s, r) => s + r.total, 0)),
        parties: rows.length,
      };
      return { rows, totals };
    });
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to load outstanding" };
  }
}
