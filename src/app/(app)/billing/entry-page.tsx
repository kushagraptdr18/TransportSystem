import type { InvoiceKind } from "@prisma/client";
import { requireSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { stateCodeFromGstin } from "@/lib/calc/gst";
import { toNum } from "@/lib/utils";
import { InvoiceForm } from "@/components/billing/invoice-form";
import { getInvoiceForEdit, type BillingDefaults } from "./actions";

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

  const { firm, parties, banks } = await withTenant(session.tenantId, async (tx) => {
    const [firm, partyRows, bankRows] = await Promise.all([
      tx.firm.findUnique({ where: { id: session.firmId } }),
      tx.party.findMany({
        where: { isActive: true, ledgerGroup: "CONSIGNEE_CONSIGNOR" },
        orderBy: { name: "asc" },
      }),
      tx.party.findMany({
        where: { isActive: true, ledgerGroup: { in: ["BANK", "CASH"] } },
        orderBy: { name: "asc" },
      }),
    ]);
    return { firm, parties: partyRows, banks: bankRows };
  });

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
        initial={initial && initial.kind === kind ? initial : null}
        partyOptions={parties.map((p) => ({
          value: p.id,
          label: p.name,
          meta: [p.gstin, p.pan].filter(Boolean).join(" · ") || undefined,
        }))}
        bankOptions={banks.map((b) => ({ value: b.id, label: b.name }))}
        defaults={defaults}
      />
    </div>
  );
}
