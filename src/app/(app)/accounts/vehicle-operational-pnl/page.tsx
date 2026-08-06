import { requireSession } from "@/lib/session";
import { authorize } from "@/lib/authz";
import { withTenant } from "@/lib/db";
import { formatMoney, toNum } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoHint } from "@/components/ui/info-hint";
import { FilterBar, type FilterDef } from "@/components/data/filter-bar";
import { SimpleReport, type ReportRow } from "@/components/accounts/simple-report";

export const dynamic = "force-dynamic";

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Vehicle Operational Profit & Loss — the company's OWN fleet only.
 *
 * Income: FleetOps chalans and broker-slip OWNER side, both restricted to
 * vehicles with ownershipType OWNER, at the operational grand total:
 * freight + detention + ODC + fine slip + other − LD − commission − mamool
 * − courier / payment charge. Relative and broker vehicles never appear.
 *
 * Expenses: every ledger head the Vehicle Module posts to (diesel, tyres,
 * repairs, driver costs, AdBlue, trip urea...), each taken at its FULL ledger
 * net balance (Dr − Cr across every refType and vehicle stamp) — recoveries
 * and relative/broker transfers credit the same head, so the net that remains
 * is the own fleet's real cost. Plus the full EMI of VEHICLE-type loans on own
 * vehicles (from the Finance module, on payment date).
 */

/** every refType the vehicle module writes to the ledger */
const VEHICLE_REF_TYPES = [
  "VEHICLE_EXPENSE",
  "VEH_EXP_ALLOC",
  "ADBLUE",
  "TRIP_UREA",
  "DRIVER_ADVANCE",
  "DRIVER_FNF",
  "DRIVER_SALARY",
  "DRIVER_SALARY_PAY",
  "DRIVER_SHORTAGE",
];

export default async function VehicleOperationalPnlPage({
  searchParams,
}: {
  searchParams: { date_from?: string; date_to?: string };
}) {
  const session = requireSession();
  await authorize(session, "reports", "view");

  const dateWhere =
    searchParams.date_from || searchParams.date_to
      ? {
          ...(searchParams.date_from ? { gte: new Date(searchParams.date_from + "T00:00:00") } : {}),
          ...(searchParams.date_to ? { lte: new Date(searchParams.date_to + "T23:59:59") } : {}),
        }
      : undefined;

  const data = await withTenant(session.tenantId, async (tx) => {
    const scope = { firmId: session.firmId, fyId: session.fyId };
    const ownIds = (
      await tx.vehicle.findMany({ where: { ownershipType: "OWNER" }, select: { id: true } })
    ).map((v) => v.id);

    // the heads the vehicle module posts to — the report then takes each
    // head's FULL ledger net (every refType, every vehicle stamp), because the
    // transfers do the separation themselves: a relative vehicle's expense is
    // debited and transferred out (credit) in the same head, netting zero, and
    // urea/diesel taken by a broker vehicle credits the head via its chalan
    // advance. What remains net IS the own fleet's cost.
    const vehicleHeadIds = Array.from(
      new Set(
        (
          await tx.ledgerEntry.findMany({
            where: { ...scope, refType: { in: VEHICLE_REF_TYPES }, accountHeadId: { not: null } },
            distinct: ["accountHeadId"],
            select: { accountHeadId: true },
          })
        ).map((e) => e.accountHeadId as string)
      )
    );

    const [chalans, slips, heads, headSums, advances, settlements, assignments, emis] =
      await Promise.all([
      tx.chalan.aggregate({
        where: {
          ...scope,
          deletedAt: null,
          cancelledAt: null,
          vehicleId: { in: ownIds },
          ...(dateWhere ? { chalanDate: dateWhere } : {}),
        },
        _sum: {
          freight: true,
          detention: true,
          odcAmt: true,
          fineSlip: true,
          otherAmt: true,
          ldCharge: true,
          commissionAmt: true,
          mamool: true,
          courierCharge: true,
        },
      }),
      tx.brokerSlip.aggregate({
        where: {
          ...scope,
          deletedAt: null,
          vehicleId: { in: ownIds },
          ...(dateWhere ? { slipDate: dateWhere } : {}),
        },
        _sum: {
          vFreight: true,
          vDetention: true,
          vOdcAmt: true,
          vFineAmt: true,
          vLdCharge: true,
          vCommAmt: true,
          vMamool: true,
          vPaymentAmt: true,
        },
      }),
      tx.accountHead.findMany({ select: { id: true, name: true } }),
      // every ledger the vehicle module posted for own vehicles (entries with
      // no vehicle stamp — e.g. some driver costs — stay in: they belong to
      // the fleet, and relative-vehicle shares were transferred out anyway)
      tx.ledgerEntry.groupBy({
        by: ["accountHeadId", "side"],
        where: {
          ...scope,
          accountHeadId: { in: vehicleHeadIds },
          ...(dateWhere ? { date: dateWhere } : {}),
        },
        _sum: { amount: true },
      }),
      // company-driver payments: advances given and settlements actually
      // paid/received — a driver counts as a COMPANY driver when the vehicle
      // on the transaction (or his assignment on that date) is OWN
      tx.driverAdvance.findMany({
        where: {
          ...scope,
          deletedAt: null,
          ...(dateWhere ? { date: dateWhere } : {}),
        },
        select: { driverId: true, vehicleId: true, date: true, amount: true },
      }),
      tx.driverSettlement.findMany({
        where: {
          ...scope,
          deletedAt: null,
          status: "SETTLED",
          voucherId: { not: null },
          ...(dateWhere ? { settledDate: dateWhere } : {}),
        },
        select: { driverId: true, vehicleId: true, settledDate: true, date: true, amount: true },
      }),
      tx.driverAssignment.findMany(),
      // full EMI of vehicle loans on own vehicles, on payment date — the same
      // figure the Vehicle P&L and the Vehicle EMI Expense ledger carry
      tx.loanEmi.findMany({
        where: {
          deletedAt: null,
          ...(dateWhere ? { payDate: dateWhere } : {}),
          loan: {
            ...scope,
            deletedAt: null,
            loanType: "VEHICLE",
            vehicleId: { in: ownIds },
          },
        },
        select: { total: true },
      }),
    ]);
    return {
      ownIds,
      ownCount: ownIds.length,
      chalans,
      slips,
      heads,
      headSums,
      advances,
      settlements,
      assignments,
      emis,
    };
  });

  const { ownIds, ownCount, chalans, slips, heads, headSums, advances, settlements, assignments, emis } =
    data;
  const n = (v: unknown) => r2(toNum(String(v ?? 0)));

  // ---- FleetOps income (own vehicles) ----
  const c = chalans._sum;
  const fleet = {
    freight: n(c.freight),
    detention: n(c.detention),
    odc: n(c.odcAmt),
    fine: n(c.fineSlip),
    other: n(c.otherAmt),
    ld: n(c.ldCharge),
    commission: n(c.commissionAmt),
    mamool: n(c.mamool),
    courier: n(c.courierCharge),
  };
  const fleetTotal = r2(
    fleet.freight + fleet.detention + fleet.odc + fleet.fine + fleet.other -
      fleet.ld - fleet.commission - fleet.mamool - fleet.courier
  );

  // ---- broker slip owner side (own vehicles) ----
  const s = slips._sum;
  const slip = {
    freight: n(s.vFreight),
    detention: n(s.vDetention),
    odc: n(s.vOdcAmt),
    fine: n(s.vFineAmt),
    ld: n(s.vLdCharge),
    commission: n(s.vCommAmt),
    mamool: n(s.vMamool),
    payment: n(s.vPaymentAmt),
  };
  const slipTotal = r2(
    slip.freight + slip.detention + slip.odc + slip.fine -
      slip.ld - slip.commission - slip.mamool - slip.payment
  );

  const totalVehicleIncome = r2(fleetTotal + slipTotal);

  // ---- vehicle module ledgers, DR = expense / CR = income ----
  const headName = new Map(heads.map((h) => [h.id, h.name]));
  const perHead = new Map<string, { debit: number; credit: number }>();
  for (const g of headSums) {
    if (!g.accountHeadId) continue;
    const acc = perHead.get(g.accountHeadId) ?? { debit: 0, credit: 0 };
    const amt = toNum(String(g._sum.amount ?? 0));
    if (g.side === "DEBIT") acc.debit = r2(acc.debit + amt);
    else acc.credit = r2(acc.credit + amt);
    perHead.set(g.accountHeadId, acc);
  }
  const range = [
    searchParams.date_from ? `date_from=${searchParams.date_from}` : "",
    searchParams.date_to ? `date_to=${searchParams.date_to}` : "",
  ]
    .filter(Boolean)
    .join("&");
  const headRows: ReportRow[] = [];
  let moduleExpense = 0;
  let moduleIncome = 0;
  for (const [headId, sums] of Array.from(perHead.entries())) {
    const balance = r2(sums.debit - sums.credit);
    if (Math.abs(balance) < 0.009) continue;
    const isExpense = balance > 0;
    const net = Math.abs(balance);
    if (isExpense) moduleExpense = r2(moduleExpense + net);
    else moduleIncome = r2(moduleIncome + net);
    headRows.push({
      head: headName.get(headId) ?? "(unknown head)",
      kind: isExpense ? "EXPENSE" : "INCOME",
      debit: sums.debit,
      credit: sums.credit,
      net,
      link: `accounts/ledger?party=${encodeURIComponent(`head:${headId}`)}${range ? `&${range}` : ""}`,
    });
  }
  headRows.sort((a, b) =>
    String(a.kind).localeCompare(String(b.kind)) || String(a.head).localeCompare(String(b.head))
  );

  // ---- company-driver payments (advances + settled payments, net of
  // settlement receipts). A driver is a COMPANY driver when the vehicle on
  // the transaction — or his assignment on that date — is OWN; relative and
  // broker driver payments never enter this report.
  const ownSet = new Set(ownIds);
  const vehicleAt = (driverId: string, at: Date): string | null => {
    const a = assignments.find(
      (x) => x.driverId === driverId && x.fromDate <= at && (!x.toDate || x.toDate >= at)
    );
    return a?.vehicleId ?? null;
  };
  const isCompanyDriverTxn = (t: { driverId: string; vehicleId: string | null; at: Date }) =>
    t.vehicleId ? ownSet.has(t.vehicleId) : ownSet.has(vehicleAt(t.driverId, t.at) ?? "");
  const advancePaid = r2(
    advances
      .filter((a) => isCompanyDriverTxn({ driverId: a.driverId, vehicleId: a.vehicleId, at: a.date }))
      .reduce((s, a) => s + toNum(String(a.amount)), 0)
  );
  let settlementPaid = 0;
  let settlementReceived = 0;
  for (const st of settlements) {
    const at = st.settledDate ?? st.date;
    if (!isCompanyDriverTxn({ driverId: st.driverId, vehicleId: st.vehicleId, at })) continue;
    const amt = toNum(String(st.amount));
    if (amt > 0) settlementPaid = r2(settlementPaid + amt);
    else settlementReceived = r2(settlementReceived + Math.abs(amt));
  }
  const driverPayments = r2(advancePaid + settlementPaid - settlementReceived);

  // ---- vehicle loan EMIs (full instalment) ----
  const loanExpense = r2(emis.reduce((sum, e) => sum + toNum(String(e.total)), 0));

  const profit = r2(
    totalVehicleIncome + moduleIncome - moduleExpense - driverPayments - loanExpense
  );

  const filters: FilterDef[] = [{ type: "daterange", key: "date", label: "Period" }];
  const money = (v: number) => formatMoney(v);
  const line = (label: string, value: number, opts?: { strong?: boolean; less?: boolean; link?: string }) => (
    <div
      key={label}
      className={`flex justify-between py-0.5 ${opts?.strong ? "border-t pt-1 font-semibold" : ""}`}
    >
      {opts?.link ? (
        <a
          href={`/${opts.link}`}
          target="_blank"
          rel="noreferrer"
          className="text-primary underline-offset-2 hover:underline"
          title="Open this ledger head's complete book (new tab)"
        >
          {label}
        </a>
      ) : (
        <span>{label}</span>
      )}
      <span className="tabular-nums">
        {opts?.less ? "− " : ""}
        {money(Math.abs(value))}
      </span>
    </div>
  );

  return (
    <div className="space-y-4 p-4">
      <h1 className="page-title flex items-center gap-2">
        Vehicle Operational Profit &amp; Loss
        <InfoHint>
          Own vehicles only ({ownCount} in the fleet) — relative and broker vehicles are fully
          excluded. Income is the operational grand total of FleetOps chalans and broker-slip
          owner side; expenses are every Vehicle-Module ledger (auto-classified by DR/CR, click a
          head for its book) plus the full EMI of vehicle loans.
        </InfoHint>
      </h1>
      <FilterBar filters={filters} />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm text-muted-foreground">Total Vehicle Income</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold tabular-nums">
            {money(r2(totalVehicleIncome + moduleIncome))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm text-muted-foreground">Total Vehicle Expenses</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold tabular-nums">
            {money(r2(moduleExpense + driverPayments + loanExpense))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm text-muted-foreground">
              Vehicle Operational Profit / Loss
            </CardTitle>
          </CardHeader>
          <CardContent
            className={`text-2xl font-bold tabular-nums ${profit >= 0 ? "text-emerald-600" : "text-destructive"}`}
          >
            {money(profit)}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 text-sm lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Income (Own Vehicles)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                FleetOps (Chalans)
              </div>
              {line("Freight", fleet.freight)}
              {line("Detention", fleet.detention)}
              {line("ODC Amount", fleet.odc)}
              {line("Fine Slip", fleet.fine)}
              {line("Other Amount", fleet.other)}
              {line("Less: LD Charge", fleet.ld, { less: true })}
              {line("Less: Commission", fleet.commission, { less: true })}
              {line("Less: Mamool", fleet.mamool, { less: true })}
              {line("Less: Courier Charge", fleet.courier, { less: true })}
              {line("Grand Total Freight (FleetOps)", fleetTotal, { strong: true })}
            </div>
            <div>
              <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                Broker Slip (Owner Side)
              </div>
              {line("Freight", slip.freight)}
              {line("Detention", slip.detention)}
              {line("ODC Amount", slip.odc)}
              {line("Fine Slip", slip.fine)}
              {line("Less: LD Charge", slip.ld, { less: true })}
              {line("Less: Commission", slip.commission, { less: true })}
              {line("Less: Mamool", slip.mamool, { less: true })}
              {line("Less: Payment Charge", slip.payment, { less: true })}
              {line("Grand Total Freight (Broker Owner Side)", slipTotal, { strong: true })}
            </div>
            <div>
              {line("Total Vehicle Income (freight)", totalVehicleIncome, { strong: true })}
              {headRows
                .filter((rw) => rw.kind === "INCOME")
                .map((rw) =>
                  line(`Vehicle Module Income: ${rw.head}`, Number(rw.net), {
                    link: String(rw.link),
                  })
                )}
              {moduleIncome > 0 && line("Total incl. Vehicle Module Income", r2(totalVehicleIncome + moduleIncome), { strong: true })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Expenses (Own Vehicles)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                Vehicle Module Ledgers (DR)
              </div>
              {headRows
                .filter((rw) => rw.kind === "EXPENSE")
                .map((rw) => line(String(rw.head), Number(rw.net), { link: String(rw.link) }))}
              {line("Total Vehicle Module Expenses", moduleExpense, { strong: true })}
            </div>
            <div>
              <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                Driver Payments (Company Drivers)
              </div>
              {line("Driver Advances Paid", advancePaid)}
              {line("Driver Settlement Payments", settlementPaid)}
              {line("Less: Settlement Receipts (driver returned)", settlementReceived, { less: true })}
              {line("Total Driver Payments", driverPayments, { strong: true })}
            </div>
            <div>
              <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                Vehicle Loan Expenses
              </div>
              {line(`Vehicle Loan EMIs (${emis.length} instalments, full EMI)`, loanExpense)}
              {line("Total Vehicle Loan Expenses", loanExpense, { strong: true })}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Summary</CardTitle>
        </CardHeader>
        <CardContent className="max-w-md text-sm">
          {line("FleetOps Grand Total Freight", fleetTotal)}
          {line("Broker Owner Side Grand Total Freight", slipTotal)}
          {line("Vehicle Module Income (CR)", moduleIncome)}
          {line("Vehicle Module Expenses (DR)", moduleExpense, { less: true })}
          {line("Driver Payments (Company Drivers)", driverPayments, { less: true })}
          {line("Vehicle Loan Expenses", loanExpense, { less: true })}
          <div
            className={`mt-1 flex justify-between border-t pt-1 text-base font-bold ${profit >= 0 ? "text-emerald-600" : "text-destructive"}`}
          >
            <span>Vehicle Operational Profit / Loss</span>
            <span className="tabular-nums">{money(profit)}</span>
          </div>
        </CardContent>
      </Card>

      <SimpleReport
        title="Vehicle-module ledger heads (own vehicles, auto-classified by DR/CR)"
        columns={[
          { key: "head", header: "Ledger Head", linkBase: "/", linkParamKey: "link" },
          { key: "kind", header: "Kind", kind: "badge" },
          { key: "debit", header: "Debit", kind: "money" },
          { key: "credit", header: "Credit", kind: "money" },
          { key: "net", header: "Net", kind: "money" },
        ]}
        rows={headRows}
        fileName="vehicle-operational-pnl-heads"
        emptyMessage="No vehicle-module ledger activity in this period."
      />
    </div>
  );
}
