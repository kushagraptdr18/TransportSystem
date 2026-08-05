/* eslint-disable @next/next/no-img-element */
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { formatDate, formatMoney } from "@/lib/utils";
import { firmImageUrl } from "@/lib/branding";
import { PrintToolbar } from "@/components/lr/print-toolbar";

export const dynamic = "force-dynamic";

/**
 * Lorry Receipt — the firm's standard print. Traditional bilty boxes on
 * landscape A4, tuned for readability: full-width masthead, larger bold type,
 * consignor/consignee in place of the old endorsement text, issuing-office
 * address in the right column at Truck-No level, city-only From/To and a
 * compact material band. One copy per sheet, five sheets.
 */
const COPIES = [
  "CONSIGNOR COPY",
  "CONSIGNEE COPY",
  "LORRY COPY",
  "ACCOUNT COPY",
  "FILE COPY",
] as const;

const RED = "#9f1218";

function Rule({ label, value, className = "" }: { label: string; value?: React.ReactNode; className?: string }) {
  return (
    <div className={`flex items-end gap-1 py-[2px] ${className}`}>
      <span className="shrink-0 font-bold">{label}</span>
      <span className="min-w-0 flex-1 break-words border-b border-neutral-500 px-1 font-bold leading-tight">
        {value ?? " "}
      </span>
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
    const [firm, sourceCity, destCity, consignor, consignee, vehicle] = await Promise.all([
      tx.firm.findUniqueOrThrow({ where: { id: session.firmId } }),
      tx.city.findUnique({ where: { id: lr.sourceCityId } }),
      tx.city.findUnique({ where: { id: lr.destCityId } }),
      tx.party.findUnique({ where: { id: lr.consignorId } }),
      tx.party.findUnique({ where: { id: lr.consigneeId } }),
      lr.vehicleId ? tx.vehicle.findUnique({ where: { id: lr.vehicleId } }) : Promise.resolve(null),
    ]);
    const destState = destCity?.stateId
      ? await tx.state.findUnique({ where: { id: destCity.stateId } })
      : null;
    return { lr, firm, sourceCity, destCity, destState, consignor, consignee, vehicle };
  });

  if (!data) notFound();
  const { lr, firm, sourceCity, destCity, destState, consignor, consignee, vehicle } = data;
  const logoUrl = firmImageUrl(firm, "logo");
  const showAmounts = lr.printFreight;

  const addr = (p: { address1?: string | null; address2?: string | null } | null) =>
    [p?.address1, p?.address2].filter(Boolean).join(", ");

  const totalQty = lr.items.reduce((s, i) => s + Number(i.qty), 0);
  const totalActual = lr.items.reduce((s, i) => s + Number(i.actualWt), 0);
  const totalCharge = lr.items.reduce((s, i) => s + Number(i.chargeWt), 0);
  const mainRate = lr.items.length ? Math.max(...lr.items.map((i) => Number(i.rate))) : 0;
  const riskCharges =
    Number(lr.biltyCharge) + Number(lr.collCharge) + Number(lr.cpc) + Number(lr.preBhada);

  const chargeRows: { label: string; rate?: number; amount: number | null }[] = [
    { label: "Frieght", rate: mainRate || undefined, amount: Number(lr.freight) },
    { label: "Mazdoor Char.", amount: Number(lr.hamali) },
    { label: "Risk Charges", amount: riskCharges },
    { label: "SGST", amount: Number(lr.sgstAmt) },
    { label: "CGST", amount: Number(lr.cgstAmt) },
    { label: "IGST", amount: Number(lr.igstAmt) },
    { label: "Any Other Char.", amount: Number(lr.otherCharge) },
  ];

  const liable =
    lr.lrType === "TO_PAY" ? "CONSIGNEE" : lr.lrType === "PAID" ? "CONSIGNOR" : "CONSIGNOR";

  return (
    <div className="min-h-screen bg-neutral-200 text-black print:bg-white">
      <style
        dangerouslySetInnerHTML={{
          __html: `
            .print-fill { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            @media print {
              .no-print { display: none !important; }
              body { background: #fff; }
              .lr-copy { page-break-after: always; box-shadow: none !important; margin: 0 !important; }
              .lr-copy:last-child { page-break-after: auto; }
            }
            @page { size: A4 landscape; margin: 5mm; }
          `,
        }}
      />
      <PrintToolbar
        note={`Prints ${COPIES.length} copies: ${COPIES.map((c) => c.replace(" COPY", "")).join(", ")}`}
      />

      <div className="mx-auto max-w-[287mm] space-y-6 p-4">
        {COPIES.map((copyLabel) => (
          <div
            key={copyLabel}
            className="lr-copy border-2 border-black bg-white p-1 text-[10px] leading-snug shadow-lg"
            style={{ color: "#111" }}
          >
            {/* ---- top band ---- */}
            <div className="pb-0.5 text-center text-[11px] font-black">
              All Subject to {firm.jurisdiction || "Local"} Jurisdiction
            </div>

            {/* ---- masthead: full width, big and bold ---- */}
            <div className="flex items-center gap-3 border-2 border-black p-1.5">
              <div className="flex w-[130px] shrink-0 flex-col items-center justify-center" style={{ color: RED }}>
                {logoUrl ? (
                  <img src={logoUrl} alt="" className="max-h-[74px] object-contain" />
                ) : (
                  <div className="border-4 px-2 py-1 text-[18px] font-black tracking-tight" style={{ borderColor: RED }}>
                    {firm.name
                      .split(/\s+/)
                      .map((w) => w[0])
                      .join(".")
                      .toUpperCase()}
                  </div>
                )}
                {firm.pan && <div className="mt-1 text-[10px] font-black">PAN No. : {firm.pan}</div>}
              </div>
              <div className="min-w-0 flex-1 text-center">
                <div className="text-[34px] font-black uppercase leading-none tracking-tight" style={{ color: RED }}>
                  {firm.name}
                </div>
                <div className="mt-0.5 text-[12px] font-bold italic">
                  Specialist Heavy &amp; O D C Consignment (Fleet Owners &amp; Total Transport Solution)
                </div>
                <div className="text-[11.5px] font-bold">
                  {[firm.address1, firm.address2].filter(Boolean).join(", ")}
                </div>
                <div className="text-[11.5px] font-bold">
                  {firm.mobile && <>Mob. : {firm.mobile}</>}
                  {firm.phone && <>, {firm.phone}</>}
                  {firm.email && <>, E-mail : {firm.email}</>}
                  {firm.gstin && <> · GSTIN : {firm.gstin}</>}
                </div>
              </div>
            </div>

            {(lr.lrType === "CANCELLED" || lr.lrType === "PAPER_CHANGE") && (
              <div className="print-fill my-0.5 py-0.5 text-center text-[12px] font-black tracking-[0.3em] text-white" style={{ background: RED }}>
                {lr.lrType === "CANCELLED" ? "CANCELLED LR" : "PAPER CHANGE LR"}
              </div>
            )}

            {/* ---- main body: four balanced columns ---- */}
            <div className="mt-1 flex items-stretch gap-1">
              {/* ------ column 1: demurrage / notice / consignor+consignee ------ */}
              <div className="flex w-[190px] shrink-0 flex-col gap-1">
                <div className="border border-black">
                  <div className="border-b border-black px-1 py-0.5 text-center text-[9px] font-black">
                    SCHEDULE OF DEMURRAGE CHARGES
                  </div>
                  <div className="space-y-1 p-1.5 text-[9px] font-semibold">
                    <div>Demurrage Chargeable after ________ days</div>
                    <div>from Today @ Rs. ________ Per Day per Qtl. on weight charged.</div>
                  </div>
                </div>
                <div className="border p-1.5 text-[7.8px] leading-snug" style={{ borderColor: RED, color: RED }}>
                  <div className="text-center text-[8.5px] font-black underline">NOTICE :</div>
                  The consignment covered by this Lorry receipt shall be stored at the destination
                  under the control of the Transport Operator and shall be delivered to or to the
                  order of the Consignee Bank whose name is mentioned in the Lorry Receipt. It will
                  under no circumstances be delivered to anyone without the written authority from
                  the Consignee Bank or its order, endorsed on the Consignee Copy.
                </div>
                {/* consignor + consignee take the old endorsement space */}
                <div className="flex-1 border border-black p-1.5 text-[10px]">
                  <div className="text-[9px] font-black underline">CONSIGNOR</div>
                  <div className="font-black uppercase" style={{ color: RED }}>
                    {consignor?.name}
                  </div>
                  <div className="font-semibold">{addr(consignor)}</div>
                  {consignor?.mobile && <div className="font-semibold">Mob.: {consignor.mobile}</div>}
                  {consignor?.gstin && <div className="font-semibold">GSTIN: {consignor.gstin}</div>}
                  <div className="mt-1.5 border-t border-black pt-1 text-[9px] font-black underline">
                    CONSIGNEE
                  </div>
                  <div className="font-black uppercase" style={{ color: RED }}>
                    {consignee?.name}
                  </div>
                  <div className="font-semibold">{addr(consignee)}</div>
                  {consignee?.mobile && <div className="font-semibold">Mob.: {consignee.mobile}</div>}
                  {consignee?.gstin && <div className="font-semibold">GSTIN: {consignee.gstin}</div>}
                </div>
              </div>

              {/* ------ column 2: copy label / insurance / consignee bank ------ */}
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="text-center text-[13px] font-black tracking-wide" style={{ color: RED }}>
                  {copyLabel}
                </div>
                <div className="border border-black">
                  <div className="border-b border-black py-0.5 text-center text-[10.5px] font-black">
                    AT CARRIER RISK
                  </div>
                  <div className="py-0.5 text-center text-[10px] font-black underline" style={{ color: RED }}>
                    INSURANCE
                  </div>
                  <div className="px-1.5 pb-1.5 text-[9.5px]">
                    <div className="font-semibold">The Customer has stated that :</div>
                    <div className="font-semibold">
                      He has not insured Consignment O/R he has insured Consignment Company
                      {lr.insCompany ? <b> : {lr.insCompany}</b> : ""}
                    </div>
                    <div className="mt-1 flex gap-2">
                      <Rule className="flex-1" label="Policy No. :" value={lr.insPolicyNo} />
                      <Rule className="w-[86px]" label="Date:" />
                    </div>
                    <div className="flex gap-2">
                      <Rule
                        className="flex-1"
                        label="Amount :"
                        value={lr.insAmount != null && showAmounts ? formatMoney(Number(lr.insAmount)) : undefined}
                      />
                      <Rule className="w-[86px]" label="Risk:" />
                    </div>
                  </div>
                </div>
                <div className="flex-1 border border-black p-1.5 text-[10px]">
                  <Rule label="Consignee's Bank Name and Address :" />
                  <Rule label="" />
                  <div className="mt-1 flex gap-2">
                    <Rule className="flex-1" label="Code Number :" />
                  </div>
                  <div className="mt-2 border-t border-black pt-1">
                    <Rule label="address of Delivery Office :" value={lr.deliveryAt || destCity?.name} />
                    <div className="flex gap-2">
                      <Rule className="flex-1" label="State :" value={destState?.name} />
                      <Rule className="w-[80px]" label="Tel.:" />
                    </div>
                  </div>
                </div>
              </div>

              {/* ------ column 3: caution / consignment note / from-to ------ */}
              <div className="flex w-[200px] shrink-0 flex-col gap-1">
                <div className="border border-black p-1.5 text-[8.5px] font-semibold leading-snug">
                  <div className="text-center text-[9px] font-black">Caution :</div>
                  This Consignment will not be detained, diverted, re-routed or re-booked without
                  Consignee Bank&apos;s written permission. Will be Delivered at the destination.
                </div>
                <div className="border border-black">
                  <div className="border-b border-black py-0.5 text-center text-[10px] font-black">
                    CONSIGNMENT NOTE :
                  </div>
                  <div className="p-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9.5px] font-black">No. :</span>
                      <span className="text-[20px] font-black tracking-wider" style={{ color: RED }}>
                        {lr.lrNo}
                      </span>
                    </div>
                    <Rule label="Date :" value={formatDate(lr.lrDate)} />
                  </div>
                </div>
                {/* city-only From / To */}
                <div className="flex-1 border border-black p-1.5 text-[11px]">
                  <Rule label="From :" value={<span className="uppercase">{sourceCity?.name}</span>} />
                  <div className="h-1" />
                  <Rule label="To :" value={<span className="uppercase">{destCity?.name}</span>} />
                  <div className="mt-2 border-t border-black pt-1 text-[9.5px]">
                    <Rule label="E-Way Bill No. :" value={lr.ewayBillNo} />
                    {lr.ewayExpiry && <Rule label="E-Way Bill Date :" value={formatDate(lr.ewayExpiry)} />}
                  </div>
                </div>
              </div>

              {/* ------ column 4: truck + issuing office (moved here) + invoice ------ */}
              <div className="flex w-[185px] shrink-0 flex-col gap-1">
                <div className="border border-black p-1.5 text-[10.5px]">
                  <Rule label="Truck No." value={<b className="text-[12px]">{vehicle?.number ?? lr.vehicleText}</b>} />
                </div>
                {/* issuing-office address, at Truck-No level per the layout spec */}
                <div className="border border-black p-1.5 text-[9px]">
                  <div className="font-black">Address of Issuing Office or Name and Address of Agent</div>
                  <div className="mt-0.5 font-bold uppercase">{firm.name}</div>
                  <div className="font-semibold">{[firm.address1, firm.address2].filter(Boolean).join(", ")}</div>
                  <div className="font-semibold">{firm.mobile && `Mob. : ${firm.mobile}`}</div>
                </div>
                <div className="border border-black p-1.5 text-[9.5px]">
                  <div className="font-black">Private Marks</div>
                  <div className="min-h-[14px] font-bold uppercase">{lr.privateMarka || " "}</div>
                  <div className="mt-0.5 font-black">Additional Information</div>
                  <div className="min-h-[14px] font-semibold">{lr.remarks || " "}</div>
                </div>
                <div className="flex-1 border border-black p-1.5 text-[9.5px]">
                  {/* stacked so long invoice numbers wrap inside the box */}
                  <div className="font-bold">Invoice No.:</div>
                  <div className="break-all border-b border-neutral-500 px-0.5 font-black">
                    {lr.invoiceNo || " "}
                  </div>
                  <Rule label="Licence No. of Transport Operator" />
                  <div className="mt-0.5 font-bold">GSTIN / UniqueID Reg. No.:</div>
                  <div className="break-all border-b border-neutral-500 px-0.5 font-black">
                    {firm.gstin || " "}
                  </div>
                  <div className="mt-1 font-black">Person Laiable to Pay</div>
                  {(["CONSIGNOR", "CONSIGNEE", "TRANSPORTER"] as const).map((who) => (
                    <div key={who} className="flex items-center gap-1.5 py-[1px]">
                      <span className="inline-flex h-[10px] w-[10px] items-center justify-center border border-black text-[8px] font-black leading-none">
                        {liable === who ? "✓" : ""}
                      </span>
                      <span className="font-semibold capitalize">{who.toLowerCase()}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ---- compact material + charges band ---- */}
            <div className="mt-1 flex items-stretch gap-1">
              <div className="min-w-0 flex-1 border border-black">
                <table className="w-full border-collapse text-[9.5px]">
                  <thead>
                    <tr className="text-center font-black">
                      <th className="w-[62px] border-b border-r border-black py-0.5">Package</th>
                      <th className="border-b border-r border-black py-0.5">Description (Said to Contain)</th>
                      <th className="w-[120px] border-b border-black p-0">
                        <div className="border-b border-black py-0.5">Weight</div>
                        <div className="flex text-[8.5px]">
                          <div className="flex-1 border-r border-black">Actual</div>
                          <div className="flex-1">Charged</div>
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {lr.items.map((item) => (
                      <tr key={item.id} className="align-top">
                        <td className="border-r border-black px-1 py-0.5 text-center font-bold tabular-nums">
                          {Number(item.qty).toFixed(0)}
                        </td>
                        <td className="border-r border-black px-1 py-0.5 font-bold uppercase">
                          {item.productName}
                          {item.description ? ` — ${item.description}` : ""}
                        </td>
                        <td className="p-0">
                          <div className="flex font-semibold">
                            <div className="flex-1 border-r border-black px-1 py-0.5 text-right tabular-nums">
                              {Number(item.actualWt).toFixed(3)}
                            </div>
                            <div className="flex-1 px-1 py-0.5 text-right tabular-nums">
                              {Number(item.chargeWt).toFixed(3)}
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                    <tr className="font-black">
                      <td className="border-r border-t border-black px-1 py-0.5 text-center tabular-nums">
                        {totalQty.toFixed(0)}
                      </td>
                      <td className="border-r border-t border-black px-1 py-0.5">
                        <div
                          className="mx-auto w-fit rotate-[-3deg] text-center text-[8px] font-black leading-tight"
                          style={{ color: RED }}
                        >
                          * GOODS DESCRIBED AS ABOVE &amp; RECEIVED IN GOOD ORDER &amp; CONDITION ·
                          CONTENTS NOT CHECKED · PLEASE TAKE DELIVERY FROM THE RISK *
                        </div>
                      </td>
                      <td className="border-t border-black p-0">
                        <div className="flex">
                          <div className="flex-1 border-r border-black px-1 py-0.5 text-right tabular-nums">
                            {totalActual.toFixed(3)}
                          </div>
                          <div className="flex-1 px-1 py-0.5 text-right tabular-nums">
                            {totalCharge.toFixed(3)}
                          </div>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="w-[260px] shrink-0 border border-black">
                <table className="w-full border-collapse text-[9.5px]">
                  <thead>
                    <tr className="text-center font-black">
                      <th className="border-b border-r border-black py-0.5 text-left pl-1">Particulars</th>
                      <th className="w-[44px] border-b border-r border-black py-0.5">Rate</th>
                      <th className="w-[92px] border-b border-black py-0.5">
                        Amount to Pay / Paid <span className="font-black">Rs.</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {chargeRows.map((row) => (
                      <tr key={row.label} className="border-b border-neutral-400">
                        <td className="border-r border-black px-1 py-[2px] font-bold">{row.label}</td>
                        <td className="border-r border-black px-1 py-[2px] text-right font-semibold tabular-nums">
                          {showAmounts && row.rate ? row.rate.toFixed(2) : ""}
                        </td>
                        <td className="px-1 py-[2px] text-right font-semibold tabular-nums">
                          {showAmounts && row.amount ? formatMoney(row.amount) : ""}
                        </td>
                      </tr>
                    ))}
                    {showAmounts && Number(lr.advance) > 0 && (
                      <tr className="border-b border-neutral-400">
                        <td className="border-r border-black px-1 py-[2px] font-bold">Less : Advance</td>
                        <td className="border-r border-black px-1 py-[2px]" />
                        <td className="px-1 py-[2px] text-right font-semibold tabular-nums">
                          −{formatMoney(Number(lr.advance))}
                        </td>
                      </tr>
                    )}
                    <tr className="border-t border-black text-[11px] font-black">
                      <td className="border-r border-black px-1 py-1">TOTAL</td>
                      <td className="border-r border-black px-1 py-1" />
                      <td className="px-1 py-1 text-right tabular-nums">
                        {showAmounts ? formatMoney(Number(lr.grandTotal)) : ""}
                      </td>
                    </tr>
                    {!showAmounts && (
                      <tr>
                        <td colSpan={3} className="p-2 text-center">
                          <span
                            className="inline-block rotate-[-6deg] border-2 px-2 py-0.5 text-[11px] font-black tracking-widest"
                            style={{ borderColor: RED, color: RED }}
                          >
                            TO BE BILLED
                          </span>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ---- footer ---- */}
            <div className="mt-1 flex items-end gap-3 border border-black p-1.5 text-[10.5px]">
              <div className="flex items-end gap-1 font-black">
                Value
                <span className="inline-block w-[140px] border-b border-black px-1 text-right font-black tabular-nums">
                  {lr.goodsValue != null && showAmounts ? formatMoney(Number(lr.goodsValue)) : " "}
                </span>
              </div>
              <div className="flex flex-1 items-end justify-center gap-1 font-black">
                Signature of Transport Operator
                <span className="inline-block w-[170px] border-b border-black">{" "}</span>
              </div>
              <div className="pr-2 text-right text-[9px]">
                For <b style={{ color: RED }}>{firm.name.toUpperCase()}</b>
                <div className="mt-5 border-t border-black px-2 pt-0.5 font-black">Authorised Signatory</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
