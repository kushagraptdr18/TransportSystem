import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { formatDate, formatMoney, toNum } from "@/lib/utils";
import { round2 } from "@/lib/calc/tds";
import { gstSplit, stateCodeFromGstin } from "@/lib/calc/gst";
import {
  InvoicePrintView,
  type InvoiceViewData,
} from "@/components/billing/invoice-print-view";
import { PrintToolbar } from "./print-toolbar";

export const dynamic = "force-dynamic";

export default async function InvoicePrintPage({ params }: { params: { id: string } }) {
  const session = requireSession();

  const data = await withTenant(session.tenantId, async (tx) => {
    const invoice = await tx.invoice.findFirst({
      where: { id: params.id, deletedAt: null },
      include: {
        lrs: { include: { lr: { include: { items: true, pods: true } } } },
        charges: true,
        lines: true,
      },
    });
    if (!invoice) return null;
    const [firm, party, bank, cities, vehicles, parties, states] = await Promise.all([
      tx.firm.findUnique({ where: { id: invoice.firmId } }),
      tx.party.findUnique({ where: { id: invoice.partyId } }),
      invoice.bankPartyId
        ? tx.party.findUnique({ where: { id: invoice.bankPartyId } })
        : Promise.resolve(null),
      tx.city.findMany(),
      tx.vehicle.findMany(),
      tx.party.findMany(),
      tx.state.findMany(),
    ]);
    return { invoice, firm, party, bank, cities, vehicles, parties, states };
  });

  if (!data) notFound();
  const { invoice, firm, party, bank, cities, vehicles, parties, states } = data;
  const cityName = (id: string) => cities.find((c) => c.id === id)?.name ?? "";
  const partyName = (id: string) => parties.find((p) => p.id === id)?.name ?? "";
  const vehicleNo = (id: string | null) =>
    id ? vehicles.find((v) => v.id === id)?.number ?? "" : "";
  const stateOf = (stateId: string | null | undefined, gstin: string | null | undefined) => {
    const st = stateId ? states.find((s) => s.id === stateId) : null;
    return {
      name: st?.name ?? "",
      code: st?.gstCode ?? stateCodeFromGstin(gstin) ?? "",
    };
  };

  const firmState = stateOf(firm?.stateId, firm?.gstin);
  const partyState = stateOf(party?.stateId, party?.gstin);
  const gstTotal = round2(
    toNum(invoice.cgstAmt) + toNum(invoice.sgstAmt) + toNum(invoice.igstAmt)
  );
  const firmGstPct = firm
    ? toNum(firm.cgstPct) + toNum(firm.sgstPct) || toNum(firm.igstPct)
    : 0;
  const rcm = invoice.reverseCharge && gstTotal === 0;
  const rcmSplit = rcm
    ? gstSplit({
        taxableValue: toNum(invoice.grandTotal),
        gstPct: firmGstPct,
        supplierStateCode: firmState.code || null,
        recipientStateCode: partyState.code || null,
      })
    : null;

  const invGstPct =
    toNum(invoice.cgstPct) + toNum(invoice.sgstPct) || toNum(invoice.igstPct) || firmGstPct;

  const viewData: InvoiceViewData = {
    billNo: invoice.invoiceNo,
    billDate: formatDate(invoice.invoiceDate),
    placeOfSupply: invoice.placeOfSupply || partyState.name || "",
    gstPct: invGstPct,
    firm: {
      name: firm?.name ?? "",
      address: [firm?.address1, firm?.address2].filter(Boolean).join(", "),
      mobile: firm?.mobile ?? "",
      email: firm?.email ?? "",
      gstin: firm?.gstin ?? "",
      pan: firm?.pan ?? "",
      stateName: firmState.name,
      stateCode: firmState.code,
      ibaCode: firm?.ibaCode ?? "",
      vendorCode: firm?.vendorCode ?? "",
      rcmCovered: firm?.rcmCovered ?? true,
    },
    tdsPct: toNum(invoice.tdsPct) || 1,
    serviceDescription: "Goods Transport Service",
    sacCode: invoice.sacCode || "996791",
    party: {
      name: party?.name ?? "",
      address: [party?.address1, party?.address2].filter(Boolean).join(", "),
      gstin: party?.gstin ?? "",
      pan: party?.pan ?? "",
      stateName: partyState.name,
      stateCode: partyState.code,
      vendorCode: party?.vendorCode ?? "",
    },
    lrs: invoice.lrs.map(({ lr }) => ({
      id: lr.id,
      lrNo: lr.lrNo,
      lrDate: formatDate(lr.lrDate),
      source: cityName(lr.sourceCityId),
      dest: cityName(lr.destCityId),
      obdNo: lr.obdNo ?? "",
      // PO / gate entry come from the POD entry, falling back to the LR fields
      poNumber: lr.pods[0]?.poNumber || lr.poNumber || "",
      gateEntryNo: lr.pods[0]?.gateEntryNo || lr.gateEntryNo || "",
      invoiceNo: lr.invoiceNo ?? "",
      vehicle: vehicleNo(lr.vehicleId) || lr.vehicleText || "",
      material: lr.items.map((i) => i.productName).filter(Boolean).join(", "),
      consignee: partyName(lr.consigneeId),
      unloadDate: lr.pods[0]?.unloadDate ? formatDate(lr.pods[0].unloadDate) : "",
      qty: lr.items.reduce((s, i) => s + toNum(i.qty), 0),
      actualWt: lr.items.reduce((s, i) => s + toNum(i.actualWt), 0),
      chargeWt: lr.items.reduce((s, i) => s + toNum(i.chargeWt), 0),
      rate: lr.items.length ? Math.max(...lr.items.map((i) => toNum(i.rate))) : 0,
      amount: toNum(lr.total),
    })),
    charges: invoice.charges.map((c) => ({
      label: [c.chargeType, c.description].filter(Boolean).join(" — "),
      relatedLrs: c.relatedLrs ?? "",
      amount: toNum(c.amount),
    })),
    totals: {
      total: toNum(invoice.total),
      grandTotal: toNum(invoice.grandTotal),
      cgstAmt: toNum(invoice.cgstAmt),
      sgstAmt: toNum(invoice.sgstAmt),
      igstAmt: toNum(invoice.igstAmt),
      netTotal: toNum(invoice.netTotal),
      advance: toNum(invoice.advance),
      balance: toNum(invoice.balance),
    },
    rcm: rcmSplit
      ? {
          taxableValue: toNum(invoice.grandTotal),
          pct: firmGstPct,
          cgst: rcmSplit.cgst,
          sgst: rcmSplit.sgst,
          igst: rcmSplit.igst,
        }
      : null,
    gstApplied: gstTotal > 0,
    remarks: invoice.remarks ?? "",
    bank: bank
      ? [bank.bankName ?? bank.name, bank.bankAccount && `A/c: ${bank.bankAccount}`, bank.bankIfsc && `IFSC: ${bank.bankIfsc}`]
          .filter(Boolean)
          .join(" | ")
      : "",
  };

  return (
    <div className="bg-white p-4 text-black">
      <PrintToolbar />
      {invoice.lrs.length > 0 ? (
        <InvoicePrintView data={viewData} />
      ) : (
        /* lines-based bills (Manual / GST): simple generic layout */
        <div className="mx-auto max-w-[190mm] border border-black p-4 text-sm">
          <div className="border-b border-black pb-2 text-center">
            <div className="text-xl font-bold uppercase">{firm?.name}</div>
            <div className="text-xs">
              {[firm?.address1, firm?.address2].filter(Boolean).join(", ")}
            </div>
            <div className="text-xs">
              {[
                firm?.mobile && `Mob: ${firm.mobile}`,
                firm?.gstin && `GSTIN: ${firm.gstin}`,
                firm?.pan && `PAN: ${firm.pan}`,
              ]
                .filter(Boolean)
                .join(" | ")}
            </div>
            <div className="mt-1 text-sm font-semibold">
              {invoice.kind === "GST" ? "TAX INVOICE" : "BILL"}
            </div>
          </div>
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
          </div>
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
          <table className="ml-auto mt-3 w-1/2 border-collapse text-xs">
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
            </tbody>
          </table>
          <div className="mt-8 flex justify-between text-xs">
            <div>Receiver Signature</div>
            <div>For {firm?.name}</div>
          </div>
        </div>
      )}
    </div>
  );
}
