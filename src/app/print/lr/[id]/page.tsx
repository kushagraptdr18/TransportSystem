/* eslint-disable @next/next/no-img-element */
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { formatDate, formatMoney } from "@/lib/utils";
import { PrintToolbar } from "@/components/lr/print-toolbar";

export const dynamic = "force-dynamic";

const COPIES = ["CONSIGNOR COPY", "CONSIGNEE COPY"] as const;

function LabelValue({ label, value }: { label: string; value: React.ReactNode }) {
  if (value == null || value === "") return null;
  return (
    <div className="mb-1 last:mb-0">
      <div className="text-[8px] font-semibold uppercase tracking-wider text-neutral-500">
        {label}
      </div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}

function PartyBox({
  title,
  name,
  address,
  gstin,
}: {
  title: string;
  name?: string | null;
  address?: string | null;
  gstin?: string | null;
}) {
  return (
    <div>
      <div className="print-fill bg-neutral-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider">
        {title}
      </div>
      <div className="p-1.5">
        <div className="font-bold">{name}</div>
        {address && <div className="text-[10px]">{address}</div>}
        {gstin && (
          <div className="text-[10px]">
            GSTIN: <span className="font-semibold">{gstin}</span>
          </div>
        )}
      </div>
    </div>
  );
}

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
    ? ([
        ["CGST", Number(lr.cgstAmt)],
        ["SGST", Number(lr.sgstAmt)],
        ["IGST", Number(lr.igstAmt)],
      ].filter(([, v]) => Number(v) > 0) as [string, number][])
    : [];

  const totalQty = lr.items.reduce((s, i) => s + Number(i.qty), 0);
  const totalActual = lr.items.reduce((s, i) => s + Number(i.actualWt), 0);
  const totalCharge = lr.items.reduce((s, i) => s + Number(i.chargeWt), 0);

  return (
    <div className="min-h-screen bg-neutral-200 text-black print:bg-white">
      <style
        dangerouslySetInnerHTML={{
          __html: `
            .print-fill { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            @media print {
              .no-print { display: none !important; }
              body { background: #fff; }
              .lr-copy { page-break-inside: avoid; box-shadow: none !important; }
            }
            @page { size: A4; margin: 8mm; }
          `,
        }}
      />
      <PrintToolbar note="Prints 2 copies: Consignor & Consignee" />

      <div className="mx-auto max-w-[190mm] space-y-6 p-4">
        {COPIES.map((copyLabel) => (
          <div
            key={copyLabel}
            className="lr-copy border-2 border-black bg-white text-[11px] leading-tight shadow-lg"
          >
            {/* ---- Firm header ---- */}
            <div className="flex items-stretch justify-between gap-3 p-2.5 pb-2">
              <div className="flex items-center gap-3">
                {firm.logoPath ? (
                  <img
                    src={`/api/uploads/${firm.logoPath}`}
                    alt=""
                    className="h-14 w-14 object-contain"
                  />
                ) : (
                  <div className="print-fill flex h-12 w-12 items-center justify-center bg-black text-xl font-black text-white">
                    {firm.name.charAt(0)}
                  </div>
                )}
                <div>
                  <div className="text-[19px] font-black uppercase leading-none tracking-tight">
                    {firm.name}
                  </div>
                  <div className="mt-1 text-[10px]">
                    {[firm.address1, firm.address2].filter(Boolean).join(", ")}
                  </div>
                  <div className="text-[10px]">
                    {firm.gstin && (
                      <span>
                        GSTIN: <b>{firm.gstin}</b>
                      </span>
                    )}
                    {firm.pan && (
                      <span>
                        {"  "}PAN: <b>{firm.pan}</b>
                      </span>
                    )}
                  </div>
                  <div className="text-[10px]">
                    {firm.phone && <span>Ph: {firm.phone} </span>}
                    {firm.mobile && <span>Mob: {firm.mobile}</span>}
                    {firm.email && <span> · {firm.email}</span>}
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-end justify-between gap-1">
                <div className="print-fill bg-black px-3 py-1 text-[10px] font-bold tracking-widest text-white">
                  {copyLabel}
                </div>
                <div className="flex gap-1">
                  {lr.isDummy && (
                    <div className="border-2 border-black px-2 py-0.5 text-[10px] font-black">
                      DUMMY
                    </div>
                  )}
                  <div className="border border-black px-2 py-0.5 text-[10px] font-bold">
                    {lr.lrType.replace("_", " ")}
                  </div>
                </div>
              </div>
            </div>

            {/* ---- LR number band ---- */}
            <div className="print-fill flex items-center justify-between border-y-2 border-black bg-neutral-100 px-3 py-1.5">
              <div className="text-[15px] font-black tracking-wide">
                LR No. <span className="text-[18px]">{lr.lrNo}</span>
              </div>
              <div className="text-[13px] font-bold">
                {sourceCity?.name} <span className="px-1 font-black">➔</span> {destCity?.name}
              </div>
              <div className="text-[12px] font-bold">Date: {formatDate(lr.lrDate)}</div>
            </div>

            {/* ---- transport details grid ---- */}
            <div className="grid grid-cols-4 border-b border-black">
              <div className="border-r border-black p-1.5">
                <LabelValue label="Vehicle No" value={vehicle?.number ?? lr.vehicleText} />
                <LabelValue label="Owner" value={lr.ownerName} />
              </div>
              <div className="border-r border-black p-1.5">
                <LabelValue label="Delivery At" value={lr.deliveryAt} />
                <LabelValue label="Private Marka" value={lr.privateMarka} />
                <LabelValue label="Ref LR" value={lr.refLrNo} />
              </div>
              <div className="border-r border-black p-1.5">
                <LabelValue label="Party Invoice No" value={lr.invoiceNo} />
                <LabelValue
                  label="Invoice Date"
                  value={lr.invoiceDate ? formatDate(lr.invoiceDate) : null}
                />
              </div>
              <div className="p-1.5">
                <LabelValue label="E-Way Bill" value={lr.ewayBillNo} />
                <LabelValue
                  label="Goods Value"
                  value={
                    lr.goodsValue != null && showAmounts
                      ? formatMoney(Number(lr.goodsValue))
                      : null
                  }
                />
              </div>
            </div>

            {/* ---- parties ---- */}
            <div className="grid grid-cols-3 divide-x divide-black border-b border-black">
              <PartyBox
                title="Consignor"
                name={consignor?.name}
                address={[consignor?.address1, consignor?.address2].filter(Boolean).join(", ")}
                gstin={consignor?.gstin}
              />
              <PartyBox
                title="Consignee"
                name={consignee?.name}
                address={[consignee?.address1, consignee?.address2].filter(Boolean).join(", ")}
                gstin={consignee?.gstin}
              />
              <div>
                <PartyBox title="Billed To" name={billTo?.name ?? consignor?.name} />
                {lr.insCompany && (
                  <div className="px-1.5 pb-1.5">
                    <div className="text-[8px] font-semibold uppercase tracking-wider text-neutral-500">
                      Insurance
                    </div>
                    <div className="text-[10px]">
                      {lr.insCompany} {lr.insPolicyNo && `/ ${lr.insPolicyNo}`}
                      {lr.insAmount != null && showAmounts && ` / ${formatMoney(Number(lr.insAmount))}`}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ---- items + charges ---- */}
            <div className="grid grid-cols-[1fr_190px] border-b border-black">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="print-fill border-b border-black bg-neutral-100 text-left text-[9px] uppercase tracking-wider">
                    <th className="border-r border-black p-1.5">Product / Description</th>
                    <th className="border-r border-black p-1.5 text-right">Qty</th>
                    <th className="border-r border-black p-1.5 text-right">Actual Wt</th>
                    <th className="border-r border-black p-1.5 text-right">Charge Wt</th>
                    <th className="border-r border-black p-1.5">Unit</th>
                    {showAmounts && (
                      <>
                        <th className="border-r border-black p-1.5 text-right">Rate</th>
                        <th className="p-1.5 text-right">Amount</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {lr.items.map((item) => (
                    <tr key={item.id} className="border-b border-dotted border-neutral-400 align-top">
                      <td className="border-r border-black p-1.5 font-semibold">
                        {item.productName}
                        {item.description && (
                          <span className="text-[10px] font-normal"> — {item.description}</span>
                        )}
                      </td>
                      <td className="border-r border-black p-1.5 text-right tabular-nums">
                        {Number(item.qty).toFixed(3)}
                      </td>
                      <td className="border-r border-black p-1.5 text-right tabular-nums">
                        {Number(item.actualWt).toFixed(3)}
                      </td>
                      <td className="border-r border-black p-1.5 text-right tabular-nums">
                        {Number(item.chargeWt).toFixed(3)}
                      </td>
                      <td className="border-r border-black p-1.5">{item.unit}</td>
                      {showAmounts && (
                        <>
                          <td className="border-r border-black p-1.5 text-right tabular-nums">
                            {formatMoney(Number(item.rate))}
                          </td>
                          <td className="p-1.5 text-right tabular-nums">
                            {formatMoney(Number(item.amount))}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                  <tr className="font-bold">
                    <td className="border-r border-black p-1.5 text-right text-[9px] uppercase tracking-wider">
                      Total
                    </td>
                    <td className="border-r border-black p-1.5 text-right tabular-nums">
                      {totalQty.toFixed(3)}
                    </td>
                    <td className="border-r border-black p-1.5 text-right tabular-nums">
                      {totalActual.toFixed(3)}
                    </td>
                    <td className="border-r border-black p-1.5 text-right tabular-nums">
                      {totalCharge.toFixed(3)}
                    </td>
                    <td className="border-r border-black p-1.5" />
                    {showAmounts && (
                      <>
                        <td className="border-r border-black p-1.5" />
                        <td className="p-1.5" />
                      </>
                    )}
                  </tr>
                </tbody>
              </table>

              <div className="border-l-2 border-black">
                {showAmounts ? (
                  <table className="w-full border-collapse">
                    <tbody>
                      {charges
                        .filter(([label, val]) => label === "Freight" || val > 0)
                        .map(([label, val]) => (
                          <tr key={label} className="border-b border-dotted border-neutral-400">
                            <td className="p-1 pl-2">{label}</td>
                            <td className="p-1 pr-2 text-right tabular-nums">{formatMoney(val)}</td>
                          </tr>
                        ))}
                      <tr className="border-t border-black font-semibold">
                        <td className="p-1 pl-2">Total</td>
                        <td className="p-1 pr-2 text-right tabular-nums">
                          {formatMoney(Number(lr.total))}
                        </td>
                      </tr>
                      {gstRows.map(([label, val]) => (
                        <tr key={label}>
                          <td className="p-1 pl-2">{label}</td>
                          <td className="p-1 pr-2 text-right tabular-nums">{formatMoney(val)}</td>
                        </tr>
                      ))}
                      {Number(lr.advance) > 0 && (
                        <tr>
                          <td className="p-1 pl-2">Advance (−)</td>
                          <td className="p-1 pr-2 text-right tabular-nums">
                            {formatMoney(Number(lr.advance))}
                          </td>
                        </tr>
                      )}
                      <tr className="print-fill border-t-2 border-black bg-neutral-100 text-[12px] font-black">
                        <td className="p-1.5 pl-2">Grand Total</td>
                        <td className="p-1.5 pr-2 text-right tabular-nums">
                          {formatMoney(Number(lr.grandTotal))}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                ) : (
                  <div className="flex h-full items-center justify-center p-2">
                    <div className="rotate-[-8deg] border-2 border-black px-3 py-1 text-[13px] font-black tracking-widest">
                      TO BE BILLED
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ---- remarks + terms + signatures ---- */}
            {lr.remarks && (
              <div className="border-b border-black px-2.5 py-1">
                <span className="text-[8px] font-semibold uppercase tracking-wider text-neutral-500">
                  Remarks{" "}
                </span>
                {lr.remarks}
              </div>
            )}
            <div className="grid grid-cols-[1fr_auto_auto_auto] items-end gap-4 p-2.5">
              <div className="text-[8.5px] leading-snug text-neutral-700">
                <div className="mb-0.5 font-bold uppercase tracking-wider">Terms &amp; Conditions</div>
                <div>1. Goods are carried entirely at owner&apos;s risk.</div>
                <div>2. We are not responsible for leakage, breakage or damage in transit.</div>
                <div>
                  3. Subject to jurisdiction of {firm.jurisdiction || "local courts"} only.
                </div>
              </div>
              <div className="pt-7 text-center text-[10px]">
                <div className="border-t border-black px-4 pt-1">Consignor&apos;s Signature</div>
              </div>
              <div className="pt-7 text-center text-[10px]">
                <div className="border-t border-black px-4 pt-1">Driver&apos;s Signature</div>
              </div>
              <div className="text-center text-[10px]">
                <div className="mb-7 font-semibold">For {firm.name}</div>
                <div className="border-t border-black px-4 pt-1">Authorised Signatory</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
