import * as React from "react";
import { formatMoney } from "@/lib/utils";
import { amountInWords } from "@/lib/num-to-words";

/**
 * Shared professional TAX INVOICE layout (A4 portrait) — rendered identically
 * by the Bill Preview dialog (client, from form state) and the print page
 * (server, from the saved invoice). All values arrive display-ready.
 */
export interface InvoiceViewParty {
  name: string;
  address: string;
  gstin: string;
  pan: string;
  stateName: string;
  stateCode: string;
  /** vendor code from the Billed-To party's master (blank if none) */
  vendorCode: string;
}

export interface InvoiceViewLr {
  id: string;
  lrNo: string;
  lrDate: string; // formatted
  source: string;
  dest: string;
  obdNo: string;
  poNumber: string;
  gateEntryNo: string;
  invoiceNo: string;
  vehicle: string;
  material: string;
  consignee: string;
  unloadDate: string; // formatted or ""
  qty: number;
  actualWt: number;
  chargeWt: number;
  rate: number;
  amount: number;
}

export interface InvoiceViewData {
  billNo: string;
  billDate: string; // formatted
  placeOfSupply: string;
  firm: {
    name: string;
    address: string;
    mobile: string;
    email: string;
    gstin: string;
    pan: string;
    stateName: string;
    stateCode: string;
    ibaCode: string;
    vendorCode: string;
    rcmCovered: boolean;
  };
  tdsPct: number;
  serviceDescription: string;
  sacCode: string;
  party: InvoiceViewParty;
  lrs: InvoiceViewLr[];
  charges: { label: string; relatedLrs: string; amount: number }[];
  totals: {
    total: number;
    grandTotal: number;
    cgstAmt: number;
    sgstAmt: number;
    igstAmt: number;
    netTotal: number;
    advance: number;
    balance: number;
  };
  gstPct: number;
  /** informational RCM split — never affects the invoice total */
  rcm: { taxableValue: number; pct: number; cgst: number; sgst: number; igst: number } | null;
  gstApplied: boolean;
  remarks: string;
  bank: string;
}

const cell = "border border-black px-1 py-0.5";
const labelCell = "border border-black bg-neutral-100 px-1 py-0.5 font-semibold print:bg-neutral-100";

export function InvoicePrintView({
  data,
  lrActions,
}: {
  data: InvoiceViewData;
  /** optional per-LR action cell (used by the preview for Edit / Remove) */
  lrActions?: (lr: InvoiceViewLr) => React.ReactNode;
}) {
  const { firm, party, totals } = data;
  const chargesTotal = data.charges.reduce((s, c) => s + c.amount, 0);
  // display-only round off to the nearest rupee; stored accounting values unchanged
  const grandRounded = Math.round(totals.balance);
  const roundOff = Math.round((grandRounded - totals.balance) * 100) / 100;
  const totalChargeWt = Math.round(data.lrs.reduce((s, l) => s + l.chargeWt, 0) * 1000) / 1000;
  const totalActualWt = Math.round(data.lrs.reduce((s, l) => s + l.actualWt, 0) * 1000) / 1000;

  return (
    <div className="mx-auto max-w-[190mm] border-2 border-black bg-white text-black">
      {/* title band */}
      <div className="border-b-2 border-black py-1 text-center text-base font-bold tracking-widest">
        TAX INVOICE
      </div>

      {/* company information (from Company Master) */}
      <div className="border-b border-black px-2 py-1 text-center">
        <div className="text-xl font-bold uppercase">{firm.name}</div>
        {firm.address && <div className="text-xs">{firm.address}</div>}
        <div className="text-xs">
          {[firm.mobile && `Mob: ${firm.mobile}`, firm.email && `Email: ${firm.email}`]
            .filter(Boolean)
            .join("  |  ")}
        </div>
      </div>
      <table className="w-full border-collapse text-xs">
        <tbody>
          <tr>
            <td className={labelCell}>PAN</td>
            <td className={cell}>{firm.pan}</td>
            <td className={labelCell}>GSTIN</td>
            <td className={cell}>{firm.gstin}</td>
            <td className={labelCell}>Vendor Code</td>
            <td className={cell}>{party.vendorCode || firm.vendorCode}</td>
            <td className={labelCell}>IBA Code</td>
            <td className={cell}>{firm.ibaCode}</td>
          </tr>
          <tr>
            <td className={labelCell}>Service</td>
            <td className={cell} colSpan={3}>
              {data.serviceDescription}
            </td>
            <td className={labelCell}>SAC Code</td>
            <td className={cell}>{data.sacCode}</td>
            <td className={labelCell}>Reverse Charge</td>
            <td className={cell}>{firm.rcmCovered ? "Yes" : "No"}</td>
          </tr>
        </tbody>
      </table>

      {/* invoice details */}
      <table className="w-full border-collapse text-xs">
        <tbody>
          <tr>
            <td className={labelCell}>Bill Number</td>
            <td className={cell}>{data.billNo}</td>
            <td className={labelCell}>Bill Date</td>
            <td className={cell}>{data.billDate}</td>
            <td className={labelCell}>Place of Supply</td>
            <td className={cell}>{data.placeOfSupply}</td>
            <td className={labelCell}>State / Code</td>
            <td className={cell}>
              {firm.stateName}
              {firm.stateCode ? ` / ${firm.stateCode}` : ""}
            </td>
          </tr>
        </tbody>
      </table>

      {/* customer details (from Party Master) */}
      <div className="border-b border-t border-black px-2 py-1 text-xs">
        <div className="font-semibold underline">Bill To</div>
        <div className="text-sm font-bold">{party.name}</div>
        {party.address && <div>{party.address}</div>}
        <div>
          {[
            party.gstin && `GSTIN: ${party.gstin}`,
            party.pan && `PAN: ${party.pan}`,
            party.stateName &&
              `State: ${party.stateName}${party.stateCode ? ` (Code: ${party.stateCode})` : ""}`,
          ]
            .filter(Boolean)
            .join("  |  ")}
        </div>
      </div>

      {/* LR details table — expands with the number of LRs */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[9px]">
          <thead>
            <tr>
              {[
                "Sr.",
                "LR / C.Note No",
                "Dispatch Date",
                "From Station",
                "To Station",
                "OBD No",
                "PO No",
                "Gate Entry No",
                "Invoice No",
                "Vehicle No",
                "Material",
                "Consignee",
                "Delivery Date",
                "Net Wt",
                "Charged Wt",
                "Rate",
                "Freight Amt",
                ...(lrActions ? [""] : []),
              ].map((h, i) => (
                <th key={i} className={`${labelCell} text-left`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.lrs.map((lr, i) => (
              <tr key={lr.id}>
                <td className={cell}>{i + 1}</td>
                <td className={cell}>{lr.lrNo}</td>
                <td className={cell}>{lr.lrDate}</td>
                <td className={cell}>{lr.source}</td>
                <td className={cell}>{lr.dest}</td>
                <td className={cell}>{lr.obdNo}</td>
                <td className={cell}>{lr.poNumber}</td>
                <td className={cell}>{lr.gateEntryNo}</td>
                <td className={cell}>{lr.invoiceNo}</td>
                <td className={cell}>{lr.vehicle}</td>
                <td className={cell}>{lr.material}</td>
                <td className={cell}>{lr.consignee}</td>
                <td className={cell}>{lr.unloadDate}</td>
                <td className={`${cell} text-right`}>{lr.actualWt}</td>
                <td className={`${cell} text-right`}>{lr.chargeWt}</td>
                <td className={`${cell} text-right`}>{lr.rate}</td>
                <td className={`${cell} text-right`}>{formatMoney(lr.amount)}</td>
                {lrActions && <td className={cell}>{lrActions(lr)}</td>}
              </tr>
            ))}
            <tr className="font-semibold">
              <td colSpan={13} className={cell}>
                Total — Enclosures: {data.lrs.length} LR{data.lrs.length === 1 ? "" : "s"}
              </td>
              <td className={`${cell} text-right`}>{totalActualWt}</td>
              <td className={`${cell} text-right`}>{totalChargeWt}</td>
              <td className={cell} />
              <td className={`${cell} text-right`}>{formatMoney(totals.total)}</td>
              {lrActions && <td className={cell} />}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex">
        {/* left: RCM info + declarations + remarks + bank */}
        <div className="w-1/2 border-r border-black p-2 text-xs">
          {data.rcm && (
            <div className="mb-2 border border-black p-1">
              <div className="font-semibold">
                Reverse Charge Mechanism (RCM) — For Information Only
              </div>
              <table className="mt-0.5 w-full border-collapse">
                <tbody>
                  {(
                    [
                      ["Taxable Value", data.rcm.taxableValue],
                      ...(data.rcm.igst > 0
                        ? ([[`IGST @ ${data.rcm.pct}%`, data.rcm.igst]] as [string, number][])
                        : ([
                            [`CGST @ ${data.rcm.pct / 2}%`, data.rcm.cgst],
                            [`SGST @ ${data.rcm.pct / 2}%`, data.rcm.sgst],
                          ] as [string, number][])),
                    ] as [string, number][]
                  ).map(([label, v]) => (
                    <tr key={label}>
                      <td className={cell}>{label}</td>
                      <td className={`${cell} text-right`}>{formatMoney(v)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data.charges.length > 0 && (
            <table className="mb-2 w-full border-collapse">
              <thead>
                <tr>
                  <th className={`${labelCell} text-left`}>Additional Charge</th>
                  <th className={`${labelCell} text-left`}>Related LR(s)</th>
                  <th className={`${labelCell} text-left`}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.charges.map((c, i) => (
                  <tr key={i}>
                    <td className={cell}>{c.label}</td>
                    <td className={cell}>{c.relatedLrs || "All LRs"}</td>
                    <td className={`${cell} text-right`}>{formatMoney(c.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="font-semibold underline">Declaration</div>
          <div className="text-[10px]">
            We hereby declare that this invoice shows the actual price of the services described
            and that all particulars are true and correct. Goods Transport Agency service.
          </div>
          {data.rcm && (
            <div className="mt-1 text-[10px] font-semibold">
              GST on this invoice is payable by the recipient of service under Reverse Charge
              Mechanism as per Notification No. 13/2017 — Central Tax (Rate). GST has NOT been
              charged on this invoice.
            </div>
          )}
          <div className="mt-1 text-[10px]">
            TDS Applicable @ {data.tdsPct || 1}% (For Information Only)
          </div>
          {data.bank && (
            <div className="mt-1 text-[10px]">
              <b>Bank Details:</b> {data.bank}
            </div>
          )}
          {data.remarks && (
            <div className="mt-1">
              <b>Remarks:</b> {data.remarks}
            </div>
          )}
        </div>

        {/* right: calculation section */}
        <div className="w-1/2 text-xs">
          <table className="w-full border-collapse">
            <tbody>
              {(
                [
                  ["Total Weight (Charged)", String(totalChargeWt)],
                  ["Total Freight", formatMoney(totals.total)],
                  ["Additional Charges", formatMoney(chargesTotal)],
                  ["Taxable Value", formatMoney(totals.grandTotal)],
                  ...(data.gstApplied
                    ? ([
                        [`CGST @ ${data.gstPct / 2}%`, formatMoney(totals.cgstAmt)],
                        [`SGST @ ${data.gstPct / 2}%`, formatMoney(totals.sgstAmt)],
                        [`IGST @ ${data.gstPct}%`, formatMoney(totals.igstAmt)],
                      ] as [string, string][])
                    : ([["GST", "Payable under RCM by recipient"]] as [string, string][])),
                  ["Less: Advance", formatMoney(totals.advance)],
                  ["Round Off", (roundOff >= 0 ? "+" : "−") + formatMoney(Math.abs(roundOff))],
                ] as [string, string][]
              ).map(([label, v]) => (
                <tr key={label}>
                  <td className={cell}>{label}</td>
                  <td className={`${cell} text-right`}>{v}</td>
                </tr>
              ))}
              <tr className="text-sm font-bold">
                <td className={labelCell}>GRAND TOTAL</td>
                <td className={`${labelCell} text-right`}>{formatMoney(grandRounded)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* amount in words */}
      <div className="border-t border-black px-2 py-1 text-xs font-semibold">
        Amount in Words: {amountInWords(grandRounded)}
      </div>

      {/* footer notes + signatory */}
      <div className="border-t border-black px-2 py-1 text-[10px]">
        <div>E. &amp; O.E.</div>
        <div>
          Interest @ 12% per annum will be charged from the date of the bill if payment is delayed.
        </div>
        <div>All disputes are subject to Raigarh jurisdiction only.</div>
      </div>
      <div className="flex border-t border-black text-xs">
        <div className="flex h-24 w-1/2 items-end border-r border-black p-2">
          Company Seal
        </div>
        <div className="flex h-24 w-1/2 flex-col items-end justify-between p-2">
          <div className="font-semibold">For {firm.name}</div>
          <div>Authorized Signatory</div>
        </div>
      </div>
    </div>
  );
}
