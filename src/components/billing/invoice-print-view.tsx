import * as React from "react";
import { formatMoney } from "@/lib/utils";
import { amountInWords } from "@/lib/num-to-words";

/**
 * Shared professional invoice layout — rendered identically by the Bill
 * Preview dialog (client, from form state) and the print page (server, from
 * the saved invoice). All values arrive display-ready.
 */
export interface InvoiceViewParty {
  name: string;
  address: string;
  gstin: string;
  pan: string;
  stateName: string;
  stateCode: string;
}

export interface InvoiceViewLr {
  id: string;
  lrNo: string;
  lrDate: string; // formatted
  source: string;
  dest: string;
  obdNo: string;
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
  /** informational RCM split — never affects the invoice total */
  rcm: { taxableValue: number; pct: number; cgst: number; sgst: number; igst: number } | null;
  gstApplied: boolean;
  remarks: string;
  bank: string;
}

const cell = "border border-black px-1 py-0.5";

export function InvoicePrintView({
  data,
  lrActions,
}: {
  data: InvoiceViewData;
  /** optional per-LR action cell (used by the preview for Edit / Remove) */
  lrActions?: (lr: InvoiceViewLr) => React.ReactNode;
}) {
  const { firm, party, totals } = data;
  return (
    <div className="mx-auto max-w-[190mm] border border-black bg-white p-4 text-sm text-black">
      {/* header: company details from Company Master */}
      <div className="border-b border-black pb-2 text-center">
        <div className="text-xl font-bold uppercase">{firm.name}</div>
        <div className="text-xs">{firm.address}</div>
        <div className="text-xs">
          {[
            firm.mobile && `Mob: ${firm.mobile}`,
            firm.email && `Email: ${firm.email}`,
          ]
            .filter(Boolean)
            .join(" | ")}
        </div>
        <div className="text-xs">
          {[
            firm.gstin && `GSTIN: ${firm.gstin}`,
            firm.pan && `PAN: ${firm.pan}`,
            firm.stateName && `State: ${firm.stateName}${firm.stateCode ? ` (${firm.stateCode})` : ""}`,
            firm.ibaCode && `IBA Code: ${firm.ibaCode}`,
          ]
            .filter(Boolean)
            .join(" | ")}
        </div>
        <div className="mt-1 text-sm font-semibold">FREIGHT BILL</div>
        <div className="text-xs">
          Service Covered Under GST Reverse Charge Mechanism: <b>{firm.rcmCovered ? "Yes" : "No"}</b>
          {" — "}TDS Applicable @ {data.tdsPct || 1}% (For Information Only)
        </div>
      </div>

      {/* bill no / date + service info */}
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
        <div>
          <b>Bill Number:</b> {data.billNo}
        </div>
        <div>
          <b>Bill Date:</b> {data.billDate}
        </div>
        <div>
          <b>Description of Service:</b> {data.serviceDescription}
        </div>
        <div>
          <b>SAC:</b> {data.sacCode}
        </div>
      </div>

      {/* bill to */}
      <div className="mt-2 rounded border border-black p-2 text-xs">
        <div className="font-semibold">Bill To:</div>
        <div className="font-medium">{party.name}</div>
        {party.address && <div>{party.address}</div>}
        <div>
          {[
            party.gstin && `GSTIN: ${party.gstin}`,
            party.pan && `PAN: ${party.pan}`,
            party.stateName &&
              `State: ${party.stateName}${party.stateCode ? ` (${party.stateCode})` : ""}`,
          ]
            .filter(Boolean)
            .join(" | ")}
        </div>
      </div>

      {/* LR details */}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse text-[10px]">
          <thead>
            <tr>
              {[
                "#",
                "LR No",
                "Loading Date",
                "From",
                "To",
                "OBD No",
                "Invoice No",
                "Vehicle",
                "Material",
                "Consignee",
                "Unloading Date",
                "Qty",
                "Actual Wt",
                "Charge Wt",
                "Rate",
                "Freight Amount",
                ...(lrActions ? [""] : []),
              ].map((h, i) => (
                <th key={i} className={`${cell} text-left`}>
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
                <td className={cell}>{lr.invoiceNo}</td>
                <td className={cell}>{lr.vehicle}</td>
                <td className={cell}>{lr.material}</td>
                <td className={cell}>{lr.consignee}</td>
                <td className={cell}>{lr.unloadDate}</td>
                <td className={`${cell} text-right`}>{lr.qty}</td>
                <td className={`${cell} text-right`}>{lr.actualWt}</td>
                <td className={`${cell} text-right`}>{lr.chargeWt}</td>
                <td className={`${cell} text-right`}>{lr.rate}</td>
                <td className={`${cell} text-right`}>{formatMoney(lr.amount)}</td>
                {lrActions && <td className={cell}>{lrActions(lr)}</td>}
              </tr>
            ))}
            <tr className="font-semibold">
              <td colSpan={11} className={cell}>
                Total
              </td>
              <td className={`${cell} text-right`}>
                {data.lrs.reduce((s, l) => s + l.qty, 0)}
              </td>
              <td className={`${cell} text-right`}>
                {Math.round(data.lrs.reduce((s, l) => s + l.actualWt, 0) * 1000) / 1000}
              </td>
              <td className={`${cell} text-right`}>
                {Math.round(data.lrs.reduce((s, l) => s + l.chargeWt, 0) * 1000) / 1000}
              </td>
              <td className={cell} />
              <td className={`${cell} text-right`}>{formatMoney(totals.total)}</td>
              {lrActions && <td className={cell} />}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mt-1 text-xs">
        <b>Enclosures:</b> {data.lrs.length} LR{data.lrs.length === 1 ? "" : "s"}
      </div>

      <div className="mt-3 flex gap-4">
        {/* charges + RCM info */}
        <div className="w-1/2 space-y-2 text-xs">
          {data.charges.length > 0 && (
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={`${cell} text-left`}>Additional Charge</th>
                  <th className={`${cell} text-left`}>Related LR(s)</th>
                  <th className={`${cell} text-left`}>Amount</th>
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

          {data.rcm && (
            <div className="rounded border border-black p-2">
              <div className="font-semibold">Reverse Charge Mechanism (RCM) — For Information Only</div>
              <div>GST on this service is payable by the recipient under RCM. It is NOT added to this bill.</div>
              <table className="mt-1 w-full border-collapse">
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

          {data.bank && (
            <div className="rounded border border-black p-1">
              <b>Bank Details:</b> {data.bank}
            </div>
          )}
          {data.remarks && (
            <div>
              <b>Remarks:</b> {data.remarks}
            </div>
          )}
        </div>

        {/* totals */}
        <table className="h-fit w-1/2 border-collapse text-xs">
          <tbody>
            {(
              [
                ["Freight Total", totals.total],
                ["Grand Total (before tax)", totals.grandTotal],
                ...(data.gstApplied
                  ? ([
                      ["CGST", totals.cgstAmt],
                      ["SGST", totals.sgstAmt],
                      ["IGST", totals.igstAmt],
                    ] as [string, number][])
                  : []),
                ["Net Total", totals.netTotal],
                ["Less: Advance", totals.advance],
                ["Balance", totals.balance],
              ] as [string, number][]
            ).map(([label, v]) => (
              <tr key={label} className={label === "Balance" ? "font-bold" : undefined}>
                <td className={cell}>{label}</td>
                <td className={`${cell} text-right`}>{formatMoney(v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* amount in words */}
      <div className="mt-2 border border-black p-1 text-xs font-semibold">
        Amount in Words: {amountInWords(totals.balance)}
      </div>

      {/* footer notes */}
      <div className="mt-2 text-[10px]">
        <div>E. &amp; O.E.</div>
        <div>
          Interest @ 12% per annum will be charged from the date of the bill if payment is delayed.
        </div>
        <div>All disputes are subject to Raigarh jurisdiction only.</div>
      </div>

      <div className="mt-8 flex justify-between text-xs">
        <div>Receiver Signature</div>
        <div>For {firm.name}</div>
      </div>
    </div>
  );
}
