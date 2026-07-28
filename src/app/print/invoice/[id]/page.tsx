import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { formatDate, formatMoney, toNum } from "@/lib/utils";
import { round2 } from "@/lib/calc/tds";
import { PrintToolbar } from "./print-toolbar";

export const dynamic = "force-dynamic";

const KIND_TITLES: Record<string, string> = {
  PART_TRUCK: "FREIGHT BILL (PART TRUCK)",
  FULL_TRUCK: "FREIGHT BILL",
  MANUAL: "BILL",
  GST: "TAX INVOICE",
};

export default async function InvoicePrintPage({ params }: { params: { id: string } }) {
  const session = requireSession();

  const data = await withTenant(session.tenantId, async (tx) => {
    const invoice = await tx.invoice.findFirst({
      where: { id: params.id, deletedAt: null },
      include: {
        lrs: { include: { lr: { include: { items: true } } } },
        charges: true,
        lines: true,
      },
    });
    if (!invoice) return null;
    const [firm, party, bank, cities, vehicles] = await Promise.all([
      tx.firm.findUnique({ where: { id: invoice.firmId } }),
      tx.party.findUnique({ where: { id: invoice.partyId } }),
      invoice.bankPartyId
        ? tx.party.findUnique({ where: { id: invoice.bankPartyId } })
        : Promise.resolve(null),
      tx.city.findMany(),
      tx.vehicle.findMany(),
    ]);
    return { invoice, firm, party, bank, cities, vehicles };
  });

  if (!data) notFound();
  const { invoice, firm, party, bank, cities, vehicles } = data;
  const cityName = (id: string) => cities.find((c) => c.id === id)?.name ?? "";
  const vehicleNo = (id: string | null) =>
    id ? vehicles.find((v) => v.id === id)?.number ?? "" : "";

  const gstTotal = round2(
    toNum(invoice.cgstAmt) + toNum(invoice.sgstAmt) + toNum(invoice.igstAmt)
  );
  const rcm = invoice.reverseCharge && gstTotal === 0;
  const lrRows = invoice.lrs.map(({ lr }) => ({
    id: lr.id,
    lrNo: lr.lrNo,
    lrDate: lr.lrDate,
    source: cityName(lr.sourceCityId),
    dest: cityName(lr.destCityId),
    vehicle: vehicleNo(lr.vehicleId) || lr.vehicleText || "",
    obdNo: lr.obdNo ?? "",
    qty: lr.items.reduce((s, i) => s + toNum(i.qty), 0),
    chargeWt: lr.items.reduce((s, i) => s + toNum(i.chargeWt), 0),
    amount: toNum(lr.total),
  }));

  return (
    <div className="bg-white p-4 text-black">
      <PrintToolbar />
      <div className="mx-auto max-w-[190mm] border border-black p-4 text-sm">
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
            {KIND_TITLES[invoice.kind] ?? "BILL"}
            {rcm ? " — GST PAYABLE UNDER REVERSE CHARGE (RCM)" : ""}
          </div>
        </div>

        {/* bill details */}
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
          <div>
            <b>Bill No:</b> {invoice.invoiceNo}
          </div>
          <div>
            <b>Date:</b> {formatDate(invoice.invoiceDate)}
          </div>
          <div>
            <b>Party:</b> {party?.name}
          </div>
          <div>
            <b>Party GSTIN:</b> {party?.gstin ?? ""}
          </div>
          {invoice.vehicleText && (
            <div>
              <b>Vehicle:</b> {invoice.vehicleText}
            </div>
          )}
          {invoice.dueDate && (
            <div>
              <b>Due Date:</b> {formatDate(invoice.dueDate)}
            </div>
          )}
          {invoice.subject && (
            <div className="col-span-2">
              <b>Subject:</b> {invoice.subject}
            </div>
          )}
        </div>

        {/* LR table */}
        {lrRows.length > 0 && (
          <table className="mt-3 w-full border-collapse text-xs">
            <thead>
              <tr>
                {["#", "LR No", "Date", "From", "To", "Vehicle", "OBD No", "Qty", "Charge Wt", "Amount"].map(
                  (h) => (
                    <th key={h} className="border border-black px-1 py-0.5 text-left">
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {lrRows.map((r, i) => (
                <tr key={r.id}>
                  <td className="border border-black px-1 py-0.5">{i + 1}</td>
                  <td className="border border-black px-1 py-0.5">{r.lrNo}</td>
                  <td className="border border-black px-1 py-0.5">{formatDate(r.lrDate)}</td>
                  <td className="border border-black px-1 py-0.5">{r.source}</td>
                  <td className="border border-black px-1 py-0.5">{r.dest}</td>
                  <td className="border border-black px-1 py-0.5">{r.vehicle}</td>
                  <td className="border border-black px-1 py-0.5">{r.obdNo}</td>
                  <td className="border border-black px-1 py-0.5 text-right">{r.qty}</td>
                  <td className="border border-black px-1 py-0.5 text-right">{r.chargeWt}</td>
                  <td className="border border-black px-1 py-0.5 text-right">
                    {formatMoney(r.amount)}
                  </td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td colSpan={7} className="border border-black px-1 py-0.5">
                  Total ({lrRows.length} LRs)
                </td>
                <td className="border border-black px-1 py-0.5 text-right">
                  {lrRows.reduce((s, r) => s + r.qty, 0)}
                </td>
                <td className="border border-black px-1 py-0.5 text-right">
                  {round2(lrRows.reduce((s, r) => s + r.chargeWt, 0))}
                </td>
                <td className="border border-black px-1 py-0.5 text-right">
                  {formatMoney(toNum(invoice.total))}
                </td>
              </tr>
            </tbody>
          </table>
        )}

        {/* bill lines (manual / GST) */}
        {invoice.lines.length > 0 && (
          <table className="mt-3 w-full border-collapse text-xs">
            <thead>
              <tr>
                {["#", "Particulars", "UOM", "Qty", "Rate", "Amount"].map((h) => (
                  <th key={h} className="border border-black px-1 py-0.5 text-left">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {invoice.lines.map((l, i) => (
                <tr key={l.id}>
                  <td className="border border-black px-1 py-0.5">{i + 1}</td>
                  <td className="border border-black px-1 py-0.5">
                    {l.productName}
                    {l.description ? ` — ${l.description}` : ""}
                  </td>
                  <td className="border border-black px-1 py-0.5">{l.uom ?? ""}</td>
                  <td className="border border-black px-1 py-0.5 text-right">{toNum(l.qty)}</td>
                  <td className="border border-black px-1 py-0.5 text-right">{toNum(l.rate)}</td>
                  <td className="border border-black px-1 py-0.5 text-right">
                    {formatMoney(toNum(l.amount))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* charges + totals */}
        <div className="mt-3 flex gap-4">
          <div className="w-1/2 text-xs">
            {invoice.charges.length > 0 && (
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className="border border-black px-1 py-0.5 text-left">Additional Charge</th>
                    <th className="border border-black px-1 py-0.5 text-left">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.charges.map((c) => (
                    <tr key={c.id}>
                      <td className="border border-black px-1 py-0.5">
                        {c.chargeType}
                        {c.description ? ` — ${c.description}` : ""}
                      </td>
                      <td className="border border-black px-1 py-0.5 text-right">
                        {formatMoney(toNum(c.amount))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {bank && (
              <div className="mt-2 rounded border border-black p-1">
                <b>Bank Details:</b> {bank.bankName ?? bank.name}
                {bank.bankAccount ? ` | A/c: ${bank.bankAccount}` : ""}
                {bank.bankIfsc ? ` | IFSC: ${bank.bankIfsc}` : ""}
              </div>
            )}
            {invoice.remarks && (
              <div className="mt-2">
                <b>Remarks:</b> {invoice.remarks}
              </div>
            )}
          </div>
          <table className="w-1/2 border-collapse text-xs">
            <tbody>
              {(
                [
                  ["Grand Total (before tax)", toNum(invoice.grandTotal)],
                  ...(gstTotal > 0
                    ? ([
                        ["CGST", toNum(invoice.cgstAmt)],
                        ["SGST", toNum(invoice.sgstAmt)],
                        ["IGST", toNum(invoice.igstAmt)],
                      ] as [string, number][])
                    : []),
                  ["Net Total", toNum(invoice.netTotal)],
                  ["Less: Advance", toNum(invoice.advance)],
                  ["Balance", toNum(invoice.balance)],
                ] as [string, number][]
              ).map(([label, v]) => (
                <tr key={label} className={label === "Balance" ? "font-bold" : undefined}>
                  <td className="border border-black px-1 py-0.5">{label}</td>
                  <td className="border border-black px-1 py-0.5 text-right">{formatMoney(v)}</td>
                </tr>
              ))}
              {rcm && (
                <tr>
                  <td colSpan={2} className="border border-black px-1 py-0.5 text-center">
                    GST payable by the recipient under Reverse Charge Mechanism (RCM)
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-8 flex justify-between text-xs">
          <div>Receiver Signature</div>
          <div>For {firm?.name}</div>
        </div>
      </div>
    </div>
  );
}
