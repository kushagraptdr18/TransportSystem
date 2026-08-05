/* eslint-disable @next/next/no-img-element */
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { formatDate, formatMoney } from "@/lib/utils";
import { firmImageUrl } from "@/lib/branding";
import { PrintToolbar } from "@/components/lr/print-toolbar";

export const dynamic = "force-dynamic";

/**
 * Lorry Receipt printed to match the firm's traditional pre-printed bilty
 * form exactly (box for box): landscape A4, one copy per sheet, five sheets.
 * Fields the software knows are filled in; the rest stay as blank rules the
 * way the paper form leaves them for hand-filling.
 */
const COPIES = [
  "CONSIGNOR COPY",
  "CONSIGNEE COPY",
  "LORRY COPY",
  "ACCOUNT COPY",
  "FILE COPY",
] as const;

const RED = "#9f1218";

/** label with a fill-in rule; value sits on the rule when known */
function Rule({ label, value, className = "" }: { label: string; value?: React.ReactNode; className?: string }) {
  return (
    <div className={`flex items-end gap-1 py-[2px] ${className}`}>
      <span className="shrink-0">{label}</span>
      <span className="min-w-0 flex-1 border-b border-neutral-500 px-1 font-bold leading-tight">
        {value ?? " "}
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
    const [firm, destCity, consignor, consignee, vehicle] = await Promise.all([
      tx.firm.findUniqueOrThrow({ where: { id: session.firmId } }),
      tx.city.findUnique({ where: { id: lr.destCityId } }),
      tx.party.findUnique({ where: { id: lr.consignorId } }),
      tx.party.findUnique({ where: { id: lr.consigneeId } }),
      lr.vehicleId ? tx.vehicle.findUnique({ where: { id: lr.vehicleId } }) : Promise.resolve(null),
    ]);
    const destState = destCity?.stateId
      ? await tx.state.findUnique({ where: { id: destCity.stateId } })
      : null;
    return { lr, firm, destCity, destState, consignor, consignee, vehicle };
  });

  if (!data) notFound();
  const { lr, firm, destCity, destState, consignor, consignee, vehicle } = data;
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

  // exact charge rows of the printed form, in its order
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
            className="lr-copy border-2 border-black bg-white p-1 text-[9px] leading-tight shadow-lg"
            style={{ color: "#111" }}
          >
            {/* ---- top band ---- */}
            <div className="pb-0.5 text-center text-[9.5px] font-black">
              All Subject to {firm.jurisdiction || "Local"} Jurisdiction
            </div>

            {/* ---- masthead ---- */}
            <div className="flex items-stretch gap-2 border-2 border-black p-1">
              <div className="flex w-[110px] shrink-0 flex-col items-center justify-center" style={{ color: RED }}>
                {logoUrl ? (
                  <img src={logoUrl} alt="" className="max-h-[62px] object-contain" />
                ) : (
                  <div className="border-4 px-1.5 py-0.5 text-[16px] font-black tracking-tight" style={{ borderColor: RED }}>
                    {firm.name
                      .split(/\s+/)
                      .map((w) => w[0])
                      .join(".")
                      .toUpperCase()}
                  </div>
                )}
                {firm.pan && (
                  <div className="mt-1 text-[9px] font-black">PAN No. : {firm.pan}</div>
                )}
              </div>
              <div className="min-w-0 flex-1 text-center">
                <div className="text-[26px] font-black uppercase leading-none tracking-tight" style={{ color: RED }}>
                  {firm.name}
                </div>
                <div className="text-[10px] font-bold italic">
                  Specialist Heavy &amp; O D C Consignment (Fleet Owners &amp; Total Transport Solution)
                </div>
                <div className="text-[9.5px]">{[firm.address1, firm.address2].filter(Boolean).join(", ")}</div>
                <div className="text-[9.5px]">
                  {firm.mobile && <>Mob. : {firm.mobile}</>}
                  {firm.phone && <>, {firm.phone}</>}
                  {firm.email && <>, E-mail : {firm.email}</>}
                </div>
              </div>
              <div className="w-[135px] shrink-0 border-l border-black pl-1.5 text-[8.5px]">
                <div className="font-bold">Address of Issuing Office or Name and Address of Agent</div>
                <div className="mt-0.5 uppercase">{firm.name}</div>
                <div>{[firm.address1, firm.address2].filter(Boolean).join(", ")}</div>
                <div>{firm.mobile && `Mob. : ${firm.mobile}`}</div>
              </div>
            </div>

            {(lr.lrType === "CANCELLED" || lr.lrType === "PAPER_CHANGE") && (
              <div className="print-fill my-0.5 py-0.5 text-center text-[11px] font-black tracking-[0.3em] text-white" style={{ background: RED }}>
                {lr.lrType === "CANCELLED" ? "CANCELLED LR" : "PAPER CHANGE LR"}
              </div>
            )}

            {/* ---- main body: four columns exactly like the form ---- */}
            <div className="mt-1 flex items-stretch gap-1">
              {/* ------ column 1: demurrage / notice / endorsement ------ */}
              <div className="flex w-[172px] shrink-0 flex-col gap-1">
                <div className="border border-black">
                  <div className="border-b border-black px-1 py-0.5 text-center text-[8.5px] font-black">
                    SCHEDULE OF DEMURRAGE CHARGES
                  </div>
                  <div className="space-y-1.5 p-1.5 text-[8.5px]">
                    <div>Demurrage Chargeable after ________</div>
                    <div>days from Today @ Rs. ____________</div>
                    <div>Per Day per Qtl. on weight charged.</div>
                  </div>
                </div>
                <div className="flex-1 border p-1.5 text-[7.4px] leading-snug" style={{ borderColor: RED, color: RED }}>
                  <div className="text-center text-[8.5px] font-black underline">NOTICE :</div>
                  The consignment covered by this Lorry receipt shall be stored at the destination
                  under the control of the Transport Operator and shall be delivered to or to the
                  order of the Consignee Bank whose name is mentioned in the Lorry Receipt. It will
                  under no circumstances be delivered to anyone without the written authority from
                  the Consignee Bank or its order, endorsed on the Consignee Copy.
                </div>
                <div className="border border-black p-1.5 text-center text-[7.4px] leading-snug">
                  <div className="text-[8px] font-black underline">ENDORSEMENT</div>
                  It is intended to use the CONSIGNEE COPY of this set for the purpose of borrowing
                  from the Consignee Bank.
                </div>
              </div>

              {/* ------ column 2: copy label / insurance / consignor / consignee bank ------ */}
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="text-center text-[11px] font-black tracking-wide" style={{ color: RED }}>
                  {copyLabel}
                </div>
                <div className="border border-black">
                  <div className="border-b border-black py-0.5 text-center text-[9.5px] font-black">
                    AT CARRIER RISK
                  </div>
                  <div className="py-0.5 text-center text-[9px] font-black underline" style={{ color: RED }}>
                    INSURANCE
                  </div>
                  <div className="px-1.5 pb-1.5 text-[8.5px]">
                    <div>The Customer has stated that :</div>
                    <div>
                      He has not insured Consignment O/R he has insured Consignment Company
                      {lr.insCompany ? <b> : {lr.insCompany}</b> : ""}
                    </div>
                    <div className="mt-1 flex gap-2">
                      <Rule className="flex-1" label="Policy No. :" value={lr.insPolicyNo} />
                      <Rule className="w-[90px]" label="Date:" />
                    </div>
                    <div className="flex gap-2">
                      <Rule
                        className="flex-1"
                        label="Amount :"
                        value={lr.insAmount != null && showAmounts ? formatMoney(Number(lr.insAmount)) : undefined}
                      />
                      <Rule className="w-[90px]" label="Risk:" />
                    </div>
                    <Rule label="Code Number :" />
                  </div>
                </div>
                <div className="flex-1 border border-black p-1.5 text-[9px]">
                  <Rule label="Consignor's Name and address" value={consignor?.name} />
                  <Rule label="" value={addr(consignor) || undefined} />
                  <div className="h-2" />
                  <Rule label="Consignee's Bank Name and Address" value={consignee?.name} />
                  <Rule label="" value={addr(consignee) || undefined} />
                </div>
              </div>

              {/* ------ column 3: caution / delivery office / consignment note / from-to ------ */}
              <div className="flex w-[200px] shrink-0 flex-col gap-1">
                <div className="border border-black p-1.5 text-[8px] leading-snug">
                  <div className="text-center text-[8.5px] font-black">Caution :</div>
                  This Consignment will not be detained, diverted, re-routed or re-booked without
                  Consignee Bank&apos;s written permission. Will be Delivered at the destination :
                </div>
                <div className="border border-black p-1.5 text-[8.5px]">
                  <Rule label="address of Delivery Office :" value={lr.deliveryAt || destCity?.name} />
                  <div className="flex gap-2">
                    <Rule className="flex-1" label="State :" value={destState?.name} />
                    <Rule className="w-[70px]" label="Tel.:" />
                  </div>
                </div>
                <div className="border border-black">
                  <div className="border-b border-black py-0.5 text-center text-[9px] font-black">
                    CONSIGNMENT NOTE :
                  </div>
                  <div className="p-1.5">
                    <div className="flex items-center gap-1">
                      <span className="text-[8.5px] font-bold">No. :</span>
                      <span className="text-[16px] font-black tracking-wider" style={{ color: RED }}>
                        {lr.lrNo}
                      </span>
                    </div>
                    <Rule label="Date :" value={formatDate(lr.lrDate)} />
                  </div>
                </div>
                <div className="flex-1 border border-black p-1.5 text-[8.5px]">
                  <Rule label="From :" value={consignor?.name} />
                  <div className="h-1.5" />
                  <Rule label="To :" value={consignee?.name} />
                </div>
              </div>

              {/* ------ column 4: truck / marks / invoice column ------ */}
              <div className="flex w-[168px] shrink-0 flex-col gap-1">
                <div className="border border-black p-1.5 text-[8.5px]">
                  <Rule label="Truck No." value={<b>{vehicle?.number ?? lr.vehicleText}</b>} />
                </div>
                <div className="border border-black p-1.5 text-[8.5px]">
                  <div className="font-black">Additional Information</div>
                  <div className="min-h-[18px]">{lr.remarks || " "}</div>
                  <div className="mt-1 font-black">Private Marks</div>
                  <div className="min-h-[18px] font-semibold uppercase">{lr.privateMarka || " "}</div>
                </div>
                <div className="flex-1 border border-black p-1.5 text-[8.5px]">
                  <Rule label="Invoice No.:" value={lr.invoiceNo} />
                  <Rule label="Licence No. of Transport Operator" />
                  <Rule label="GSTIN / UniqueID Reg. No. of" value={firm.gstin} />
                  <div className="mt-0.5 font-bold">Person Laiable to Pay</div>
                  {(["CONSIGNOR", "CONSIGNEE", "TRANSPORTER"] as const).map((who) => (
                    <div key={who} className="flex items-center gap-1.5 py-[1px]">
                      <span className="inline-flex h-[9px] w-[9px] items-center justify-center border border-black text-[7.5px] font-black leading-none">
                        {liable === who ? "✓" : ""}
                      </span>
                      <span className="capitalize">{who.toLowerCase()} :</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ---- package + charges band ---- */}
            <div className="mt-1 flex items-stretch gap-1">
              {/* package table */}
              <div className="min-w-0 flex-1 border border-black">
                <table className="w-full border-collapse text-[8.5px]">
                  <thead>
                    <tr className="text-center">
                      <th className="w-[64px] border-b border-r border-black p-1">Package</th>
                      <th className="border-b border-r border-black p-1">
                        Description
                        <br />
                        (Said to Contain)
                      </th>
                      <th className="w-[110px] border-b border-black p-0">
                        <div className="border-b border-black p-0.5">Weight</div>
                        <div className="flex">
                          <div className="flex-1 border-r border-black py-0.5">Actual</div>
                          <div className="flex-1 py-0.5">Charged</div>
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {lr.items.map((item) => (
                      <tr key={item.id} className="align-top">
                        <td className="border-r border-black p-1 text-center tabular-nums">
                          {Number(item.qty).toFixed(0)}
                        </td>
                        <td className="border-r border-black p-1 font-semibold uppercase">
                          {item.productName}
                          {item.description ? ` — ${item.description}` : ""}
                        </td>
                        <td className="p-0">
                          <div className="flex">
                            <div className="flex-1 border-r border-black p-1 text-right tabular-nums">
                              {Number(item.actualWt).toFixed(3)}
                            </div>
                            <div className="flex-1 p-1 text-right tabular-nums">
                              {Number(item.chargeWt).toFixed(3)}
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                    <tr className="font-black">
                      <td className="border-r border-t border-black p-1 text-center tabular-nums">
                        {totalQty.toFixed(0)}
                      </td>
                      <td className="relative border-r border-t border-black p-1">
                        <div
                          className="mx-auto w-fit rotate-[-5deg] text-center text-[8px] font-black leading-snug"
                          style={{ color: RED }}
                        >
                          * GOODS DESCRIBED AS ABOVE &amp; RECEIVED IN GOOD ORDER &amp; CONDITION
                          <br />
                          CONTENTS NOT CHECKED · PLEASE TAKE DELIVERY FROM THE RISK *
                        </div>
                      </td>
                      <td className="border-t border-black p-0">
                        <div className="flex">
                          <div className="flex-1 border-r border-black p-1 text-right tabular-nums">
                            {totalActual.toFixed(3)}
                          </div>
                          <div className="flex-1 p-1 text-right tabular-nums">
                            {totalCharge.toFixed(3)}
                          </div>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* charges table — exact rows of the form */}
              <div className="w-[250px] shrink-0 border border-black">
                <table className="w-full border-collapse text-[8.5px]">
                  <thead>
                    <tr className="text-center">
                      <th className="border-b border-r border-black p-1 text-left" colSpan={1}></th>
                      <th className="w-[40px] border-b border-r border-black p-1">Rate</th>
                      <th className="w-[86px] border-b border-black p-1">
                        Amount to Pay / Paid
                        <div className="border-t border-black font-bold">Rs.</div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {chargeRows.map((row) => (
                      <tr key={row.label} className="border-b border-neutral-400">
                        <td className="border-r border-black px-1 py-[2.5px]">{row.label}</td>
                        <td className="border-r border-black px-1 py-[2.5px] text-right tabular-nums">
                          {showAmounts && row.rate ? row.rate.toFixed(2) : ""}
                        </td>
                        <td className="px-1 py-[2.5px] text-right tabular-nums">
                          {showAmounts && row.amount ? formatMoney(row.amount) : ""}
                        </td>
                      </tr>
                    ))}
                    {showAmounts && Number(lr.advance) > 0 && (
                      <tr className="border-b border-neutral-400">
                        <td className="border-r border-black px-1 py-[2.5px]">Less : Advance</td>
                        <td className="border-r border-black px-1 py-[2.5px]" />
                        <td className="px-1 py-[2.5px] text-right tabular-nums">
                          −{formatMoney(Number(lr.advance))}
                        </td>
                      </tr>
                    )}
                    <tr className="border-t border-black font-black">
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
                            className="inline-block rotate-[-6deg] border-2 px-2 py-0.5 text-[10px] font-black tracking-widest"
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

              {/* right: private marks strip like the form */}
              <div className="flex w-[120px] shrink-0 flex-col border border-black p-1.5 text-[8.5px]">
                <div className="font-black">Private Marks</div>
                <div className="min-h-[24px] font-semibold uppercase">{lr.privateMarka || " "}</div>
                <div className="mt-auto border-t border-black pt-1 text-[8px]">
                  E-Way Bill : <b>{lr.ewayBillNo || " "}</b>
                  {lr.ewayExpiry && <div>Dt: {formatDate(lr.ewayExpiry)}</div>}
                </div>
              </div>
            </div>

            {/* ---- footer ---- */}
            <div className="mt-1 flex items-end gap-2 border border-black p-1.5 text-[9.5px]">
              <div className="flex items-end gap-1 font-black">
                Value
                <span className="inline-block w-[130px] border-b border-black px-1 text-right font-black tabular-nums">
                  {lr.goodsValue != null && showAmounts ? formatMoney(Number(lr.goodsValue)) : " "}
                </span>
              </div>
              <div className="flex flex-1 items-end justify-center gap-1 font-black">
                Signature of Transport Operator
                <span className="inline-block w-[180px] border-b border-black">{" "}</span>
              </div>
              <div className="pr-2 text-right text-[8px]">
                For <b style={{ color: RED }}>{firm.name.toUpperCase()}</b>
                <div className="mt-4 border-t border-black px-2 pt-0.5 font-bold">Authorised Signatory</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
