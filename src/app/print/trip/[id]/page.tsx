import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { formatDate, formatMoney, toNum } from "@/lib/utils";
import { round2 } from "@/lib/calc/tds";
import { chalanTotals, slipTotals } from "@/lib/trip-docs";
import { PrintToolbar } from "./print-toolbar";

export const dynamic = "force-dynamic";

const cell = "border border-black px-1.5 py-0.5";
const label = "border border-black bg-neutral-100 px-1.5 py-0.5 font-semibold";
const signed = (n: number) =>
  n === 0 ? "0" : `${n > 0 ? "+" : "-"}${formatMoney(Math.abs(n))}`;

export default async function TripPrintPage({ params }: { params: { id: string } }) {
  const session = requireSession();

  const data = await withTenant(session.tenantId, async (tx) => {
    const trip = await tx.trip.findFirst({
      where: { id: params.id, deletedAt: null },
      include: { expenses: true },
    });
    if (!trip) return null;
    const [firm, vehicle, driver, docs, settlement, cities] = await Promise.all([
      tx.firm.findUnique({ where: { id: trip.firmId } }),
      tx.vehicle.findUnique({ where: { id: trip.vehicleId } }),
      trip.driverId ? tx.driver.findFirst({ where: { id: trip.driverId } }) : Promise.resolve(null),
      tx.tripDoc.findMany({ where: { tripId: trip.id } }),
      tx.driverSettlement.findFirst({ where: { tripId: trip.id, deletedAt: null } }),
      tx.city.findMany(),
    ]);
    const chalanIds = docs.filter((d) => d.refType === "CHALAN").map((d) => d.refId);
    const slipIds = docs.filter((d) => d.refType === "BROKER_SLIP").map((d) => d.refId);
    const [chalans, slips] = await Promise.all([
      chalanIds.length
        ? tx.chalan.findMany({ where: { id: { in: chalanIds } } })
        : Promise.resolve([]),
      slipIds.length
        ? tx.brokerSlip.findMany({ where: { id: { in: slipIds } } })
        : Promise.resolve([]),
    ]);
    return { trip, firm, vehicle, driver, chalans, slips, settlement, cities };
  });

  if (!data) notFound();
  const { trip, firm, vehicle, driver, chalans, slips, settlement } = data;
  const n = (v: unknown) => toNum(String(v ?? 0));

  // the printed sheet shows the same Grand Total the screen and the vehicle
  // report do — a freight-only figure here would not reconcile with either
  const linkedDocs = [
    ...chalans.map((c) => ({
      type: "Chalan",
      no: c.chalanNo,
      date: c.chalanDate,
      freight: chalanTotals(c).grandTotal,
    })),
    ...slips.map((s) => ({
      type: "Broker Slip",
      no: s.slipNo,
      date: s.slipDate,
      freight: slipTotals(s).grandTotal,
    })),
  ];
  const freight = linkedDocs.length
    ? round2(linkedDocs.reduce((s, d) => s + d.freight, 0))
    : n(trip.gTotalFreight) + n(trip.rTotalFreight);
  const dist1 = Math.max(0, n(trip.unloadingKm) - n(trip.loadingKm));
  const dist2 = n(trip.newLoadingKm) > 0 ? Math.max(0, n(trip.newLoadingKm) - n(trip.unloadingKm)) : 0;
  const isDieselAvg = trip.calcMethod === "DIESEL_AVG";
  const isActual = trip.calcMethod === "ACTUAL";
  const methodLabel = isActual
    ? "Actual Income - Actual Expenses"
    : isDieselAvg
      ? "Diesel Average"
      : "Fixed";
  const tollDriver = trip.tollExpenseType === "DRIVER" ? n(trip.tollAmount) : 0;
  const ureaDriver = trip.ureaExpenseType === "DRIVER" ? n(trip.ureaAmount) : 0;

  return (
    <div className="bg-white p-4 text-black">
      <PrintToolbar />
      <div className="mx-auto max-w-[190mm] border-2 border-black text-xs">
        <div className="border-b-2 border-black py-1 text-center text-base font-bold tracking-widest">
          TRIP SHEET
        </div>
        <div className="border-b border-black px-2 py-1 text-center">
          <div className="text-lg font-bold uppercase">{firm?.name}</div>
        </div>
        <table className="w-full border-collapse">
          <tbody>
            <tr>
              <td className={label}>Trip Sheet No</td>
              <td className={cell}>{trip.tripNo}</td>
              <td className={label}>Date</td>
              <td className={cell}>{formatDate(trip.tripDate)}</td>
              <td className={label}>Method</td>
              <td className={cell}>{methodLabel}</td>
            </tr>
            <tr>
              <td className={label}>Vehicle No</td>
              <td className={cell}>{vehicle?.number}</td>
              <td className={label}>Driver</td>
              <td className={cell}>{driver?.name ?? ""}</td>
              <td className={label}>Period</td>
              <td className={cell}>
                {trip.fromDate ? formatDate(trip.fromDate) : formatDate(trip.tripDate)} —{" "}
                {trip.toDate ? formatDate(trip.toDate) : ""}
              </td>
            </tr>
          </tbody>
        </table>

        {linkedDocs.length > 0 && (
          <>
            <div className="border-b border-t border-black bg-neutral-100 px-2 py-0.5 font-semibold">
              Chalans / Broker Slips Settled (Grand Total)
            </div>
            <table className="w-full border-collapse">
              <tbody>
                {linkedDocs.map((d, i) => (
                  <tr key={i}>
                    <td className={cell}>{d.type}</td>
                    <td className={cell}>{d.no}</td>
                    <td className={cell}>{formatDate(d.date)}</td>
                    <td className={`${cell} text-right`}>{formatMoney(d.freight)}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td colSpan={3} className={cell}>
                    Total Grand Total
                  </td>
                  <td className={`${cell} text-right`}>{formatMoney(freight)}</td>
                </tr>
              </tbody>
            </table>
          </>
        )}

        <div className="grid grid-cols-2">
          {/* left: actual */}
          <div className="border-r border-black">
            <div className="border-b border-t border-black bg-neutral-100 px-2 py-0.5 font-semibold">
              Actual Driver Expenses
            </div>
            <table className="w-full border-collapse">
              <tbody>
                {(
                  [
                    ["Diesel", n(trip.actualDiesel)],
                    ["Driver Advance", n(trip.actualAdvance)],
                    [`Toll (${trip.tollExpenseType.toLowerCase()})`, tollDriver],
                    [
                      `Urea ${n(trip.ureaQty)} L × ${n(trip.ureaRate)} (${trip.ureaExpenseType.toLowerCase()})`,
                      ureaDriver,
                    ],
                  ] as [string, number][]
                ).map(([l, v]) => (
                  <tr key={l}>
                    <td className={cell}>{l}</td>
                    <td className={`${cell} text-right`}>{formatMoney(v)}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className={label}>Total Actual</td>
                  <td className={`${label} text-right`}>{formatMoney(n(trip.actualTotal))}</td>
                </tr>
              </tbody>
            </table>
          </div>
          {/* right: approved */}
          <div>
            <div className="border-b border-t border-black bg-neutral-100 px-2 py-0.5 font-semibold">
              Company Approved Expenses
            </div>
            <table className="w-full border-collapse">
              <tbody>
                {isDieselAvg ? (
                  <>
                    <tr>
                      <td className={cell}>
                        Loading KM: <b>{n(trip.loadingKm).toLocaleString("en-IN")}</b> · Unloading
                        KM: <b>{n(trip.unloadingKm).toLocaleString("en-IN")}</b> · New Loading KM:{" "}
                        <b>{n(trip.newLoadingKm).toLocaleString("en-IN")}</b>
                      </td>
                      <td className={cell} />
                    </tr>
                    <tr>
                      <td className={cell}>
                        Distance 1: {dist1} km ÷ {n(trip.dieselAvg)} × {n(trip.dieselRate)}
                      </td>
                      <td className={`${cell} text-right`}>
                        {formatMoney(
                          n(trip.dieselAvg) > 0 ? (dist1 / n(trip.dieselAvg)) * n(trip.dieselRate) : 0
                        )}
                      </td>
                    </tr>
                    <tr>
                      <td className={cell}>
                        Distance 2: {dist2} km ÷ {n(trip.dieselAvg2)} × {n(trip.dieselRate)}
                      </td>
                      <td className={`${cell} text-right`}>
                        {formatMoney(
                          n(trip.dieselAvg2) > 0 ? (dist2 / n(trip.dieselAvg2)) * n(trip.dieselRate) : 0
                        )}
                      </td>
                    </tr>
                    <tr>
                      <td className={cell}>Total Diesel Cost (rounded)</td>
                      <td className={`${cell} text-right font-semibold`}>
                        {formatMoney(
                          Math.round(
                            (n(trip.dieselAvg) > 0
                              ? (dist1 / n(trip.dieselAvg)) * n(trip.dieselRate)
                              : 0) +
                              (n(trip.dieselAvg2) > 0
                                ? (dist2 / n(trip.dieselAvg2)) * n(trip.dieselRate)
                                : 0)
                          )
                        )}
                      </td>
                    </tr>
                    <tr>
                      <td className={cell}>Driver Advance</td>
                      <td className={`${cell} text-right`}>{formatMoney(n(trip.apprDriverAdvance))}</td>
                    </tr>
                    <tr>
                      <td className={cell}>Road Bill Expenses</td>
                      <td className={`${cell} text-right`}>{formatMoney(n(trip.roadBillExp))}</td>
                    </tr>
                    <tr>
                      <td className={cell}>
                        Fooding ({n(trip.foodingDays)} × {n(trip.foodingRate)})
                      </td>
                      <td className={`${cell} text-right`}>
                        {formatMoney(n(trip.foodingDays) * n(trip.foodingRate))}
                      </td>
                    </tr>
                    <tr>
                      <td className={cell}>RTO / Road Expenses</td>
                      <td className={`${cell} text-right`}>{formatMoney(n(trip.rtoExp))}</td>
                    </tr>
                  </>
                ) : (
                  <>
                    <tr>
                      <td className={cell}>Fixed Trip Expense</td>
                      <td className={`${cell} text-right`}>{formatMoney(n(trip.fixedTripExp))}</td>
                    </tr>
                    <tr>
                      <td className={cell}>Driver Advance</td>
                      <td className={`${cell} text-right`}>{formatMoney(n(trip.apprDriverAdvance))}</td>
                    </tr>
                  </>
                )}
                <tr className="font-semibold">
                  <td className={label}>Total Approved</td>
                  <td className={`${label} text-right`}>{formatMoney(n(trip.approvedTotal))}</td>
                </tr>
                <tr>
                  <td className={cell}>Grand Total (Company Vehicle Cost)</td>
                  <td className={`${cell} text-right`}>{formatMoney(n(trip.grandTotal))}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="border-t border-black bg-neutral-100 px-2 py-0.5 font-semibold">
          Driver Settlement (Approved − Actual)
        </div>
        <table className="w-full border-collapse">
          <tbody>
            <tr>
              <td className={cell}>
                {formatMoney(n(trip.approvedTotal))} − {formatMoney(n(trip.actualTotal))}
              </td>
              <td className={`${cell} text-right font-bold`}>
                Driver Balance: {signed(n(trip.driverBalance))}
              </td>
              <td className={cell}>
                {n(trip.driverBalance) > 0
                  ? "Company owes the driver"
                  : n(trip.driverBalance) < 0
                    ? "Driver owes the company"
                    : "Even"}
              </td>
              <td className={cell}>
                Status: {settlement ? settlement.status : "—"}
                {settlement?.voucherNo ? ` (voucher ${settlement.voucherNo})` : ""}
              </td>
            </tr>
          </tbody>
        </table>

        <div className="flex border-t border-black">
          <div className="flex h-20 w-1/2 items-end border-r border-black p-2">Driver Signature</div>
          <div className="flex h-20 w-1/2 flex-col items-end justify-between p-2">
            <div className="font-semibold">For {firm?.name}</div>
            <div>Authorized Signatory</div>
          </div>
        </div>
      </div>
    </div>
  );
}
