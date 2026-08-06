import Link from "next/link";
import { requireSession } from "@/lib/session";
import { authorize } from "@/lib/authz";
import { withTenant } from "@/lib/db";
import { formatDate, formatMoney, toNum } from "@/lib/utils";
import { waLink } from "@/lib/phone";
import { round2 } from "@/lib/calc/tds";
import { invoiceSettlement } from "@/lib/settlement";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Picker360 } from "./picker";

export const dynamic = "force-dynamic";

/**
 * Party 360° — one screen, the party's whole world: net position, business,
 * outstanding with age, open advances, pending bills, rate history, stuck
 * bilties and the ledger tail. Nothing new is stored; every figure comes from
 * the same engines the individual screens use.
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

    const [entries, invoices, advances, lrs, cities] = await Promise.all([
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
    ]);
    const settle = await invoiceSettlement(tx, { ...scope, invoices });
    return { parties, view: { party, entries, invoices, advances, lrs, cities, settle } };
  });

  const { parties, view } = data;

  let body: React.ReactNode = (
    <div className="rounded-md border p-10 text-center text-sm text-muted-foreground">
      Select a party above to see its complete profile on one screen.
    </div>
  );

  if (view) {
    const { party, entries, invoices, advances, lrs, cities, settle } = view;
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

    // outstanding + oldest unpaid age
    const pendingBills = invoices
      .map((i) => ({ inv: i, pos: settle.get(i.id) }))
      .filter((x) => (x.pos?.outstanding ?? 0) > 0.009)
      .sort((a, b) => a.inv.invoiceDate.getTime() - b.inv.invoiceDate.getTime());
    const outstanding = round2(pendingBills.reduce((s, x) => s + (x.pos?.outstanding ?? 0), 0));
    const oldestDays = pendingBills.length
      ? Math.floor((Date.now() - pendingBills[0].inv.invoiceDate.getTime()) / 86400000)
      : 0;
    const totalBusiness = round2(invoices.reduce((s, i) => s + toNum(i.grandTotal), 0));

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
          {(
            [
              ["Total Business (bills, FY)", formatMoney(totalBusiness), ""],
              [
                "Outstanding",
                formatMoney(outstanding),
                pendingBills.length ? `${pendingBills.length} bill(s), sabse purana ${oldestDays} din` : "sab clear",
              ],
              ["Advance (received se bacha)", formatMoney(advReceived), ""],
              ["Advance (paid se bacha)", formatMoney(advPaid), ""],
            ] as [string, string, string][]
          ).map(([label, value, sub]) => (
            <div key={label} className="rounded-md border p-3">
              <div className="text-[11px] text-muted-foreground">{label}</div>
              <div className="text-lg font-bold tabular-nums">{value}</div>
              {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
            </div>
          ))}
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          {/* pending bills */}
          <div className="rounded-md border p-3">
            <div className="mb-1 text-xs font-black uppercase text-muted-foreground">
              Pending Bills ({pendingBills.length})
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
          </div>

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
              <div className="mt-2 rounded bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-700 dark:text-amber-500">
                {stuckLrs.length} LRs in transit / unbilled (POD or billing pending)
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
            A party&apos;s complete profile on one screen — position, bills and rate history.
          </p>
        </div>
        <Picker360 options={parties.map((p) => ({ value: p.id, label: p.name }))} value={partyId} base="/party-360" placeholder="Select party..." />
      </div>
      {body}
    </div>
  );
}
