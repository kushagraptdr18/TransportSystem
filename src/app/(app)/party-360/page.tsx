import Link from "next/link";
import { requireSession } from "@/lib/session";
import { authorize } from "@/lib/authz";
import { withTenant } from "@/lib/db";
import { formatDate, formatMoney, toNum } from "@/lib/utils";
import { waLink } from "@/lib/phone";
import { round2 } from "@/lib/calc/tds";
import { invoiceSettlement, PAYABLE_REF_TYPES, settledByRef } from "@/lib/settlement";
import { buildTdsPayableRows } from "@/app/(app)/accounts/tds/payable-rows";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PrintButton } from "@/components/app/print-button";
import { Picker360 } from "./picker";

export const dynamic = "force-dynamic";

/**
 * Party 360° — one screen, the party's whole world: net position, business,
 * outstanding with age (both directions — bills we must collect AND freight we
 * must pay), open advances, TDS deducted, rate history, stuck bilties and the
 * ledger tail. Nothing new is stored; every figure comes from the same engines
 * the individual screens use.
 */
export default async function Party360Page({ searchParams }: { searchParams: { id?: string } }) {
  const session = requireSession();
  await authorize(session, "reports", "view");
  const partyId = searchParams.id ?? null;

  const data = await withTenant(session.tenantId, async (tx) => {
    const parties = await tx.party.findMany({
      where: { isActive: true, ledgerGroup: { notIn: ["BANK", "CASH", "CARD"] } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
    if (!partyId) return { parties, view: null };

    const scope = { firmId: session.firmId, fyId: session.fyId };
    const party = await tx.party.findFirst({ where: { id: partyId } });
    if (!party) return { parties, view: null };

    const [entries, invoices, advances, lrs, cities, ownRelVehicles] = await Promise.all([
      tx.ledgerEntry.findMany({
        where: { ...scope, partyId },
        orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      }),
      tx.invoice.findMany({ where: { ...scope, deletedAt: null, partyId } }),
      tx.partyAdvance.findMany({ where: { ...scope, deletedAt: null, partyId } }),
      tx.lr.findMany({
        where: {
          ...scope,
          deletedAt: null,
          OR: [{ consignorId: partyId }, { consigneeId: partyId }, { billToId: partyId }],
        },
        include: { items: { select: { rate: true } } },
        orderBy: { lrDate: "desc" },
      }),
      tx.city.findMany({ select: { id: true, name: true } }),
      // freight on OWNER/RELATIVE vehicles settles through its own workflows —
      // the same display rule the Outstanding Payables register follows
      tx.vehicle.findMany({
        where: { ownershipType: { in: ["OWNER", "RELATIVE"] } },
        select: { id: true },
      }),
    ]);

    const brokerVehicleOnly = ownRelVehicles.length
      ? { vehicleId: { notIn: ownRelVehicles.map((v) => v.id) } }
      : {};
    const [chalans, slips] = await Promise.all([
      tx.chalan.findMany({
        where: { ...scope, deletedAt: null, cancelledAt: null, brokerId: partyId, ...brokerVehicleOnly },
        orderBy: { chalanDate: "asc" },
        select: {
          id: true,
          chalanNo: true,
          chalanDate: true,
          grandTotal: true,
          advanceTotal: true,
          balPaidAmount: true,
          balRoundOff: true,
          balShortage: true,
          balAdvanceAdjusted: true,
        },
      }),
      tx.brokerSlip.findMany({
        where: { ...scope, deletedAt: null, ownerId: partyId, ...brokerVehicleOnly },
        orderBy: { slipDate: "asc" },
        select: {
          id: true,
          slipNo: true,
          slipDate: true,
          vNetAmt: true,
          vAdvance: true,
          vPaidAmount: true,
          vRoundOff: true,
          vShortage: true,
        },
      }),
    ]);

    const [settle, paidByRef] = await Promise.all([
      invoiceSettlement(tx, { ...scope, invoices }),
      // the ONE payable settlement formula — same figures as the Outstanding
      // Payables register and the chalan register
      settledByRef(tx, {
        ...scope,
        refTypes: PAYABLE_REF_TYPES,
        refIds: [...chalans.map((c) => c.id), ...slips.map((s) => s.id)],
      }),
    ]);

    // TDS we deducted while paying this party — read from THE payable row
    // source (register + quarterly report), never re-derived. Matched by the
    // STABLE party id (names can collide or be renamed); rows with no party
    // link (hire slips' free-text owner) fall back to an exact name match.
    const tdsDeducted = ["OWNER_BROKER", "SUPPLIERS"].includes(party.ledgerGroup)
      ? round2(
          (await buildTdsPayableRows(tx, scope)).rows
            .filter((r) => (r.partyId ? r.partyId === party.id : r.party === party.name))
            .reduce((s, r) => s + r.tdsAmt, 0)
        )
      : 0;

    return { parties, view: { party, entries, invoices, advances, lrs, cities, settle, chalans, slips, paidByRef, tdsDeducted } };
  });

  const { parties, view } = data;

  let body: React.ReactNode = (
    <div className="rounded-md border p-10 text-center text-sm text-muted-foreground">
      Select a party above to see its complete profile on one screen.
    </div>
  );

  if (view) {
    const { party, entries, invoices, advances, lrs, cities, settle, chalans, slips, paidByRef, tdsDeducted } = view;
    const cityName = new Map(cities.map((c) => [c.id, c.name]));

    // ledger: running balance, net position
    let running =
      party.openingSide === "DEBIT" ? toNum(party.openingBalance) : -toNum(party.openingBalance);
    const ledgerRows = entries.map((e) => {
      const amt = toNum(e.amount);
      const debit = e.side === "DEBIT" ? amt : 0;
      const credit = e.side === "CREDIT" ? amt : 0;
      running = round2(running + debit - credit);
      return { date: e.date, refType: e.refType, refNo: e.refNo, narration: e.narration ?? "", debit, credit, balance: running };
    });
    const net = running;
    const ledgerTail = ledgerRows.slice(-10);

    // receivable side: bills outstanding + oldest unpaid age
    const pendingBills = invoices
      .map((i) => ({ inv: i, pos: settle.get(i.id) }))
      .filter((x) => (x.pos?.outstanding ?? 0) > 0.009)
      .sort((a, b) => a.inv.invoiceDate.getTime() - b.inv.invoiceDate.getTime());
    const outstanding = round2(pendingBills.reduce((s, x) => s + (x.pos?.outstanding ?? 0), 0));
    const oldestDays = pendingBills.length
      ? Math.floor((Date.now() - pendingBills[0].inv.invoiceDate.getTime()) / 86400000)
      : 0;
    const totalBusiness = round2(invoices.reduce((s, i) => s + toNum(i.grandTotal), 0));

    // payable side: freight documents where this party is the payee, settled by
    // the exact formula the Outstanding Payables register uses (own-screen
    // payments + live voucher allocations, deductions included)
    const payableDocs = [
      ...chalans.map((c) => ({
        id: c.id,
        refNo: c.chalanNo,
        kind: "CHALAN",
        date: c.chalanDate,
        gross: toNum(c.grandTotal),
        own:
          toNum(c.advanceTotal) +
          toNum(c.balPaidAmount) +
          toNum(c.balRoundOff) +
          toNum(c.balShortage) +
          toNum(c.balAdvanceAdjusted),
      })),
      ...slips.map((s) => ({
        id: s.id,
        refNo: s.slipNo,
        kind: "SLIP",
        date: s.slipDate,
        gross: toNum(s.vNetAmt),
        own: toNum(s.vAdvance) + toNum(s.vPaidAmount) + toNum(s.vRoundOff) + toNum(s.vShortage),
      })),
    ]
      .filter((d) => d.gross > 0)
      .map((d) => {
        const paid = round2(d.own + (paidByRef.get(d.id) ?? 0));
        return { ...d, paid, outstanding: round2(d.gross - paid) };
      });
    const freightBusiness = round2(payableDocs.reduce((s, d) => s + d.gross, 0));
    const pendingPayables = payableDocs
      .filter((d) => d.outstanding > 0.009)
      .sort((a, b) => a.date.getTime() - b.date.getTime());
    const payableOutstanding = round2(pendingPayables.reduce((s, d) => s + d.outstanding, 0));
    const oldestPayDays = pendingPayables.length
      ? Math.floor((Date.now() - pendingPayables[0].date.getTime()) / 86400000)
      : 0;

    const advOpen = (kind: string) =>
      round2(
        advances
          .filter((a) => a.kind === kind)
          .reduce((s, a) => s + toNum(a.amount) - toNum(a.consumedAmount), 0)
      );
    const advReceived = advOpen("RECEIVED");
    const advPaid = advOpen("PAID");

    const stuckLrs = lrs.filter((l) => !["DELIVERED", "BILLED"].includes(l.status) && !["CANCELLED", "PAPER_CHANGE"].includes(l.lrType));
    const rateHistory = lrs.slice(0, 5).map((l) => ({
      date: l.lrDate,
      lrNo: l.lrNo,
      route: `${cityName.get(l.sourceCityId) ?? ""}→${cityName.get(l.destCityId) ?? ""}`,
      rate: l.items.length ? Math.max(...l.items.map((i) => toNum(i.rate))) : 0,
      freight: toNum(l.grandTotal),
    }));

    const hasBills = invoices.length > 0;
    const hasFreight = payableDocs.length > 0;
    // a customer sees the billing tiles, an owner/broker the freight tiles, a
    // party doing both sees both — nothing is ever hidden that has a figure
    const tiles: [string, string, string][] = [];
    if (hasBills || !hasFreight) tiles.push(["Total Business (bills, FY)", formatMoney(totalBusiness), ""]);
    if (hasFreight)
      tiles.push(["Freight Business (chalan + slip, FY)", formatMoney(freightBusiness), `${payableDocs.length} trip(s)`]);
    if (hasBills || !hasFreight)
      tiles.push([
        "Outstanding (receivable)",
        formatMoney(outstanding),
        pendingBills.length ? `${pendingBills.length} bill(s), sabse purana ${oldestDays} din` : "sab clear",
      ]);
    if (hasFreight)
      tiles.push([
        "Outstanding (payable)",
        formatMoney(payableOutstanding),
        pendingPayables.length
          ? `${pendingPayables.length} doc(s), sabse purana ${oldestPayDays} din`
          : "sab clear",
      ]);
    tiles.push(["Advance (received se bacha)", formatMoney(advReceived), ""]);
    tiles.push(["Advance (paid se bacha)", formatMoney(advPaid), ""]);
    if (Math.abs(tdsDeducted) > 0.009)
      tiles.push(["TDS Deducted (FY)", formatMoney(tdsDeducted), "TDS Payable register se"]);

    body = (
      <div className="space-y-3">
        {/* header */}
        <Card>
          <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
            <div>
              <div className="text-xl font-bold">{party.name}</div>
              <div className="text-sm text-muted-foreground">
                {[party.transportName, party.ledgerGroup, [party.address1, party.address2].filter(Boolean).join(", ")]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
              <div className="mt-1 flex flex-wrap gap-2 text-sm">
                {party.gstin && <Badge variant="outline">GSTIN {party.gstin}</Badge>}
                {party.mobile && (
                  <>
                    <a className="text-primary underline" href={`tel:${party.mobile}`}>
                      📞 {party.mobile}
                    </a>
                    {waLink(party.mobile) && (
                      <a
                        className="text-primary underline"
                        href={waLink(party.mobile)!}
                        target="_blank"
                        rel="noreferrer"
                      >
                        WhatsApp
                      </a>
                    )}
                  </>
                )}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground">Net Position (ledger)</div>
              <div className={`text-2xl font-black tabular-nums ${net >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                {formatMoney(Math.abs(net))} {net >= 0 ? "Receivable" : "Payable"}
              </div>
              <Link className="text-xs text-primary underline" href={`/accounts/ledger?party=${party.id}`}>
                Full Ledger →
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* tiles */}
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {tiles.map(([label, value, sub]) => (
            <div key={label} className="rounded-md border p-3">
              <div className="text-[11px] text-muted-foreground">{label}</div>
              <div className="text-lg font-bold tabular-nums">{value}</div>
              {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
            </div>
          ))}
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          {/* pending bills (receivable) */}
          {(hasBills || !hasFreight) && (
            <div className="rounded-md border p-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-black uppercase text-muted-foreground">
                  Pending Bills ({pendingBills.length})
                </span>
                <Link
                  className="text-xs text-primary underline"
                  href={`/accounts/outstanding?party=${party.id}`}
                >
                  Full Outstanding →
                </Link>
              </div>
              {pendingBills.length === 0 && <p className="text-xs text-muted-foreground">No bills outstanding.</p>}
              {pendingBills.slice(0, 8).map(({ inv, pos }) => (
                <div key={inv.id} className="flex items-center justify-between border-b py-1 text-xs last:border-0">
                  <span>
                    <b>{inv.invoiceNo}</b> · {formatDate(inv.invoiceDate.toISOString())}
                    <span className="text-muted-foreground">
                      {" "}({Math.floor((Date.now() - inv.invoiceDate.getTime()) / 86400000)} din)
                    </span>
                  </span>
                  <span className="font-medium tabular-nums">{formatMoney(pos?.outstanding ?? 0)}</span>
                </div>
              ))}
              {pendingBills.length > 8 && (
                <p className="pt-1 text-[11px] text-muted-foreground">
                  +{pendingBills.length - 8} aur — Full Outstanding mein dekhein
                </p>
              )}
            </div>
          )}

          {/* pending freight payables (chalan / broker slip) */}
          {hasFreight && (
            <div className="rounded-md border p-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-black uppercase text-muted-foreground">
                  Pending Chalans / Slips ({pendingPayables.length})
                </span>
                <Link
                  className="text-xs text-primary underline"
                  href={`/accounts/outstanding?tab=payable&party=${party.id}`}
                >
                  Full Payables →
                </Link>
              </div>
              {pendingPayables.length === 0 && (
                <p className="text-xs text-muted-foreground">No freight payable — sab settle.</p>
              )}
              {pendingPayables.slice(0, 8).map((d) => (
                <div key={d.id} className="flex items-center justify-between border-b py-1 text-xs last:border-0">
                  <span>
                    <b>{d.refNo}</b>
                    {d.kind === "SLIP" && <span className="text-muted-foreground"> (slip)</span>}
                    {" "}· {formatDate(d.date.toISOString())}
                    <span className="text-muted-foreground">
                      {" "}({Math.floor((Date.now() - d.date.getTime()) / 86400000)} din)
                    </span>
                  </span>
                  <span className="font-medium tabular-nums">{formatMoney(d.outstanding)}</span>
                </div>
              ))}
              {pendingPayables.length > 8 && (
                <p className="pt-1 text-[11px] text-muted-foreground">
                  +{pendingPayables.length - 8} aur — Full Payables mein dekhein
                </p>
              )}
            </div>
          )}

          {/* rate history */}
          <div className="rounded-md border p-3">
            <div className="mb-1 text-xs font-black uppercase text-muted-foreground">
              Rate History — last {rateHistory.length} LRs
            </div>
            {rateHistory.length === 0 && <p className="text-xs text-muted-foreground">No LRs found.</p>}
            {rateHistory.map((r) => (
              <div key={r.lrNo} className="flex items-center justify-between border-b py-1 text-xs last:border-0">
                <span>
                  {formatDate(r.date.toISOString())} · <b>{r.lrNo}</b> · {r.route}
                  {r.rate > 0 && <span className="text-muted-foreground"> @{r.rate.toFixed(2)}/MT</span>}
                </span>
                <span className="font-medium tabular-nums">{formatMoney(r.freight)}</span>
              </div>
            ))}
            {stuckLrs.length > 0 && (
              <div className="mt-2 rounded bg-amber-500/10 px-2 py-1 text-xs">
                <div className="flex items-center justify-between font-medium text-amber-700 dark:text-amber-500">
                  <span>{stuckLrs.length} LRs in transit / unbilled</span>
                  <Link className="underline" href="/pod/follow-up">
                    POD Follow-up →
                  </Link>
                </div>
                {stuckLrs.slice(0, 6).map((l) => (
                  <div key={l.id} className="flex items-center justify-between border-t border-amber-500/20 py-0.5">
                    <span>
                      {formatDate(l.lrDate.toISOString())} · <b>{l.lrNo}</b> ·{" "}
                      {cityName.get(l.sourceCityId) ?? ""}→{cityName.get(l.destCityId) ?? ""}
                    </span>
                    <span className="text-muted-foreground">{l.status.replace(/_/g, " ")}</span>
                  </div>
                ))}
                {stuckLrs.length > 6 && (
                  <div className="pt-0.5 text-muted-foreground">+{stuckLrs.length - 6} aur</div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ledger tail */}
        <div className="rounded-md border p-3">
          <div className="mb-1 text-xs font-black uppercase text-muted-foreground">Ledger — last 10 entries</div>
          {ledgerTail.length === 0 && <p className="text-xs text-muted-foreground">No ledger entries.</p>}
          {ledgerTail.map((e, i) => (
            <div key={i} className="grid grid-cols-[80px_1fr_80px_80px_100px] gap-1 border-b py-0.5 text-xs last:border-0">
              <span>{formatDate(e.date.toISOString())}</span>
              <span className="truncate" title={e.narration}>
                {e.refType.replace(/_/g, " ")} {e.refNo} — {e.narration}
              </span>
              <span className="text-right tabular-nums">{e.debit ? formatMoney(e.debit) : ""}</span>
              <span className="text-right tabular-nums">{e.credit ? formatMoney(e.credit) : ""}</span>
              <span className="text-right font-medium tabular-nums">
                {formatMoney(Math.abs(e.balance))} {e.balance >= 0 ? "Dr" : "Cr"}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="page-title">Party 360°</h1>
          <p className="text-sm text-muted-foreground">
            A party&apos;s complete profile on one screen — position, bills, freight payable and rate history.
          </p>
        </div>
        <div className="no-print flex items-center gap-2">
          <PrintButton />
          <Picker360 options={parties.map((p) => ({ value: p.id, label: p.name }))} value={partyId} base="/party-360" placeholder="Select party..." />
        </div>
      </div>
      {body}
    </div>
  );
}
