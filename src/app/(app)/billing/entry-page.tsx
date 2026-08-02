import type { InvoiceKind } from "@prisma/client";
import { requireSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { stateCodeFromGstin } from "@/lib/calc/gst";
import { firmImageUrl } from "@/lib/branding";
import { toNum } from "@/lib/utils";
import { InvoiceForm } from "@/components/billing/invoice-form";
import { getInvoiceForEdit, type BillingDefaults } from "./actions";
import { randomUniqueDocNumber } from "@/lib/sequences";

const TITLES: Record<InvoiceKind, string> = {
  PART_TRUCK: "Part Truck Billing",
  FULL_TRUCK: "Full Truck Billing",
  MANUAL: "Manual Billing",
  GST: "GST Billing",
};

/** Shared server component behind /billing/part-truck|full-truck|manual|gst. */
export async function InvoiceEntryPage({
  kind,
  searchParams,
}: {
  kind: InvoiceKind;
  searchParams: { id?: string };
}) {
  const session = requireSession();

  const { firm, parties, banks, suggestedNo, prevInvoiceNo, chargeHeads, states } = await withTenant(
    session.tenantId,
    async (tx) => {
      // FULL_TRUCK: invoice no starts blank; the last saved bill no is shown for reference only
      const suggestedNo =
        kind === "FULL_TRUCK"
          ? ""
          : await randomUniqueDocNumber(async (n) =>
              Boolean(
                await tx.invoice.findFirst({
                  where: { firmId: session.firmId, fyId: session.fyId, kind, invoiceNo: n },
                  select: { id: true },
                })
              )
            );
      const [firm, partyRows, bankRows, prevInvoice, chargeHeads, states] = await Promise.all([
        tx.firm.findUnique({ where: { id: session.firmId } }),
        tx.party.findMany({
          where: { isActive: true, ledgerGroup: "CONSIGNEE_CONSIGNOR" },
          orderBy: { name: "asc" },
        }),
        tx.party.findMany({
          where: { isActive: true, ledgerGroup: { in: ["BANK", "CASH"] } },
          orderBy: { name: "asc" },
        }),
        tx.invoice.findFirst({
          where: { firmId: session.firmId, fyId: session.fyId, kind, deletedAt: null },
          orderBy: { createdAt: "desc" },
          select: { invoiceNo: true },
        }),
        tx.accountHead.findMany({ orderBy: { name: "asc" } }),
        tx.state.findMany(),
      ]);
      return {
        firm,
        parties: partyRows,
        banks: bankRows,
        suggestedNo,
        prevInvoiceNo: prevInvoice?.invoiceNo ?? null,
        chargeHeads,
        states,
      };
    }
  );

  const defaults: BillingDefaults = {
    defaultBankPartyId: firm?.defaultBankPartyId ?? null,
    defaultTdsPct: firm ? toNum(String(firm.defaultTdsPct)) : 1,
    firmStateCode: stateCodeFromGstin(firm?.gstin),
    firmGstPct: firm
      ? toNum(String(firm.cgstPct)) + toNum(String(firm.sgstPct)) || toNum(String(firm.igstPct))
      : 0,
  };

  const initial = searchParams.id ? await getInvoiceForEdit(searchParams.id) : null;

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-semibold">
        {initial ? `Edit ${TITLES[kind]} — ${initial.invoiceNo}` : TITLES[kind]}
      </h1>
      <InvoiceForm
        kind={kind}
        suggestedInvoiceNo={suggestedNo}
        prevInvoiceNo={prevInvoiceNo}
        chargeHeadOptions={chargeHeads.map((h) => ({
          value: h.name,
          label: h.name,
          meta: h.kind,
        }))}
        firm={{
          name: firm?.name ?? "",
          address: [firm?.address1, firm?.address2].filter(Boolean).join(", "),
          gstin: firm?.gstin ?? "",
          pan: firm?.pan ?? "",
          mobile: firm?.mobile ?? "",
          email: firm?.email ?? "",
          stateName: states.find((s) => s.id === firm?.stateId)?.name ?? "",
          stateCode:
            states.find((s) => s.id === firm?.stateId)?.gstCode ??
            stateCodeFromGstin(firm?.gstin) ??
            "",
          ibaCode: firm?.ibaCode ?? "",
          vendorCode: firm?.vendorCode ?? "",
          rcmCovered: firm?.rcmCovered ?? true,
          logoUrl: firmImageUrl(firm, "logo"),
          sealUrl: firmImageUrl(firm, "seal"),
        }}
        initial={initial && initial.kind === kind ? initial : null}
        partyOptions={parties.map((p) => ({
          value: p.id,
          label: p.name,
          meta: [p.gstin, p.pan].filter(Boolean).join(" · ") || undefined,
        }))}
        bankOptions={banks.map((b) => ({ value: b.id, label: b.name }))}
        bankDetails={Object.fromEntries(
          banks.map((b) => [
            b.id,
            {
              name: b.bankName ?? b.name,
              branch: b.bankBranch ?? "",
              account: b.bankAccount ?? "",
              ifsc: b.bankIfsc ?? "",
            },
          ])
        )}
        defaults={defaults}
      />
    </div>
  );
}
