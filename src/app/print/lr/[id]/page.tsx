/* eslint-disable @next/next/no-img-element */
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { formatDate, formatMoney } from "@/lib/utils";
import { firmImageUrl } from "@/lib/branding";
import { PrintToolbar } from "@/components/lr/print-toolbar";

export const dynamic = "force-dynamic";

/**
 * Lorry Receipt in the classic bilty format (SSBRL style): red-accent boxed
 * layout on landscape A4, one copy per sheet, five sheets in separation order.
 */
const COPIES = [
  "CONSIGNOR COPY",
  "CONSIGNEE COPY",
  "LORRY COPY",
  "ACCOUNT COPY",
  "FILE COPY",
] as const;

const RED = "#9f1218";

function Box({
  title,
  children,
  className = "",
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`border border-black ${className}`}>
      {title && (
        <div className="border-b border-black px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wide">
          {title}
        </div>
      )}
      {children}
    </div>
  );
}

function Line({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="flex gap-1 border-b border-dotted border-neutral-400 py-[1.5px] last:border-0">
      <span className="shrink-0 font-bold">{label}</span>
      <span className="min-w-0 flex-1">{value ?? ""}</span>
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
    // driver assigned to the vehicle on the LR date, for the truck box
    let driver: { name: string; mobile: string | null } | null = null;
    if (lr.vehicleId) {
      const assignment = await tx.driverAssignment.findFirst({
        where: {
          vehicleId: lr.vehicleId,
          fromDate: { lte: lr.lrDate },
          OR: [{ toDate: null }, { toDate: { gte: lr.lrDate } }],
        },
        orderBy: { fromDate: "desc" },
      });
      if (assignment) {
        const d = await tx.driver.findFirst({ where: { id: assignment.driverId } });
        if (d) driver = { name: d.name, mobile: d.mobile };
      }
    }
    const destState = destCity?.stateId
      ? await tx.state.findUnique({ where: { id: destCity.stateId } })
      : null;
    return { lr, firm, sourceCity, destCity, destState, consignor, consignee, billTo, vehicle, driver };
  });

  if (!data) notFound();
  const { lr, firm, destCity, destState, consignor, consignee, billTo, vehicle, driver } = data;
  const logoUrl = firmImageUrl(firm, "logo");
  const showAmounts = lr.printFreight;

  const addr = (p: { address1?: string | null; address2?: string | null } | null) =>
    [p?.address1, p?.address2].filter(Boolean).join(", ");

  const totalQty = lr.items.reduce((s, i) => s + Number(i.qty), 0);
  const totalActual = lr.items.reduce((s, i) => s + Number(i.actualWt), 0);
  const totalCharge = lr.items.reduce((s, i) => s + Number(i.chargeWt), 0);
  const mainRate = lr.items.length ? Math.max(...lr.items.map((i) => Number(i.rate))) : 0;

  const charges: [string, number, number | null][] = [
    ["Freight", Number(lr.freight), mainRate],
    ["Hamali / Mazdoor Charge", Number(lr.hamali), null],
    ["Pre Bhada", Number(lr.preBhada), null],
    ["Bilty Charge", Number(lr.biltyCharge), null],
    ["Collection Charge", Number(lr.collCharge), null],
    ["CPC", Number(lr.cpc), null],
    ["Any Other Charges", Number(lr.otherCharge), null],
  ];
  const gstRows: [string, number][] = [
    [`CGST${Number(lr.cgstAmt) > 0 ? "" : ""}`, Number(lr.cgstAmt)],
    ["SGST", Number(lr.sgstAmt)],
    ["IGST", Number(lr.igstAmt)],
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
            @page { size: A4 landscape; margin: 6mm; }
          `,
        }}
      />
      <PrintToolbar
        note={`Prints ${COPIES.length} copies: ${COPIES.map((c) => c.replace(" COPY", "")).join(", ")}`}
      />

      <div className="mx-auto max-w-[285mm] space-y-6 p-4">
        {COPIES.map((copyLabel) => (
          <div
            key={copyLabel}
            className="lr-copy border-2 border-black bg-white p-1 text-[9.5px] leading-tight shadow-lg"
            style={{ color: "#111" }}
          >
            {/* ================= HEADER ================= */}
            <div className="flex items-stretch border-2 border-black">
              {/* logo */}
              <div
                className="flex w-[120px] shrink-0 flex-col items-center justify-center border-r-2 border-black p-1"
                style={{ color: RED }}
              >
                {logoUrl ? (
                  <img src={logoUrl} alt="" className="max-h-[70px] object-contain" />
                ) : (
                  <div className="border-4 px-2 py-1 text-[20px] font-black" style={{ borderColor: RED }}>
                    {firm.name
                      .split(/\s+/)
                      .map((w) => w[0])
                      .join("")
                      .slice(0, 5)
                      .toUpperCase()}
                  </div>
                )}
              </div>
              {/* firm name */}
              <div className="min-w-0 flex-1 px-2 py-1">
                <div className="text-[24px] font-black uppercase leading-none tracking-tight" style={{ color: RED }}>
                  {firm.name}
                </div>
                <div className="text-[9.5px] font-bold">
                  Specialist Heavy &amp; O.D.C. Consignment (Fleet Owners &amp; Transport Solution)
                </div>
                <div className="text-[9.5px]">{[firm.address1, firm.address2].filter(Boolean).join(", ")}</div>
                <div className="text-[9.5px]">
                  {firm.mobile && <>Mob.: {firm.mobile} </>}
                  {firm.phone && <>Ph.: {firm.phone}</>}
                </div>
                <div className="text-[9.5px]">{firm.email && <>E-mail: {firm.email}</>}</div>
              </div>
              {/* PAN */}
              <div className="flex w-[150px] shrink-0 flex-col justify-center border-l border-black px-2">
                {firm.pan && (
                  <div className="text-[10px] font-black" style={{ color: RED }}>
                    PAN No.: {firm.pan}
                  </div>
                )}
                {firm.gstin && (
                  <div className="mt-1 text-[9px] font-bold">GSTIN: {firm.gstin}</div>
                )}
                <div className="print-fill mt-1 self-start px-1.5 py-0.5 text-[8px] font-black text-white" style={{ background: RED }}>
                  {copyLabel}
                </div>
              </div>
              {/* LR no / date */}
              <div className="w-[105px] shrink-0 border-l-2 border-black text-center">
                <div className="border-b border-black px-1 py-0.5 text-[9px] font-bold">LR No.:</div>
                <div className="py-1 text-[20px] font-black" style={{ color: RED }}>
                  {lr.lrNo}
                </div>
              </div>
              <div className="w-[105px] shrink-0 border-l border-black text-center">
                <div className="border-b border-black px-1 py-0.5 text-[9px] font-bold">LR Date:</div>
                <div className="py-2 text-[11px] font-black">{formatDate(lr.lrDate)}</div>
              </div>
            </div>
            <div className="border-x-2 border-b-2 border-black px-2 py-0.5 text-right text-[9.5px] font-black">
              All Subject to {firm.jurisdiction || "Local"} Jurisdiction
            </div>

            {(lr.lrType === "CANCELLED" || lr.lrType === "PAPER_CHANGE") && (
              <div className="print-fill mt-1 py-0.5 text-center text-[12px] font-black tracking-[0.3em] text-white" style={{ background: RED }}>
                {lr.lrType === "CANCELLED" ? "CANCELLED LR" : "PAPER CHANGE LR"}
              </div>
            )}

            {/* ================= ROW 2: demurrage / terms / parties / insurance / consignment note ================= */}
            <div className="mt-1 flex items-stretch gap-1">
              <Box title="Schedule of Demurrage Charges" className="w-[170px] shrink-0">
                <div className="space-y-2 p-1.5 text-[8.5px]">
                  <div>Demurrage Charges after ________</div>
                  <div>days from Today @ Rs. ________</div>
                  <div>Per Day per Call on weight charged.</div>
                </div>
              </Box>
              <div
                className="w-[190px] shrink-0 border p-1.5 text-[7.6px] leading-snug"
                style={{ borderColor: RED, color: RED }}
              >
                The consignment covered by this Lorry receipt is accepted the subject to the
                conditions overleaf of this receipt. Operator and his employees will not be
                responsible for any loss or damage or delay to the consignment covered by this
                receipt howsoever arising out of theft, pilferage, fire, accident, riots, strikes
                or from inspection order and all other circumstances beyond their control. All
                claims and/or disputes are subject to {firm.jurisdiction || "local"} Jurisdiction
                only. Goods once booked will not be delivered to anyone without the endorsed
                order, endorsed on the Consignee Copy.
              </div>
              {/* consignor / consignee */}
              <div className="min-w-0 flex-1 border border-black p-1.5">
                <Line label="Consignor's Name and address :" value={consignor?.name} />
                <Line label="" value={addr(consignor)} />
                {consignor?.gstin && <Line label="GSTIN :" value={consignor.gstin} />}
                <div className="h-1.5" />
                <Line label="Consignee's Name and Address :" value={consignee?.name} />
                <Line label="" value={addr(consignee)} />
                {consignee?.gstin && <Line label="GSTIN :" value={consignee.gstin} />}
              </div>
              {/* insurance */}
              <Box className="w-[185px] shrink-0">
                <div className="p-1.5">
                  <div className="text-center text-[10px] font-black underline">AT CARRIER RISK</div>
                  <div className="text-center text-[9px] font-black underline" style={{ color: RED }}>
                    INSURANCE
                  </div>
                  <div className="mt-1 font-bold">The Customer declared that :</div>
                  <div>
                    He has not insured Consignment OR Insured with{" "}
                    {lr.insCompany ? <b>{lr.insCompany}</b> : "our Insurance Company"}
                  </div>
                  <div className="mt-1.5">
                    Policy No.: {lr.insPolicyNo || "__________"} &nbsp; Amount:{" "}
                    {lr.insAmount != null ? formatMoney(Number(lr.insAmount)) : "________"}
                  </div>
                  <div className="mt-1">Date : __________ &nbsp; Code Number : ________</div>
                </div>
              </Box>
              {/* consignment note */}
              <Box className="w-[185px] shrink-0">
                <div className="border-b border-black px-1.5 py-0.5 text-center text-[9px] font-black">
                  CONSIGNMENT NOTE
                </div>
                <div className="p-1.5">
                  <Line
                    label="No. :"
                    value={<span className="text-[13px] font-black" style={{ color: RED }}>{lr.lrNo}</span>}
                  />
                  <Line label="Date :" value={formatDate(lr.lrDate)} />
                  <Line label="State :" value={destState?.name} />
                  <Line label="Address of Delivery Office :" value={lr.deliveryAt || destCity?.name} />
                  <Line label="Tel. :" value="" />
                </div>
              </Box>
            </div>

            {/* ================= ROW 3: packages / charges / truck ================= */}
            <div className="mt-1 flex items-stretch gap-1">
              {/* package table */}
              <div className="min-w-0 flex-1 border border-black">
                <table className="w-full border-collapse text-[9px]">
                  <thead>
                    <tr className="border-b border-black text-left">
                      <th className="w-[70px] border-r border-black p-1 text-center">
                        Package
                        <div className="border-t border-black text-[8px] font-bold">NO. OF PKGS.</div>
                      </th>
                      <th className="border-r border-black p-1 text-center">
                        Description (Said to Contain)
                        <div className="border-t border-black text-[8px] font-bold">GOODS DESCRIPTION</div>
                      </th>
                      <th className="w-[120px] p-0 text-center">
                        <div className="border-b border-black p-0.5">Weight</div>
                        <div className="flex">
                          <div className="flex-1 border-r border-black text-[8px] font-bold">Actual</div>
                          <div className="flex-1 text-[8px] font-bold">Charged</div>
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
                    <tr>
                      <td className="border-r border-t border-black p-1 text-center font-black tabular-nums">
                        {totalQty.toFixed(0)}
                      </td>
                      <td className="relative border-r border-t border-black p-1">
                        {/* rubber-stamp note */}
                        <div
                          className="mx-auto my-1 w-fit rotate-[-6deg] text-center text-[8.5px] font-black leading-snug"
                          style={{ color: RED }}
                        >
                          * GOODS DESCRIBED
                          <br />
                          AS ABOVE &amp; RECEIVED IN
                          <br />
                          GOOD ORDER &amp; CONDITION
                          <br />
                          CONTENTS NOT CHECKED
                          <br />
                          PLEASE TAKE DELIVERY
                          <br />
                          FROM THE RISK *
                        </div>
                      </td>
                      <td className="border-t border-black p-0">
                        <div className="flex font-black">
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

              {/* charges table */}
              <div className="w-[240px] shrink-0 border border-black">
                <table className="w-full border-collapse text-[9px]">
                  <thead>
                    <tr className="border-b border-black">
                      <th className="border-r border-black p-1 text-left">Particulars</th>
                      <th className="w-[42px] border-r border-black p-1 text-right">Rate</th>
                      <th className="w-[72px] p-1 text-right">Amount (Rs.)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {showAmounts ? (
                      <>
                        {charges
                          .filter(([label, v]) => label === "Freight" || v > 0)
                          .map(([label, v, rate]) => (
                            <tr key={label} className="border-b border-dotted border-neutral-400">
                              <td className="border-r border-black p-1">{label}</td>
                              <td className="border-r border-black p-1 text-right tabular-nums">
                                {rate ? rate.toFixed(2) : ""}
                              </td>
                              <td className="p-1 text-right tabular-nums">{formatMoney(v)}</td>
                            </tr>
                          ))}
                        {lr.gstApplicable &&
                          gstRows.map(([label, v]) => (
                            <tr key={label} className="border-b border-dotted border-neutral-400">
                              <td className="border-r border-black p-1">{label}</td>
                              <td className="border-r border-black p-1" />
                              <td className="p-1 text-right tabular-nums">{formatMoney(v)}</td>
                            </tr>
                          ))}
                        {Number(lr.advance) > 0 && (
                          <tr className="border-b border-dotted border-neutral-400">
                            <td className="border-r border-black p-1">Less: Advance</td>
                            <td className="border-r border-black p-1" />
                            <td className="p-1 text-right tabular-nums">
                              −{formatMoney(Number(lr.advance))}
                            </td>
                          </tr>
                        )}
                        <tr className="border-t-2 border-black font-black">
                          <td className="border-r border-black p-1">TOTAL</td>
                          <td className="border-r border-black p-1" />
                          <td className="p-1 text-right tabular-nums">
                            {formatMoney(Number(lr.grandTotal))}
                          </td>
                        </tr>
                      </>
                    ) : (
                      <tr>
                        <td colSpan={3} className="p-4 text-center">
                          <span
                            className="inline-block rotate-[-8deg] border-2 px-3 py-1 text-[12px] font-black tracking-widest"
                            style={{ borderColor: RED, color: RED }}
                          >
                            TO BE BILLED
                          </span>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                <div className="flex border-t-2 border-black text-[10px] font-black">
                  <div className="border-r border-black p-1.5">Amount to Pay / Paid</div>
                  <div className="flex-1 p-1.5 text-right tabular-nums">
                    {showAmounts ? `Rs. ${formatMoney(Number(lr.grandTotal))}` : ""}
                  </div>
                </div>
              </div>

              {/* truck + issuing office */}
              <div className="flex w-[215px] shrink-0 flex-col border border-black">
                <div className="flex-1 p-1.5">
                  <Line label="Truck No." value={<b>{vehicle?.number ?? lr.vehicleText}</b>} />
                  <Line label="Driver's Name :" value={driver?.name} />
                  <Line label="Driver's Mob. :" value={driver?.mobile} />
                  <Line label="Place of Delivery :" value={lr.deliveryAt || destCity?.name} />
                  <Line label="E-Way Bill No. :" value={lr.ewayBillNo} />
                  <Line
                    label="E-Way Bill Date :"
                    value={lr.ewayExpiry ? formatDate(lr.ewayExpiry) : ""}
                  />
                  <Line label="Transporter ID :" value={firm.gstin} />
                </div>
                <div className="border-t border-black p-1.5">
                  <div className="font-bold">Address of Issuing Office or Name and Address of Agent</div>
                  <div className="uppercase">{firm.name}</div>
                  <div>{[firm.address1, firm.address2].filter(Boolean).join(", ")}</div>
                  <div>{firm.mobile && `Mob.: ${firm.mobile}`}</div>
                </div>
              </div>

              {/* marks */}
              <div className="flex w-[130px] shrink-0 flex-col border border-black">
                <div className="flex-1 p-1.5">
                  <div className="border-b border-black pb-0.5 text-[9px] font-black">Private Marks</div>
                  <div className="py-1 font-semibold uppercase">{lr.privateMarka || "--"}</div>
                  <div className="border-b border-t border-black py-0.5 text-[9px] font-black">
                    Additional Information
                  </div>
                  <div className="py-1">{lr.remarks || "--"}</div>
                  <div className="border-b border-t border-black py-0.5 text-[9px] font-black">
                    Ref / OBD No.
                  </div>
                  <div className="py-1">{[lr.refNo, lr.obdNo].filter(Boolean).join(" / ") || "--"}</div>
                </div>
              </div>
            </div>

            {/* ================= ROW 4: to/from, invoice details, claim, signatory ================= */}
            <div className="mt-1 flex items-stretch gap-1">
              <div className="w-[190px] shrink-0 border border-black p-1.5">
                <div className="font-black">To :</div>
                <div className="font-bold uppercase" style={{ color: RED }}>
                  {consignee?.name}
                </div>
                <div>{addr(consignee)}</div>
                {consignee?.mobile && <div>Mob.: {consignee.mobile}</div>}
              </div>
              <div className="w-[190px] shrink-0 border border-black p-1.5">
                <div className="font-black">From :</div>
                <div className="font-bold uppercase" style={{ color: RED }}>
                  {consignor?.name}
                </div>
                <div>{addr(consignor)}</div>
                {consignor?.mobile && <div>Mob.: {consignor.mobile}</div>}
              </div>
              {/* invoice details */}
              <div className="min-w-0 flex-1 border border-black">
                <div className="border-b border-black py-0.5 text-center text-[9px] font-black">
                  Invoice Details
                </div>
                <div className="flex">
                  <div className="min-w-0 flex-1 border-r border-black p-1.5">
                    <Line label="Invoice No. :" value={lr.invoiceNo} />
                    <Line
                      label="Date :"
                      value={lr.invoiceDate ? formatDate(lr.invoiceDate) : ""}
                    />
                    <Line label="GSTIN / UIN :" value={billTo?.gstin ?? consignor?.gstin} />
                    <Line label="Licence No. of Transport Operator :" value="" />
                    <Line label="Person Liable to Pay :" value={<b>{liable}</b>} />
                  </div>
                  <div className="w-[110px] shrink-0 p-1.5">
                    {(["CONSIGNOR", "CONSIGNEE", "TRANSPORTER", "DRIVER"] as const).map((who) => (
                      <div key={who} className="flex items-center gap-1.5 py-0.5">
                        <span className="inline-flex h-[10px] w-[10px] items-center justify-center border border-black text-[8px] font-black leading-none">
                          {liable === who ? "✓" : ""}
                        </span>
                        <span className="text-[8.5px] capitalize">{who.toLowerCase()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              {/* claim note */}
              <div className="w-[180px] shrink-0 border border-black p-1.5 text-[8.5px] leading-snug">
                <div>This Consignment Note has to be claimed within 7 days.</div>
                <div className="mt-1.5">
                  Covered re-routed or re-booked without written instructions will be at
                  owner&apos;s risk
                </div>
                <div className="mt-1.5">Will be Delivered at the destination.</div>
              </div>
              {/* signatory */}
              <div className="flex w-[190px] shrink-0 flex-col items-center justify-between border border-black p-1.5">
                <div className="text-[9px] font-black">
                  For <span style={{ color: RED }}>{firm.name.toUpperCase()}</span>
                </div>
                <div className="py-2" />
                <div className="w-full border-t border-black pt-0.5 text-center text-[9px] font-black">
                  Authorised Signatory
                </div>
              </div>
            </div>

            {/* ================= FOOTER ================= */}
            <div className="mt-1 flex items-stretch border border-black text-[9.5px] font-black">
              <div className="w-[190px] shrink-0 border-r border-black p-1.5">
                <div className="text-[8.5px]">Value</div>
                <div className="text-[12px] tabular-nums">
                  ₹ {lr.goodsValue != null ? formatMoney(Number(lr.goodsValue)) : "____________"}
                </div>
              </div>
              <div className="flex flex-1 items-end justify-center border-r border-black p-1.5 pt-6">
                Signature of Transport Operator
              </div>
              <div className="flex flex-1 items-end justify-center border-r border-black p-1.5 pt-6">
                Signature of Consignor
              </div>
              <div className="flex flex-1 items-end justify-center p-1.5 pt-6">
                Signature of Consignee
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
