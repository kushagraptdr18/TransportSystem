import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { formatDate, formatMoney, toNum } from "@/lib/utils";
import { PrintToolbar } from "./print-toolbar";

export const dynamic = "force-dynamic";

const cell = "border border-black px-2 py-1";
const label = "border border-black bg-neutral-100 px-2 py-1 font-semibold";

export default async function DriverFnfPrintPage({ params }: { params: { id: string } }) {
  const session = requireSession();
  const data = await withTenant(session.tenantId, async (tx) => {
    const fnf = await tx.driverFnf.findFirst({ where: { id: params.id, deletedAt: null } });
    if (!fnf) return null;
    const [firm, driver, bank] = await Promise.all([
      tx.firm.findUnique({ where: { id: fnf.firmId } }),
      tx.driver.findFirst({ where: { id: fnf.driverId } }),
      fnf.bankPartyId
        ? tx.party.findUnique({ where: { id: fnf.bankPartyId } })
        : Promise.resolve(null),
    ]);
    return { fnf, firm, driver, bank };
  });
  if (!data) notFound();
  const { fnf, firm, driver, bank } = data;
  const n = (v: unknown) => toNum(String(v ?? 0));
  const final = n(fnf.finalPayable);

  return (
    <div className="bg-white p-4 text-black">
      <PrintToolbar />
      <div className="mx-auto max-w-[190mm] border-2 border-black text-sm">
        <div className="border-b-2 border-black py-1 text-center text-base font-bold tracking-widest">
          DRIVER FULL &amp; FINAL SETTLEMENT
        </div>
        <div className="border-b border-black px-2 py-1 text-center">
          <div className="text-lg font-bold uppercase">{firm?.name}</div>
        </div>
        <table className="w-full border-collapse text-xs">
          <tbody>
            <tr>
              <td className={label}>Settlement No</td>
              <td className={cell}>{fnf.settlementNo}</td>
              <td className={label}>Settlement Date</td>
              <td className={cell}>{formatDate(fnf.date)}</td>
            </tr>
            <tr>
              <td className={label}>Driver</td>
              <td className={cell}>
                {driver?.name} ({driver?.driverCode})
              </td>
              <td className={label}>Last Working Date</td>
              <td className={cell}>
                {fnf.lastWorkingDate ? formatDate(fnf.lastWorkingDate) : ""}
              </td>
            </tr>
            <tr>
              <td className={label}>Payment Mode</td>
              <td className={cell}>
                {fnf.paymentMode ?? ""}
                {bank ? ` — ${bank.name}` : ""}
              </td>
              <td className={label}>Reference No</td>
              <td className={cell}>{fnf.refNo ?? ""}</td>
            </tr>
          </tbody>
        </table>

        <div className="border-b border-t border-black bg-neutral-100 px-2 py-0.5 text-xs font-semibold">
          Settlement Calculation
        </div>
        <table className="w-full border-collapse text-xs">
          <tbody>
            {(
              [
                ["Gross Salary (running balance)", n(fnf.grossSalary)],
                ["Less: Shortage Deduction", -n(fnf.shortageAdjust)],
                ["Less: Driver Advance Adjustment", -n(fnf.advanceAdjust)],
                ["Less: Negative Balance Adjustment", -n(fnf.negativeAdjust)],
                ["Less: Other Recoveries", -n(fnf.otherRecoveries)],
                ["Add: Other Payments / Incentives", n(fnf.otherPayments)],
              ] as [string, number][]
            ).map(([l, v]) => (
              <tr key={l}>
                <td className={cell}>{l}</td>
                <td className={`${cell} text-right`}>{formatMoney(v)}</td>
              </tr>
            ))}
            <tr className="text-sm font-bold">
              <td className={label}>
                FINAL {final >= 0 ? "AMOUNT PAID TO DRIVER" : "AMOUNT RECEIVED FROM DRIVER"}
              </td>
              <td className={`${label} text-right`}>{formatMoney(Math.abs(final))}</td>
            </tr>
          </tbody>
        </table>

        {fnf.remarks && (
          <div className="border-t border-black px-2 py-1 text-xs">
            <b>Remarks:</b> {fnf.remarks}
          </div>
        )}
        <div className="border-t border-black px-2 py-1 text-[10px]">
          This document is the driver&apos;s full &amp; final settlement. All salary, shortage,
          advance and balance adjustments listed above stand settled; any unadjusted remainder
          continues as outstanding in the respective registers.
        </div>
        <div className="flex border-t border-black text-xs">
          <div className="flex h-20 w-1/2 items-end border-r border-black p-2">
            Driver Signature
          </div>
          <div className="flex h-20 w-1/2 flex-col items-end justify-between p-2">
            <div className="font-semibold">For {firm?.name}</div>
            <div>Authorized Signatory</div>
          </div>
        </div>
      </div>
    </div>
  );
}
