import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { formatDate, formatMoney } from "@/lib/utils";
import { PrintToolbar } from "@/components/lr/print-toolbar";

export const dynamic = "force-dynamic";

const COPIES = ["CONSIGNOR COPY", "CONSIGNEE COPY"] as const;

export default async function LrPrintPage({ params }: { params: { id: string } }) {
  const session = requireSession();

  const data = await withTenant(session.tenantId, async (tx) => {
    const lr = await tx.lr.findFirst({
      where: { id: params.id, deletedAt: null },
      include: { items: true },
    });
    if (!lr) return null;
    const [firm, sourceCity, destCity, consignor, consignee, billTo, vehicle] = await Promise.all([
      tx.firm.findUniqueOrThrow({ where: { id: session.firmId } }),
      tx.city.findUnique({ where: { id: lr.sourceCityId } }),
      tx.city.findUnique({ where: { id: lr.destCityId } }),
      tx.party.findUnique({ where: { id: lr.consignorId } }),
      tx.party.findUnique({ where: { id: lr.consigneeId } }),
      lr.billToId ? tx.party.findUnique({ where: { id: lr.billToId } }) : Promise.resolve(null),
      lr.vehicleId ? tx.vehicle.findUnique({ where: { id: lr.vehicleId } }) : Promise.resolve(null),
    ]);
    return { lr, firm, sourceCity, destCity, consignor, consignee, billTo, vehicle };
  });

  if (!data) notFound();
  const { lr, firm, sourceCity, destCity, consignor, consignee, billTo, vehicle } = data;
  const showAmounts = lr.printFreight;

  const charges: [string, number][] = [
    ["Freight", Number(lr.freight)],
    ["Hamali", Number(lr.hamali)],
    ["Pre Bhada", Number(lr.preBhada)],
    ["Bilty Charge", Number(lr.biltyCharge)],
    ["Coll. Charge", Number(lr.collCharge)],
    ["CPC", Number(lr.cpc)],
    ["Other", Number(lr.otherCharge)],
  ];
  const gstRows: [string, number][] = lr.gstApplicable
    ? [
        ["CGST", Number(lr.cgstAmt)],
        ["SGST", Number(lr.sgstAmt)],
        ["IGST", Number(lr.igstAmt)],
      ].filter(([, v]) => Number(v) > 0) as [string, number][]
    : [];

  return (
    <div className="min-h-screen bg-white text-black">
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              .no-print { display: none !important; }
              body { background: #fff; }
              .lr-copy { page-break-inside: avoid; }
            }
            @page { size: A4; margin: 8mm; }
          `,
        }}
      />
      <PrintToolbar note="Prints 2 copies: Consignor & Consignee" />

      <div className="mx-auto max-w-[190mm] space-y-6 p-4">
        {COPIES.map((copyLabel) => (
          <div key={copyLabel} className="lr-copy border-2 border-black text-[11px] leading-tight">
            {/* Firm header */}
            <div className="flex items-start justify-between border-b border-black p-2">
              <div>
                <div className="text-lg font-bold uppercase">{firm.name}</div>
                <div>{[firm.address1, firm.address2].filter(Boolean).join(", ")}</div>
                <div>
                  {firm.gstin && <span>GSTIN: {firm.gstin} </span>}
                  {firm.pan && <span>PAN: {firm.pan}</span>}
                </div>
                <div>
                  {firm.phone && <span>Ph: {firm.phone} </span>}
                  {firm.mobile && <span>Mob: {firm.mobile}</span>}
                </div>
              </div>
              <div className="text-right">
                <div className="border border-black px-2 py-0.5 font-semibold">{copyLabel}</div>
                {lr.isDummy && <div className="mt-1 font-semibold">DUMMY LR</div>}
                <div className="mt-1">
                  LR Type: <b>{lr.lrType.replace("_", " ")}</b>
                </div>
              </div>
            </div>

            {/* LR details */}
            <div className="grid grid-cols-4 border-b border-black">
              <div className="border-r border-black p-1.5">
                <div>LR No: <b>{lr.lrNo}</b></div>
                <div>Date: <b>{formatDate(lr.lrDate)}</b></div>
                {lr.refLrNo && <div>Ref LR: {lr.refLrNo}</div>}
              </div>
              <div className="border-r border-black p-1.5">
                <div>From: <b>{sourceCity?.name}</b></div>
                <div>To: <b>{destCity?.name}</b></div>
                {lr.deliveryAt && <div>Delivery At: {lr.deliveryAt}</div>}
              </div>
              <div className="border-r border-black p-1.5">
                <div>Vehicle: <b>{vehicle?.number ?? lr.vehicleText ?? ""}</b></div>
                {lr.ownerName && <div>Owner: {lr.ownerName}</div>}
                {lr.privateMarka && <div>Marka: {lr.privateMarka}</div>}
              </div>
              <div className="p-1.5">
                {lr.invoiceNo && <div>Inv No: {lr.invoiceNo}</div>}
                {lr.invoiceDate && <div>Inv Date: {formatDate(lr.invoiceDate)}</div>}
                {lr.ewayBillNo && <div>E-way: {lr.ewayBillNo}</div>}
                {lr.goodsValue != null && showAmounts && (
                  <div>Goods Value: {formatMoney(Number(lr.goodsValue))}</div>
                )}
              </div>
            </div>

            {/* Parties */}
            <div className="grid grid-cols-3 border-b border-black">
              <div className="border-r border-black p-1.5">
                <div className="font-semibold underline">Consignor</div>
                <div className="font-medium">{consignor?.name}</div>
                <div>{[consignor?.address1, consignor?.address2].filter(Boolean).join(", ")}</div>
                {consignor?.gstin && <div>GSTIN: {consignor.gstin}</div>}
              </div>
              <div className="border-r border-black p-1.5">
                <div className="font-semibold underline">Consignee</div>
                <div className="font-medium">{consignee?.name}</div>
                <div>{[consignee?.address1, consignee?.address2].filter(Boolean).join(", ")}</div>
                {consignee?.gstin && <div>GSTIN: {consignee.gstin}</div>}
              </div>
              <div className="p-1.5">
                <div className="font-semibold underline">Billed To</div>
                <div className="font-medium">{billTo?.name ?? consignor?.name}</div>
                {lr.insCompany && (
                  <div className="mt-1">
                    <div className="font-semibold underline">Insurance</div>
                    <div>
                      {lr.insCompany} {lr.insPolicyNo && `/ ${lr.insPolicyNo}`}
                      {lr.insAmount != null && showAmounts && ` / ${formatMoney(Number(lr.insAmount))}`}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Items + charges */}
            <div className="grid grid-cols-[1fr_180px]">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-black text-left">
                    <th className="border-r border-black p-1">Product / Description</th>
                    <th className="border-r border-black p-1 text-right">Qty</th>
                    <th className="border-r border-black p-1 text-right">Actual Wt</th>
                    <th className="border-r border-black p-1 text-right">Charge Wt</th>
                    <th className="border-r border-black p-1">Unit</th>
                    {showAmounts && (
                      <>
                        <th className="border-r border-black p-1 text-right">Rate</th>
                        <th className="p-1 text-right">Amount</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {lr.items.map((item) => (
                    <tr key={item.id} className="align-top">
                      <td className="border-r border-black p-1">
                        {item.productName}
                        {item.description && (
                          <span className="text-[10px]"> — {item.description}</span>
                        )}
                      </td>
                      <td className="border-r border-black p-1 text-right">
                        {Number(item.qty).toFixed(3)}
                      </td>
                      <td className="border-r border-black p-1 text-right">
                        {Number(item.actualWt).toFixed(3)}
                      </td>
                      <td className="border-r border-black p-1 text-right">
                        {Number(item.chargeWt).toFixed(3)}
                      </td>
                      <td className="border-r border-black p-1">{item.unit}</td>
                      {showAmounts && (
                        <>
                          <td className="border-r border-black p-1 text-right">
                            {formatMoney(Number(item.rate))}
                          </td>
                          <td className="p-1 text-right">{formatMoney(Number(item.amount))}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="border-l border-black">
                {showAmounts ? (
                  <table className="w-full border-collapse">
                    <tbody>
                      {charges
                        .filter(([label, val]) => label === "Freight" || val > 0)
                        .map(([label, val]) => (
                          <tr key={label}>
                            <td className="p-1">{label}</td>
                            <td className="p-1 text-right">{formatMoney(val)}</td>
                          </tr>
                        ))}
                      <tr className="border-t border-black font-semibold">
                        <td className="p-1">Total</td>
                        <td className="p-1 text-right">{formatMoney(Number(lr.total))}</td>
                      </tr>
                      {gstRows.map(([label, val]) => (
                        <tr key={label}>
                          <td className="p-1">{label}</td>
                          <td className="p-1 text-right">{formatMoney(val)}</td>
                        </tr>
                      ))}
                      {Number(lr.advance) > 0 && (
                        <tr>
                          <td className="p-1">Advance</td>
                          <td className="p-1 text-right">{formatMoney(Number(lr.advance))}</td>
                        </tr>
                      )}
                      <tr className="border-t border-black font-bold">
                        <td className="p-1">Grand Total</td>
                        <td className="p-1 text-right">{formatMoney(Number(lr.grandTotal))}</td>
                      </tr>
                    </tbody>
                  </table>
                ) : (
                  <div className="p-2 text-center font-semibold">TO BE BILLED</div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-end justify-between border-t border-black p-2">
              <div className="max-w-[60%]">
                {lr.remarks && <div>Remarks: {lr.remarks}</div>}
                <div className="mt-4 text-[10px]">
                  Goods are carried at owner&apos;s risk. Subject to jurisdiction of{" "}
                  {firm.jurisdiction || "local courts"}.
                </div>
              </div>
              <div className="text-center">
                <div className="mb-8">For {firm.name}</div>
                <div className="border-t border-black px-6 pt-1">Authorised Signatory</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
