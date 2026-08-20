import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { authorize } from "@/lib/authz";
import { withTenant } from "@/lib/db";
import { formatDate, formatMoney, toNum } from "@/lib/utils";
import { round2 } from "@/lib/calc/tds";
import { chalanTotals, slipTotals } from "@/lib/trip-docs";
import { TripSummaryToolbar } from "@/components/trips/trip-summary-toolbar";

export const dynamic = "force-dynamic";

/**
 * 360° Trip Summary — the complete A-to-Z view of one trip on a single
 * screen: income, expenses, vehicle costs, driver position, loan EMIs, fuel,
 * ledger postings, documents and a timeline. Everything is fetched live from
 * the source modules; nothing is entered or stored here.
 */

const n = (v: unknown) => toNum(String(v ?? 0));

/**
 * ACTUAL-method trip sheets write their auto-fetched vehicle-register expenses
 * back as one MISC trip-expense row carrying this remark. Section 4 below
 * already lists those same rupees from the register (VehicleExpenseItem), so
 * the marked row is excluded from the trip-expense side — the register stays
 * authoritative and the profit analysis counts the money once.
 */
const AUTO_REGISTER_EXPENSE_REMARK = "Other operating expenses (auto)";
const cell = "border px-1.5 py-0.5";
const money = (v: number) => <span className="tabular-nums">{formatMoney(v)}</span>;

function Section({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details open={defaultOpen} className="rounded-md border">
      <summary className="cursor-pointer select-none bg-muted/60 px-3 py-1.5 text-sm font-semibold print:bg-neutral-100">
        {title}
      </summary>
      <div className="p-3 text-xs">{children}</div>
    </details>
  );
}

function KV({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <div className="grid grid-cols-2 gap-x-8 gap-y-1 sm:grid-cols-3">
      {items.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-2 border-b border-dashed pb-0.5">
          <span className="text-muted-foreground">{k}</span>
          <span className="font-medium">{v}</span>
        </div>
      ))}
    </div>
  );
}

export default async function TripSummaryPage({ params }: { params: { id: string } }) {
  const session = requireSession();
  await authorize(session, "maintenance", "print");

  const data = await withTenant(session.tenantId, async (tx) => {
    const trip = await tx.trip.findFirst({
      // firm-scoped: another firm's trip must not print under this session
      where: { id: params.id, firmId: session.firmId, deletedAt: null },
      include: { expenses: true },
    });
    if (!trip) return null;

    const start = trip.fromDate ?? trip.tripDate;
    const rawEnd = trip.toDate ?? trip.returnDate ?? trip.tripDate;
    const end = new Date(rawEnd.getFullYear(), rawEnd.getMonth(), rawEnd.getDate(), 23, 59, 59);

    const [firm, vehicle, driver, docs, settlement, advances, cities, parties, heads] =
      await Promise.all([
        tx.firm.findUnique({ where: { id: trip.firmId } }),
        tx.vehicle.findUnique({ where: { id: trip.vehicleId } }),
        trip.driverId
          ? tx.driver.findFirst({ where: { id: trip.driverId } })
          : Promise.resolve(null),
        tx.tripDoc.findMany({ where: { tripId: trip.id } }),
        tx.driverSettlement.findFirst({ where: { tripId: trip.id, deletedAt: null } }),
        tx.driverAdvance.findMany({ where: { tripId: trip.id, deletedAt: null } }),
        tx.city.findMany(),
        tx.party.findMany({ select: { id: true, name: true } }),
        tx.accountHead.findMany({ select: { id: true, name: true } }),
      ]);

    const chalanIds = docs.filter((d) => d.refType === "CHALAN").map((d) => d.refId);
    const slipIds = docs.filter((d) => d.refType === "BROKER_SLIP").map((d) => d.refId);
    const [chalans, slips, expItems, loanEmis, salaries] = await Promise.all([
      chalanIds.length
        ? tx.chalan.findMany({
            where: { id: { in: chalanIds }, deletedAt: null },
            include: { lrs: { include: { lr: true } } },
          })
        : Promise.resolve([]),
      slipIds.length
        ? tx.brokerSlip.findMany({ where: { id: { in: slipIds }, deletedAt: null } })
        : Promise.resolve([]),
      // vehicle costs allocated to this vehicle inside the trip period
      tx.vehicleExpenseItem.findMany({
        where: {
          vehicleId: trip.vehicleId,
          allocDate: { gte: start, lte: end },
          voucher: { firmId: session.firmId, fyId: session.fyId, deletedAt: null, txnType: "EXPENSE" },
        },
        include: { voucher: true },
        orderBy: { allocDate: "asc" },
      }),
      // instalments paid in the trip period for this vehicle's loans — a loan
      // is long-lived, so the EMI counts by its PAY date, never the loan's
      // origin FY (which hid instalments of loans taken in an earlier year)
      tx.loanEmi.findMany({
        where: {
          deletedAt: null,
          payDate: { gte: start, lte: end },
          loan: {
            firmId: session.firmId,
            deletedAt: null,
            loanType: "VEHICLE",
            vehicleId: trip.vehicleId,
          },
        },
        include: { loan: true },
        orderBy: { payDate: "asc" },
      }),
      trip.driverId
        ? tx.driverSalary.findMany({
            where: { firmId: session.firmId, fyId: session.fyId, deletedAt: null, driverId: trip.driverId },
          })
        : Promise.resolve([]),
    ]);

    // ledger trail: everything posted against the linked documents plus every
    // entry stamped with this vehicle inside the trip period
    const refIds = Array.from(
      new Set(
        [
          trip.id,
          ...chalanIds,
          ...slipIds,
          settlement?.voucherId,
          ...loanEmis.map((e) => e.voucherId),
          ...expItems.map((i) => i.voucherId),
        ].filter(Boolean) as string[]
      )
    );
    const ledger = await tx.ledgerEntry.findMany({
      where: {
        firmId: session.firmId,
        fyId: session.fyId,
        OR: [
          { refId: { in: refIds } },
          { vehicleId: trip.vehicleId, date: { gte: start, lte: end } },
        ],
      },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      take: 500,
    });

    return {
      trip,
      start,
      end,
      firm,
      vehicle,
      driver,
      settlement,
      advances,
      chalans,
      slips,
      expItems,
      loanEmis,
      salaries,
      ledger,
      cities,
      parties,
      heads,
    };
  });

  if (!data) notFound();
  const {
    trip,
    start,
    end,
    firm,
    vehicle,
    driver,
    settlement,
    advances,
    chalans,
    slips,
    expItems,
    loanEmis,
    salaries,
    ledger,
    cities,
    parties,
    heads,
  } = data;

  const cityName = new Map(cities.map((c) => [c.id, c.name]));
  const city = (id: string | null | undefined) => (id ? cityName.get(id) ?? "" : "");
  const partyName = new Map(parties.map((p) => [p.id, p.name]));
  const headName = new Map(heads.map((h) => [h.id, h.name]));

  // ---------- income ----------
  const incomeDocs = [
    ...chalans.map((c) => ({
      id: c.id,
      kind: "Chalan" as const,
      no: c.chalanNo,
      date: c.chalanDate,
      from: city(c.sourceCityId) || city(c.lrs[0]?.lr?.sourceCityId),
      to: city(c.destCityId) || city(c.lrs[0]?.lr?.destCityId),
      totals: chalanTotals(c),
      printHref: `/print/chalan/${c.id}`,
      lrs: c.lrs.map((l) => ({ id: l.lr.id, no: l.lr.lrNo })),
    })),
    ...slips.map((s) => ({
      id: s.id,
      kind: "Broker Slip" as const,
      no: s.slipNo,
      date: s.slipDate,
      from: city(s.loadStationId),
      to: city(s.destCityId),
      totals: slipTotals(s),
      printHref: `/print/broker-slip/${s.id}`,
      lrs: [] as { id: string; no: string }[],
    })),
  ];
  const income = {
    freight: round2(incomeDocs.reduce((s, d) => s + d.totals.freight, 0)),
    additions: round2(incomeDocs.reduce((s, d) => s + d.totals.additions, 0)),
    deductions: round2(incomeDocs.reduce((s, d) => s + d.totals.deductions, 0)),
    grand: round2(incomeDocs.reduce((s, d) => s + d.totals.grandTotal, 0)),
  };
  const totalIncome = incomeDocs.length
    ? income.grand
    : round2(n(trip.gTotalFreight) + n(trip.rTotalFreight));

  // ---------- trip expenses ----------
  const catLabel = (c: string) =>
    c.split("_").map((w) => w.charAt(0) + w.slice(1).toLowerCase()).join(" ");
  // the marked auto-register row duplicates section 4 — see the constant above
  const ownTripExpenses = trip.expenses.filter(
    (e) => e.remarks !== AUTO_REGISTER_EXPENSE_REMARK
  );
  const byCat = new Map<string, number>();
  for (const e of ownTripExpenses) {
    byCat.set(e.category, round2((byCat.get(e.category) ?? 0) + n(e.amount)));
  }
  const tripExpenses =
    n(trip.approvedTotal) || round2(ownTripExpenses.reduce((s, e) => s + n(e.amount), 0));

  // ---------- vehicle expenses in period (diesel/toll excluded from P&L math) ----------
  const isDieselOrToll = (headId: string) => {
    const hn = (headName.get(headId) ?? "").toLowerCase();
    return hn.includes("diesel") || hn.includes("toll");
  };
  const vehExpRows = expItems.map((it) => ({
    id: it.id,
    date: it.allocDate,
    head: headName.get(it.voucher.headId) ?? "",
    voucherNo: it.voucher.voucherNo,
    supplier: (it.voucher.partyId && partyName.get(it.voucher.partyId)) || "",
    amount: n(it.amount),
    excluded: isDieselOrToll(it.voucher.headId),
  }));
  const vehicleExpenses = round2(
    vehExpRows.filter((r) => !r.excluded).reduce((s, r) => s + r.amount, 0)
  );

  // ---------- driver ----------
  const advanceTotal = round2(advances.reduce((s, a) => s + n(a.amount), 0));
  const monthOverlaps = (month: string) => {
    const ms = new Date(`${month}-01T00:00:00`);
    const me = new Date(ms.getFullYear(), ms.getMonth() + 1, 0, 23, 59, 59);
    return ms <= end && me >= start;
  };
  const periodSalaries = salaries.filter((s) => monthOverlaps(s.month));
  const driverSalary = round2(
    periodSalaries.reduce(
      (s, x) => s + n(x.salaryAmount) + n(x.incentive) + n(x.bonus) + n(x.otherAllowance),
      0
    )
  );

  // ---------- EMI ----------
  const emiRows = loanEmis.map((e) => ({
    payDate: e.payDate,
    loanId: e.loanId,
    loanNo: e.loan.loanNo,
    financeCompany: partyName.get(e.loan.partyId) ?? "",
    principal: n(e.principal),
    interest: n(e.interest),
    charges: round2(n(e.penalty) + n(e.otherAmt)),
    total: n(e.total),
    voucherNo: e.voucherNo ?? "",
  }));
  const emiTotal = round2(emiRows.reduce((s, e) => s + e.total, 0));

  // ---------- fuel ----------
  const dist1 = Math.max(0, n(trip.unloadingKm) - n(trip.loadingKm));
  const dist2 = n(trip.newLoadingKm) > 0 ? Math.max(0, n(trip.newLoadingKm) - n(trip.unloadingKm)) : 0;
  const totalKm = round2(dist1 + dist2);
  const dieselItems = vehExpRows.filter((r) => r.head.toLowerCase().includes("diesel"));
  const dieselCost = round2(dieselItems.reduce((s, r) => s + r.amount, 0));

  // ---------- profit ----------
  const net = round2(totalIncome - tripExpenses - vehicleExpenses - driverSalary - emiTotal);
  const perKm = (v: number) => (totalKm > 0 ? formatMoney(round2(v / totalKm)) : "—");
  const totalCost = round2(tripExpenses + vehicleExpenses + driverSalary + emiTotal);
  const days = Math.max(
    1,
    Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1
  );

  // ---------- timeline ----------
  const timeline: { date: Date; label: string }[] = [
    { date: trip.tripDate, label: `Trip sheet ${trip.tripNo} created` },
    ...(driver ? [{ date: trip.tripDate, label: `Driver assigned: ${driver.name}` }] : []),
    ...incomeDocs.map((d) => ({
      date: d.date,
      label: `${d.kind} ${d.no} linked (${formatMoney(d.totals.grandTotal)})`,
    })),
    ...advances.map((a) => ({
      date: a.date,
      label: `Driver advance paid ${formatMoney(n(a.amount))} (${a.paymentMode})`,
    })),
    ...vehExpRows.map((r) => ({
      date: r.date,
      label: `${r.head} ${formatMoney(r.amount)} (voucher ${r.voucherNo})`,
    })),
    ...emiRows.map((e) => ({
      date: e.payDate,
      label: `EMI paid ${formatMoney(e.total)} — loan ${e.loanNo}${e.voucherNo ? ` (voucher ${e.voucherNo})` : ""}`,
    })),
    ...(settlement
      ? [
          {
            date: settlement.settledDate ?? settlement.date,
            label: `Driver settlement ${settlement.status}${settlement.voucherNo ? ` (voucher ${settlement.voucherNo})` : ""} — ${formatMoney(Math.abs(n(settlement.amount)))}`,
          },
        ]
      : []),
    ...(trip.returnDate ? [{ date: trip.returnDate, label: "Trip returned / closed" }] : []),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  const particulars = (e: (typeof ledger)[number]) =>
    (e.partyId && partyName.get(e.partyId)) ||
    (e.accountHeadId && headName.get(e.accountHeadId)) ||
    (e.vehicleId ? `Vehicle ${vehicle?.number ?? ""}` : "") ||
    "—";

  return (
    <div className="mx-auto max-w-5xl space-y-3 bg-white p-4 text-black print:p-0">
      <TripSummaryToolbar tripId={trip.id} />

      <div className="rounded-md border-2 border-black p-3 text-center">
        <div className="text-lg font-bold uppercase">{firm?.name}</div>
        <div className="text-sm font-semibold tracking-widest">
          360° TRIP SUMMARY — {trip.tripNo}
        </div>
        <div className="text-xs text-muted-foreground">
          Period {formatDate(start)} — {formatDate(end)} · generated live from all modules
        </div>
      </div>

      <Section title="1. Basic Information">
        <KV
          items={[
            ["Trip Sheet No", trip.tripNo],
            ["Vehicle Number", vehicle?.number ?? ""],
            ["Vehicle Type", vehicle?.vehicleType || "—"],
            [
              "Ownership",
              vehicle?.ownershipType === "RELATIVE"
                ? `Relative${vehicle.ownerId ? ` (${partyName.get(vehicle.ownerId) ?? ""})` : ""}`
                : vehicle?.ownershipType === "OWNER"
                  ? "Own"
                  : "Market / Broker",
            ],
            ["Driver", driver?.name ?? "—"],
            ["From", city(trip.goingSourceCityId) || incomeDocs[0]?.from || "—"],
            ["To", city(trip.goingDestCityId) || incomeDocs[0]?.to || "—"],
            ["Trip Start", formatDate(start)],
            ["Trip End", trip.toDate || trip.returnDate ? formatDate(end) : "—"],
            ["Total KM", totalKm ? totalKm.toLocaleString("en-IN") : "—"],
            ["Total Days", String(days)],
            ["Status", settlement ? settlement.status : "OPEN"],
          ]}
        />
      </Section>

      <Section title="2. Income Details">
        {incomeDocs.length ? (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {["Document", "No", "Date", "From", "To", "Freight", "Additions", "Deductions", "Grand Total", ""].map(
                  (h) => (
                    <th key={h} className={`${cell} bg-muted/40 text-left font-semibold`}>
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {incomeDocs.map((d) => (
                <tr key={d.id}>
                  <td className={cell}>{d.kind}</td>
                  <td className={cell}>{d.no}</td>
                  <td className={cell}>{formatDate(d.date)}</td>
                  <td className={cell}>{d.from}</td>
                  <td className={cell}>{d.to}</td>
                  <td className={`${cell} text-right`}>{money(d.totals.freight)}</td>
                  <td className={`${cell} text-right`}>{money(d.totals.additions)}</td>
                  <td className={`${cell} text-right`}>− {money(d.totals.deductions)}</td>
                  <td className={`${cell} text-right font-semibold`}>{money(d.totals.grandTotal)}</td>
                  <td className={`${cell} print:hidden`}>
                    <a className="text-primary hover:underline" href={d.printHref} target="_blank" rel="noreferrer">
                      Open
                    </a>
                  </td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td colSpan={5} className={cell}>
                  Total Trip Income (additions = detention / ODC / fine slip; deductions = LD /
                  commission / mamool / courier / TDS / shortage)
                </td>
                <td className={`${cell} text-right`}>{money(income.freight)}</td>
                <td className={`${cell} text-right`}>{money(income.additions)}</td>
                <td className={`${cell} text-right`}>− {money(income.deductions)}</td>
                <td className={`${cell} text-right`}>{money(totalIncome)}</td>
                <td className={`${cell} print:hidden`} />
              </tr>
            </tbody>
          </table>
        ) : (
          <p>
            No chalan / broker slip linked — freight snapshot from the trip sheet:{" "}
            <b>{formatMoney(totalIncome)}</b>
          </p>
        )}
      </Section>

      <Section title="3. Trip Expenses (Company Approved)">
        <div className="grid grid-cols-2 gap-x-8 gap-y-1 sm:grid-cols-3">
          {Array.from(byCat.entries()).map(([cat, amt]) => (
            <div key={cat} className="flex justify-between border-b border-dashed pb-0.5">
              <span>{catLabel(cat)}</span>
              {money(amt)}
            </div>
          ))}
        </div>
        <div className="mt-2 flex justify-between border-t pt-1 font-semibold">
          <span>Total Trip Expenses</span>
          {money(tripExpenses)}
        </div>
      </Section>

      <Section title="4. Vehicle Expenses (allocated in trip period)">
        {vehExpRows.length ? (
          <table className="w-full border-collapse">
            <tbody>
              {vehExpRows.map((r) => (
                <tr key={r.id} className={r.excluded ? "text-muted-foreground" : undefined}>
                  <td className={cell}>{formatDate(r.date)}</td>
                  <td className={cell}>
                    {r.head}
                    {r.excluded ? " (in trip expenses — not double counted)" : ""}
                  </td>
                  <td className={cell}>{r.supplier}</td>
                  <td className={cell}>{r.voucherNo}</td>
                  <td className={`${cell} text-right`}>{money(r.amount)}</td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td colSpan={4} className={cell}>
                  Total Vehicle Expenses (Diesel &amp; Toll excluded)
                </td>
                <td className={`${cell} text-right`}>{money(vehicleExpenses)}</td>
              </tr>
            </tbody>
          </table>
        ) : (
          <p className="text-muted-foreground">None allocated in this period.</p>
        )}
      </Section>

      <Section title="5. Driver Details">
        <KV
          items={[
            ["Driver Advance (register, this trip)", money(advanceTotal)],
            ["Approved Driver Advance", money(n(trip.apprDriverAdvance))],
            [
              `Booked Salary (${periodSalaries.map((s) => s.month).join(", ") || "no month overlaps"})`,
              money(driverSalary),
            ],
            ["Trip Driver Balance", money(n(trip.driverBalance))],
            [
              "Settlement",
              settlement
                ? `${settlement.status}${settlement.voucherNo ? ` — voucher ${settlement.voucherNo}` : ""}`
                : "—",
            ],
            ["Settlement Amount", settlement ? money(Math.abs(n(settlement.amount))) : "—"],
          ]}
        />
      </Section>

      <Section title="6. Loan / EMI Details">
        {emiRows.length ? (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {["Pay Date", "Loan No", "Finance Company", "Principal", "Interest", "Charges", "Total EMI", "Voucher", ""].map(
                  (h) => (
                    <th key={h} className={`${cell} bg-muted/40 text-left font-semibold`}>
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {emiRows.map((e, i) => (
                <tr key={i}>
                  <td className={cell}>{formatDate(e.payDate)}</td>
                  <td className={cell}>{e.loanNo}</td>
                  <td className={cell}>{e.financeCompany}</td>
                  <td className={`${cell} text-right`}>{money(e.principal)}</td>
                  <td className={`${cell} text-right`}>{money(e.interest)}</td>
                  <td className={`${cell} text-right`}>{money(e.charges)}</td>
                  <td className={`${cell} text-right font-semibold`}>{money(e.total)}</td>
                  <td className={cell}>{e.voucherNo || "—"}</td>
                  <td className={`${cell} print:hidden`}>
                    <a className="text-primary hover:underline" href={`/print/loan/${e.loanId}`} target="_blank" rel="noreferrer">
                      Loan
                    </a>
                  </td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td colSpan={6} className={cell}>
                  Total EMI (full instalment counts as vehicle financing cost)
                </td>
                <td className={`${cell} text-right`}>{money(emiTotal)}</td>
                <td colSpan={2} className={cell} />
              </tr>
            </tbody>
          </table>
        ) : (
          <p className="text-muted-foreground">No instalment paid for this vehicle in the trip period.</p>
        )}
      </Section>

      <Section title="7. Fuel Details">
        <KV
          items={[
            ["Diesel (trip legs)", money(round2(n(trip.gDiesel) + n(trip.rDiesel)))],
            ["Diesel (actual by driver)", money(n(trip.actualDiesel))],
            ["Diesel purchases allocated", money(dieselCost)],
            ["Diesel Average (km/L)", n(trip.dieselAvg) ? String(n(trip.dieselAvg)) : "—"],
            ["Diesel Rate", n(trip.dieselRate) ? money(n(trip.dieselRate)) : "—"],
            ["Total KM", totalKm ? totalKm.toLocaleString("en-IN") : "—"],
            ["Urea Filled (L)", n(trip.ureaQty) ? String(n(trip.ureaQty)) : "—"],
            ["Urea Cost", money(n(trip.ureaAmount))],
            ["Urea borne by", trip.ureaExpenseType === "DRIVER" ? "Driver" : "Company"],
          ]}
        />
      </Section>

      <Section title="8. Ledger Summary" defaultOpen={false}>
        {ledger.length ? (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {["Date", "Particular", "Ref No", "Narration", "Debit", "Credit"].map((h) => (
                  <th key={h} className={`${cell} bg-muted/40 text-left font-semibold`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ledger.map((e) => (
                <tr key={e.id}>
                  <td className={cell}>{formatDate(e.date)}</td>
                  <td className={cell}>{particulars(e)}</td>
                  <td className={cell}>{e.refNo}</td>
                  <td className={`${cell} max-w-[280px] truncate`}>{e.narration ?? ""}</td>
                  <td className={`${cell} text-right`}>
                    {e.side === "DEBIT" ? money(n(e.amount)) : ""}
                  </td>
                  <td className={`${cell} text-right`}>
                    {e.side === "CREDIT" ? money(n(e.amount)) : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-muted-foreground">No ledger postings found for this trip yet.</p>
        )}
      </Section>

      <Section title="9. Profit Analysis">
        <table className="w-full max-w-md border-collapse">
          <tbody>
            {(
              [
                ["Trip Income", totalIncome, ""],
                ["Trip Expenses", -tripExpenses, ""],
                ["Vehicle Expenses", -vehicleExpenses, ""],
                ["Driver Salary (booked)", -driverSalary, ""],
                ["EMI Expense (full instalments)", -emiTotal, ""],
              ] as [string, number, string][]
            ).map(([l, v]) => (
              <tr key={l}>
                <td className={cell}>{l}</td>
                <td className={`${cell} text-right`}>
                  {v < 0 ? <>− {money(Math.abs(v))}</> : money(v)}
                </td>
              </tr>
            ))}
            <tr className={`font-bold ${net >= 0 ? "text-emerald-700" : "text-red-700"}`}>
              <td className={cell}>Net Trip Profit / Loss</td>
              <td className={`${cell} text-right`}>{money(net)}</td>
            </tr>
          </tbody>
        </table>
        <div className="mt-2">
          <KV
            items={[
              ["Profit %", totalIncome > 0 ? `${round2((net / totalIncome) * 100)}%` : "—"],
              ["Revenue / KM", perKm(totalIncome)],
              ["Expense / KM", perKm(totalCost)],
              ["Cost + Profit check", money(round2(totalCost + net))],
            ]}
          />
        </div>
      </Section>

      <Section title="10. Documents">
        <ul className="list-inside list-disc space-y-0.5">
          <li>
            <a className="text-primary hover:underline" href={`/print/trip/${trip.id}`} target="_blank" rel="noreferrer">
              Trip Sheet {trip.tripNo}
            </a>
          </li>
          {incomeDocs.map((d) => (
            <li key={d.id}>
              <a className="text-primary hover:underline" href={d.printHref} target="_blank" rel="noreferrer">
                {d.kind} {d.no}
              </a>
              {d.lrs.length > 0 && (
                <>
                  {" — LRs: "}
                  {d.lrs.map((l, i) => (
                    <span key={l.id}>
                      {i > 0 && ", "}
                      <a className="text-primary hover:underline" href={`/print/lr/${l.id}`} target="_blank" rel="noreferrer">
                        {l.no}
                      </a>
                    </span>
                  ))}
                </>
              )}
            </li>
          ))}
          {emiRows.map((e, i) => (
            <li key={`loan-${i}`}>
              <a className="text-primary hover:underline" href={`/print/loan/${e.loanId}`} target="_blank" rel="noreferrer">
                Loan {e.loanNo}
              </a>
              {e.voucherNo ? ` — EMI voucher ${e.voucherNo}` : ""}
            </li>
          ))}
          {settlement?.voucherNo && <li>Settlement voucher {settlement.voucherNo}</li>}
          {vehExpRows.map((r) => (
            <li key={`veh-${r.id}`}>
              Expense voucher {r.voucherNo} — {r.head} {formatMoney(r.amount)}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="11. Timeline">
        <ol className="relative ml-2 space-y-1 border-l pl-4">
          {timeline.map((t, i) => (
            <li key={i}>
              <span className="mr-2 font-medium tabular-nums">{formatDate(t.date)}</span>
              {t.label}
            </li>
          ))}
        </ol>
      </Section>

      <p className="pb-6 text-center text-[11px] text-muted-foreground">
        All figures are fetched live from Trips, Chalans, Broker Slips, Vehicle Expenses,
        Driver Management, Finance &amp; Loans and the Ledger — nothing on this page is entered
        manually. Use Print / PDF for a paper copy; every row links back to its source record.
      </p>
    </div>
  );
}
