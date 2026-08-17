import * as React from "react";
import { formatMoney } from "@/lib/utils";
import { amountInWords } from "@/lib/num-to-words";

/**
 * Manual bill print layout — a faithful replica of the firm's own hand-bill
 * format (A4 landscape): maroon letterhead, consignment-note table, totals
 * box, amount in words, RCM note, bank details and Udyam line.
 *
 * Colours are forced through printing via print-color-adjust; the print route
 * sets the landscape @page rule (it cannot be scoped to a component).
 */
export interface ManualBillViewData {
  billNo: string;
  billDate: string; // formatted dd/mm/yyyy
  firm: {
    name: string;
    regdOffice: string;
    mobile: string;
    pan: string;
    /** MSME / Udyam certificate number — line is dropped when blank */
    msmeNo: string;
    logoUrl?: string | null;
    sealUrl?: string | null;
  };
  party: { name: string; address: string };
  rows: {
    cnNo: string;
    date: string; // formatted
    loading: string;
    delivery: string;
    invoiceNo: string;
    vehicleNo: string;
    material: string;
    deliveryDate: string; // formatted
    wt: number;
    gtWt: number;
    rate: number;
    amount: number;
  }[];
  totalFreight: number;
  otherCharge: number;
  /** CGST/SGST/IGST rows print only when non-zero (format is normally RCM) */
  cgstAmt: number;
  sgstAmt: number;
  igstAmt: number;
  totalBilled: number;
  /** print the "GST payable by billed party (RCM basis)" strip */
  rcmNote: boolean;
  bank: {
    accountName: string;
    account: string;
    bankName: string;
    ifsc: string;
    branch: string;
  } | null;
}

const MAROON = "#8b1a4f";

const th =
  "border border-black px-1 py-0.5 text-center align-middle text-[10px] font-bold uppercase";
const td = "border border-black px-1 py-1 text-center align-middle text-[11px]";

function words(amount: number): string {
  return amountInWords(amount).replace(/^Rupees /, "").toUpperCase();
}

export function ManualBillPrintView({ data }: { data: ManualBillViewData }) {
  const { firm, party } = data;
  const gstRows = (
    [
      ["CGST", data.cgstAmt],
      ["SGST", data.sgstAmt],
      ["IGST", data.igstAmt],
    ] as const
  ).filter(([, v]) => v > 0);

  return (
    <div
      className="mx-auto w-full max-w-[277mm] bg-white text-black"
      style={{ printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}
    >
      <div className="border-2 border-black">
        {/* ---------- letterhead ---------- */}
        <div className="flex items-stretch">
          <div className="flex w-[16%] flex-col justify-between border-r border-black p-1">
            {firm.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={firm.logoUrl} alt="" className="max-h-24 w-full self-center object-contain" />
            ) : (
              <div />
            )}
            <div className="text-[7px] leading-tight">
              Classification of Service : Transport of goods service by Road.
            </div>
          </div>
          <div className="flex flex-1 flex-col justify-center border-r border-black p-1 text-center">
            <div
              className="font-serif text-[26px] font-extrabold leading-tight tracking-wide"
              style={{ color: MAROON }}
            >
              {firm.name}
            </div>
            <div className="text-[9px] font-semibold">Regd.Office :- {firm.regdOffice}</div>
            {firm.mobile && <div className="text-[9px]">MOB:- {firm.mobile}</div>}
            {firm.pan && (
              <div className="mx-auto mt-0.5 inline-block border border-black px-2 text-[10px] font-bold">
                PAN No. {firm.pan}
              </div>
            )}
          </div>
          <div className="w-[27%] text-[10px]">
            <div className="flex border-b border-black">
              <div className="flex-1 border-r border-black px-1 py-0.5">
                <div className="text-center font-bold">BILL NO.</div>
                <div className="text-center font-semibold">{data.billNo}</div>
              </div>
              <div className="w-[38%] px-1 py-0.5">
                <div className="text-center font-bold">DATE:-</div>
                <div className="text-center font-semibold">{data.billDate}</div>
              </div>
            </div>
            <div className="border-b border-black px-1 py-0.5 text-center text-[11px] font-bold uppercase">
              M/S {party.name}
            </div>
            <div className="px-1 py-0.5 text-center text-[9px] font-semibold uppercase leading-tight">
              {party.address}
            </div>
          </div>
        </div>

        {/* ---------- consignment table ---------- */}
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={th}>C. Note</th>
              <th className={th}>Date</th>
              <th className={th}>
                Loading
                <br />
                Stations
              </th>
              <th className={th}>Delivery Stations</th>
              <th className={th}>Invoice No.</th>
              <th className={th}>Vehicle No.</th>
              <th className={th}>Material</th>
              <th className={th}>Delivery Date</th>
              <th className={th}>WT</th>
              <th className={th}>GT WT.</th>
              <th className={th}>Rate</th>
              <th className={th}>Freight Amount</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r, i) => (
              <tr key={i}>
                <td className={td}>{r.cnNo}</td>
                <td className={td}>{r.date}</td>
                <td className={`${td} uppercase`}>{r.loading}</td>
                <td className={`${td} uppercase`}>{r.delivery}</td>
                <td className={td}>{r.invoiceNo}</td>
                <td className={`${td} uppercase`}>{r.vehicleNo}</td>
                <td className={`${td} uppercase`}>{r.material}</td>
                <td className={td}>{r.deliveryDate}</td>
                <td className={`${td} tabular-nums`}>{r.wt || ""}</td>
                <td className={`${td} tabular-nums`}>{r.gtWt || ""}</td>
                <td className={`${td} tabular-nums`}>{r.rate || ""}</td>
                <td className={`${td} font-semibold tabular-nums`}>{formatMoney(r.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* ---------- enclosure + totals ---------- */}
        <div className="flex items-start justify-between px-1 pt-1">
          <div className="flex items-center gap-1 text-[10px]">
            <span className="font-bold">Enclosure :</span>
            <span className="border border-black px-2 py-0.5 text-center font-semibold">
              {data.rows.length}
            </span>
            <span className="font-semibold">
              Nos.Original/Consignee Copy of C/N duly acknowledgement
            </span>
          </div>
          <table className="w-[240px] border-collapse text-[10px]">
            <tbody>
              <tr>
                <td className="border border-black px-1 py-0.5 font-semibold">
                  Total Freight Amount
                </td>
                <td className="border border-black px-1 py-0.5 text-right font-bold tabular-nums">
                  {formatMoney(data.totalFreight)}
                </td>
              </tr>
              <tr>
                <td className="border border-black px-1 py-0.5">Other Charge</td>
                <td className="border border-black px-1 py-0.5 text-right tabular-nums">
                  {formatMoney(data.otherCharge)}
                </td>
              </tr>
              {gstRows.map(([label, v]) => (
                <tr key={label}>
                  <td className="border border-black px-1 py-0.5">{label}</td>
                  <td className="border border-black px-1 py-0.5 text-right tabular-nums">
                    {formatMoney(v)}
                  </td>
                </tr>
              ))}
              <tr>
                <td className="border border-black px-1 py-0.5 text-[11px] font-bold">
                  Total Billed Amount
                </td>
                <td className="border border-black px-1 py-0.5 text-right text-[12px] font-extrabold tabular-nums">
                  {formatMoney(data.totalBilled)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ---------- amount in words ---------- */}
        <div className="px-1 pt-2 text-[12px] font-bold">
          Total Amount:(In Figures)Rs:- {words(data.totalBilled)}
        </div>
        <div className="px-1 pb-1 pt-0.5 text-[10px] font-extrabold tracking-tight">
          PLEASE PAY BY A/C PAYEE CHEQUE ONLY
        </div>

        {/* ---------- RCM strip ---------- */}
        {data.rcmNote && (
          <div className="mx-1 border-b border-t border-black py-0.5 text-center text-[9px] font-bold">
            FOR GST TAX WILL BE PAID BY ABOVE BILLED PARTY (RCM BASIS)
          </div>
        )}

        {/* ---------- bank details + seal ---------- */}
        <div className="flex items-start justify-between px-1 py-1">
          <div className="text-[11px]">
            <div
              className="text-[13px] font-bold underline"
              style={{ color: MAROON }}
            >
              Bank Details.
            </div>
            {data.bank ? (
              <table className="mt-0.5" style={{ color: MAROON }}>
                <tbody>
                  {(
                    [
                      ["Account Name", data.bank.accountName],
                      ["A/C NUMBER", data.bank.account],
                      ["BANK NAME", data.bank.bankName],
                      ["IFSC", data.bank.ifsc],
                      ["BRANCH", data.bank.branch],
                    ] as const
                  )
                    .filter(([, v]) => v)
                    .map(([label, v]) => (
                      <tr key={label}>
                        <td className="pr-4 font-bold">{label}</td>
                        <td className="pr-2 font-bold">-</td>
                        <td className="font-bold uppercase">{v}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            ) : (
              <div className="mt-0.5 text-[10px] text-neutral-600">
                (select a bank on the bill to print account details)
              </div>
            )}
            {firm.msmeNo && (
              <div className="mt-2 text-[10px] font-bold uppercase text-black">
                UDYAM CERTIFICATE NO. <span className="px-4">-</span> {firm.msmeNo}
              </div>
            )}
          </div>
          {firm.sealUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={firm.sealUrl} alt="" className="mr-8 mt-1 max-h-36 object-contain" />
          )}
        </div>

        {/* ---------- footer notes + signature ---------- */}
        <div className="flex items-end justify-between px-1 pb-2 pt-1">
          <div className="text-[8px] leading-snug">
            <div>NOTE: 1. E &amp; O.E.</div>
            <div className="pl-7">2 .Interest @ 24% per annum from the date of Bill.</div>
          </div>
          <div className="pr-4 text-center text-[10px]">
            <div className="font-bold">For {firm.name}</div>
            <div className="mt-8 font-semibold">Authorised Signatory</div>
          </div>
        </div>
      </div>
    </div>
  );
}
