import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { formatDate, formatMoney, toNum } from "@/lib/utils";
import { PrintToolbar } from "./print-toolbar";

export const dynamic = "force-dynamic";

export default async function ChalanPrintPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { copies?: string };
}) {
  const session = requireSession();
  const copies = Math.min(3, Math.max(1, parseInt(searchParams.copies ?? "1", 10) || 1));

  const data = await withTenant(session.tenantId, async (tx) => {
    const chalan = await tx.chalan.findFirst({
      where: { id: params.id, deletedAt: null },
      include: {
        lrs: { include: { lr: { include: { items: true } } } },
        advances: true,
      },
    });
    if (!chalan) return null;
    const [firm, broker, vehicle, cities, parties] = await Promise.all([
      tx.firm.findUnique({ where: { id: chalan.firmId } }),
      tx.party.findUnique({ where: { id: chalan.brokerId } }),
      tx.vehicle.findUnique({ where: { id: chalan.vehicleId } }),
      tx.city.findMany(),
      tx.party.findMany(),
    ]);
    return { chalan, firm, broker, vehicle, cities, parties };
  });

  if (!data) notFound();
  const { chalan, firm, broker, vehicle, cities, parties } = data;
  const cityName = (id: string | null) => (id ? cities.find((c) => c.id === id)?.name ?? "" : "");
  const partyName = (id: string) => parties.find((p) => p.id === id)?.name ?? "";

  // NOTE: booking freight is intentionally NOT rendered anywhere on the print.
  const Copy = ({ n }: { n: number }) => (
    <div className="mx-auto max-w-[190mm] break-after-page border border-black p-4 text-sm">
      {/* firm header */}
      <div className="border-b border-black pb-2 text-center">
        <div className="text-xl font-bold uppercase">{firm?.name}</div>
        <div className="text-xs">
          {[firm?.address1, firm?.address2].filter(Boolean).join(", ")}
        </div>
        <div className="text-xs">
          {[
            firm?.mobile && `Mob: ${firm.mobile}`,
            firm?.phone && `Ph: ${firm.phone}`,
            firm?.gstin && `GSTIN: ${firm.gstin}`,
            firm?.pan && `PAN: ${firm.pan}`,
          ]
            .filter(Boolean)
            .join(" | ")}
        </div>
        <div className="mt-1 text-sm font-semibold">
          FREIGHT CHALAN {copies > 1 ? `(Copy ${n})` : ""}
        </div>
      </div>

      {/* chalan details */}
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
        <div>
          <b>Chalan No:</b> {chalan.chalanNo}
        </div>
        <div>
          <b>Date:</b> {formatDate(chalan.chalanDate)}
        </div>
        <div>
          <b>Broker/Owner:</b> {broker?.name}
        </div>
        <div>
          <b>Vehicle:</b> {vehicle?.number}
        </div>
        <div>
          <b>Driver:</b> {[chalan.driverName, chalan.driverMobile].filter(Boolean).join(" / ")}
        </div>
        <div>
          <b>License No:</b> {chalan.licenseNo ?? ""}
        </div>
        <div>
          <b>Payable At:</b> {chalan.payableAt ?? ""}
        </div>
        <div>
          <b>PAN:</b> {broker?.pan ?? ""}
        </div>
      </div>

      {/* LR list — no booking freight anywhere */}
      <table className="mt-3 w-full border-collapse text-xs">
        <thead>
          <tr>
            {["#", "LR No", "Date", "From", "To", "Consignor", "Qty", "Actual Wt", "Charge Wt"].map(
              (h) => (
                <th key={h} className="border border-black px-1 py-0.5 text-left">
                  {h}
                </th>
              )
            )}
          </tr>
        </thead>
        <tbody>
          {chalan.lrs.map(({ lr }, i) => (
            <tr key={lr.id}>
              <td className="border border-black px-1 py-0.5">{i + 1}</td>
              <td className="border border-black px-1 py-0.5">{lr.lrNo}</td>
              <td className="border border-black px-1 py-0.5">{formatDate(lr.lrDate)}</td>
              <td className="border border-black px-1 py-0.5">{cityName(lr.sourceCityId)}</td>
              <td className="border border-black px-1 py-0.5">{cityName(lr.destCityId)}</td>
              <td className="border border-black px-1 py-0.5">{partyName(lr.consignorId)}</td>
              <td className="border border-black px-1 py-0.5 text-right">
                {lr.items.reduce((s, it) => s + toNum(it.qty), 0)}
              </td>
              <td className="border border-black px-1 py-0.5 text-right">
                {lr.items.reduce((s, it) => s + toNum(it.actualWt), 0)}
              </td>
              <td className="border border-black px-1 py-0.5 text-right">
                {lr.items.reduce((s, it) => s + toNum(it.chargeWt), 0)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-3 flex gap-4">
        {/* deductions summary */}
        <table className="w-1/2 border-collapse text-xs">
          <tbody>
            {(
              [
                ["Vehicle Freight", toNum(chalan.freight)],
                ["Detention", toNum(chalan.detention)],
                ["ODC", toNum(chalan.odcAmt)],
                ["Fine Slip", toNum(chalan.fineSlip)],
                ["Other", toNum(chalan.otherAmt)],
                ["Less: LD Charge", -toNum(chalan.ldCharge)],
                ["Less: Shortage", -toNum(chalan.shortageAmt)],
                ["Total Chalan Amount", toNum(chalan.totalChalanAmt)],
                ["Less: Commission", -toNum(chalan.commissionAmt)],
                [`Less: TDS @ ${toNum(chalan.tdsPct)}%`, -toNum(chalan.tdsAmt)],
                ["Less: Mamool", -toNum(chalan.mamool)],
                ["Less: Courier", -toNum(chalan.courierCharge)],
                ["Grand Total", toNum(chalan.grandTotal)],
              ] as [string, number][]
            ).map(([label, v]) => (
              <tr key={label}>
                <td className="border border-black px-1 py-0.5">{label}</td>
                <td className="border border-black px-1 py-0.5 text-right">
                  {formatMoney(Math.abs(v)) === "0.00" && !label.startsWith("Total") && !label.startsWith("Grand")
                    ? "-"
                    : `${v < 0 ? "(-) " : ""}${formatMoney(Math.abs(v))}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* advances */}
        <div className="w-1/2">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                {["Advance", "Date", "Detail", "Amount"].map((h) => (
                  <th key={h} className="border border-black px-1 py-0.5 text-left">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {chalan.advances.length === 0 && (
                <tr>
                  <td colSpan={4} className="border border-black px-1 py-1 text-center">
                    No advances
                  </td>
                </tr>
              )}
              {chalan.advances.map((a) => (
                <tr key={a.id}>
                  <td className="border border-black px-1 py-0.5">{a.type.replace("_", " ")}</td>
                  <td className="border border-black px-1 py-0.5">{formatDate(a.date)}</td>
                  <td className="border border-black px-1 py-0.5">
                    {[a.supplierName, a.bankName, a.remarks].filter(Boolean).join(" / ")}
                  </td>
                  <td className="border border-black px-1 py-0.5 text-right">
                    {formatMoney(toNum(a.amount))}
                  </td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td colSpan={3} className="border border-black px-1 py-0.5">
                  Total Advance
                </td>
                <td className="border border-black px-1 py-0.5 text-right">
                  {formatMoney(toNum(chalan.advanceTotal))}
                </td>
              </tr>
              <tr className="font-bold">
                <td colSpan={3} className="border border-black px-1 py-0.5">
                  Balance Payable
                </td>
                <td className="border border-black px-1 py-0.5 text-right">
                  {formatMoney(toNum(chalan.balance))}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-8 flex justify-between text-xs">
        <div>Driver Signature</div>
        <div>For {firm?.name}</div>
      </div>
    </div>
  );

  return (
    <div className="bg-white p-4 text-black">
      <PrintToolbar copies={copies} />
      <div className="space-y-6">
        {Array.from({ length: copies }, (_, i) => (
          <Copy key={i} n={i + 1} />
        ))}
      </div>
    </div>
  );
}
