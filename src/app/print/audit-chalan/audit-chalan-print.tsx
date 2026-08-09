import { formatDate, formatMoney, toNum } from "@/lib/utils";

/**
 * Audit Challan print card.
 *
 * The existing Freight Chalan print is the DESIGN reference — same bordered
 * A4 block, same firm letterhead, same table treatment — but the fields are
 * only those held by the Audit Challan Register. Values render exactly as
 * stored: no master is consulted to expand or correct a name.
 *
 * There is deliberately no watermark, "audit copy" band or disclaimer. The
 * sheet is meant to read as an ordinary professional challan.
 */

export interface AuditChalanPrintRow {
  id: string;
  chalanNo: string;
  chalanDate: Date;
  transportName: string;
  ownerName: string;
  panCard: string;
  loadingFrom: string;
  toLocation: string;
  actualWt: unknown;
  chargeWt: unknown;
  freightRate: unknown;
  freightAmount: unknown;
  tdsAmount: unknown;
  advanceBank: unknown;
  cash: unknown;
  diesel: unknown;
  tyre: unknown;
  uria: unknown;
  other: unknown;
  balance: unknown;
}

export interface PrintFirm {
  name: string;
  address1: string | null;
  address2: string | null;
  mobile: string | null;
  phone: string | null;
  gstin: string | null;
  pan: string | null;
}

/** blank numeric cells read as "-" so a zero-heavy sheet stays scannable */
const money = (v: unknown) => {
  const n = toNum(v);
  return n === 0 ? "-" : formatMoney(n);
};

export function AuditChalanPrint({
  row,
  firm,
}: {
  row: AuditChalanPrintRow;
  firm: PrintFirm | null;
}) {
  const deductions: [string, unknown][] = [
    ["TDS Amount", row.tdsAmount],
    ["Advances in Bank", row.advanceBank],
    ["Cash", row.cash],
    ["Diesel", row.diesel],
    ["Tyre", row.tyre],
    ["Uria", row.uria],
    ["Other", row.other],
  ];
  const deductionTotal = deductions.reduce((s, [, v]) => s + toNum(v), 0);

  return (
    <div className="mx-auto max-w-[190mm] break-after-page border border-black p-4 text-sm text-black">
      {/* firm letterhead */}
      <div className="border-b border-black pb-2 text-center">
        <div className="text-xl font-bold uppercase">{firm?.name}</div>
        <div className="text-xs">{[firm?.address1, firm?.address2].filter(Boolean).join(", ")}</div>
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
        <div className="mt-1 text-sm font-semibold">FREIGHT CHALAN</div>
      </div>

      {/* basic details */}
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
        <div>
          <b>Chalan No:</b> {row.chalanNo}
        </div>
        <div>
          <b>Date:</b> {formatDate(row.chalanDate)}
        </div>
        <div>
          <b>Transport Name:</b> {row.transportName}
        </div>
        <div>
          <b>Owner Name:</b> {row.ownerName}
        </div>
        <div>
          <b>PAN Card:</b> {row.panCard}
        </div>
        <div>
          <b>Loading From:</b> {row.loadingFrom}
        </div>
        <div>
          <b>To:</b> {row.toLocation}
        </div>
      </div>

      {/* weight & freight */}
      <table className="mt-3 w-full border-collapse text-xs">
        <thead>
          <tr>
            {["Actual WT", "Charge WT", "Freight Rate", "Freight Amount"].map((h) => (
              <th key={h} className="border border-black px-1 py-0.5 text-left">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="border border-black px-1 py-0.5 text-right">{toNum(row.actualWt)}</td>
            <td className="border border-black px-1 py-0.5 text-right">{toNum(row.chargeWt)}</td>
            <td className="border border-black px-1 py-0.5 text-right">
              {formatMoney(toNum(row.freightRate))}
            </td>
            <td className="border border-black px-1 py-0.5 text-right font-semibold">
              {formatMoney(toNum(row.freightAmount))}
            </td>
          </tr>
        </tbody>
      </table>

      {/* deductions / advances / expenses, then the balance */}
      <div className="mt-3 flex gap-4">
        <table className="w-1/2 border-collapse text-xs">
          <tbody>
            <tr className="font-semibold">
              <td className="border border-black px-1 py-0.5">Freight Amount</td>
              <td className="border border-black px-1 py-0.5 text-right">
                {formatMoney(toNum(row.freightAmount))}
              </td>
            </tr>
            {deductions.map(([label, v]) => (
              <tr key={label}>
                <td className="border border-black px-1 py-0.5">Less: {label}</td>
                <td className="border border-black px-1 py-0.5 text-right">{money(v)}</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="border border-black px-1 py-0.5">Total Deductions</td>
              <td className="border border-black px-1 py-0.5 text-right">
                {formatMoney(deductionTotal)}
              </td>
            </tr>
            <tr className="font-bold">
              <td className="border border-black px-1 py-0.5">Balance</td>
              <td className="border border-black px-1 py-0.5 text-right">
                {formatMoney(toNum(row.balance))}
              </td>
            </tr>
          </tbody>
        </table>

        {/* headline figures, set larger — the same three numbers the left
            table arrives at, not a second copy of the itemised list */}
        <div className="flex w-1/2 flex-col justify-between border border-black p-3">
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span>Freight Amount</span>
              <span className="tabular-nums">{formatMoney(toNum(row.freightAmount))}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span>Less: Total Deductions</span>
              <span className="tabular-nums">{formatMoney(deductionTotal)}</span>
            </div>
            <div className="mt-1 flex justify-between border-t border-black pt-2 text-base font-bold">
              <span>Balance</span>
              <span className="tabular-nums">{formatMoney(toNum(row.balance))}</span>
            </div>
          </div>
          <div className="mt-6 text-[11px]">
            <div className="border-t border-black pt-1">Receiver&apos;s Signature</div>
          </div>
        </div>
      </div>

      <div className="mt-8 flex justify-between text-xs">
        <div>Driver Signature</div>
        <div>For {firm?.name}</div>
      </div>
    </div>
  );
}
