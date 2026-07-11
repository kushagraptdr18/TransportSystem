import type { Prisma } from "@prisma/client";
import { requireSession } from "@/lib/session";
import { authorize } from "@/lib/authz";
import { withTenant } from "@/lib/db";
import { formatDate, toNum } from "@/lib/utils";
import { DocModule } from "@/components/data/doc-module";
import { savePurchase, deletePurchase } from "./actions";

export const dynamic = "force-dynamic";

export default async function PurchasePage({
  searchParams,
}: {
  searchParams: { date_from?: string; date_to?: string; supplier?: string };
}) {
  const session = requireSession();
  await authorize(session, "maintenance", "view");

  const { rows, suppliers, vehicles } = await withTenant(session.tenantId, async (tx) => {
    const where: Prisma.PurchaseWhereInput = {
      firmId: session.firmId,
      fyId: session.fyId,
      deletedAt: null,
      kind: "PURCHASE",
    };
    if (searchParams.supplier) where.buyerId = searchParams.supplier;
    if (searchParams.date_from || searchParams.date_to) {
      where.invoiceDate = {
        ...(searchParams.date_from ? { gte: new Date(searchParams.date_from + "T00:00:00") } : {}),
        ...(searchParams.date_to ? { lte: new Date(searchParams.date_to + "T23:59:59") } : {}),
      };
    }
    const [rows, suppliers, vehicles] = await Promise.all([
      tx.purchase.findMany({ where, orderBy: [{ invoiceDate: "desc" }, { invoiceNo: "desc" }] }),
      tx.party.findMany({ where: { isActive: true, ledgerGroup: "SUPPLIERS" }, orderBy: { name: "asc" } }),
      tx.vehicle.findMany({ where: { isActive: true }, orderBy: { number: "asc" } }),
    ]);
    return { rows, suppliers, vehicles };
  });

  const supplierById = new Map(suppliers.map((s) => [s.id, s.name]));
  const vehicleById = new Map(vehicles.map((v) => [v.id, v.number]));
  const n = (v: unknown) => toNum(String(v));

  return (
    <DocModule
      title="Purchase"
      newLabel="New Purchase"
      exportName="purchases"
      canDelete={session.role === "ADMIN" || session.role === "OWNER"}
      save={savePurchase}
      remove={deletePurchase}
      rows={rows.map((r) => ({
        id: r.id,
        invoiceNo: r.invoiceNo,
        refNo: r.refNo ?? "",
        invoiceDate: formatDate(r.invoiceDate),
        invType: r.invType,
        buyerId: r.buyerId,
        supplierName: (r.buyerId && supplierById.get(r.buyerId)) || "",
        vehicleId: r.vehicleId,
        vehicleNumber: (r.vehicleId && vehicleById.get(r.vehicleId)) || "",
        challanNo: r.challanNo ?? "",
        challanDate: r.challanDate ? formatDate(r.challanDate) : "",
        orderNo: r.orderNo ?? "",
        orderDate: r.orderDate ? formatDate(r.orderDate) : "",
        transMode: r.transMode ?? "",
        supplyPlace: r.supplyPlace ?? "",
        totTaxable: n(r.totTaxable),
        discAmt: n(r.discAmt),
        totCgst: n(r.totCgst),
        totSgst: n(r.totSgst),
        totIgst: n(r.totIgst),
        freight: n(r.freight),
        others: n(r.others),
        tcsAmt: n(r.tcsAmt),
        grandTotal: n(r.grandTotal),
        advance: n(r.advance),
        balance: n(r.balance),
        narration: r.narration ?? "",
      }))}
      columns={[
        { key: "invoiceNo", header: "Invoice No" },
        { key: "invoiceDate", header: "Date" },
        { key: "supplierName", header: "Supplier" },
        { key: "vehicleNumber", header: "Vehicle" },
        { key: "invType", header: "Cash/Credit", kind: "badge" },
        { key: "totTaxable", header: "Taxable", kind: "money" },
        { key: "grandTotal", header: "Grand Total", kind: "money" },
        { key: "advance", header: "Advance", kind: "money" },
        { key: "balance", header: "Balance", kind: "money" },
      ]}
      filters={[
        { type: "daterange", key: "date", label: "Invoice Date" },
        {
          type: "combobox",
          key: "supplier",
          label: "Supplier",
          options: suppliers.map((s) => ({ value: s.id, label: s.name })),
        },
      ]}
      fields={[
        { name: "invoiceNo", label: "Invoice No (blank = auto)", type: "text" },
        { name: "invoiceDate", label: "Invoice Date *", type: "date" },
        {
          name: "invType",
          label: "Cash / Credit",
          type: "radio",
          options: [
            { value: "CREDIT", label: "Credit" },
            { value: "CASH", label: "Cash" },
          ],
        },
        {
          name: "buyerId",
          label: "Supplier",
          type: "combobox",
          options: suppliers.map((s) => ({ value: s.id, label: s.name })),
        },
        {
          name: "vehicleId",
          label: "Vehicle",
          type: "combobox",
          options: vehicles.map((v) => ({ value: v.id, label: v.number })),
        },
        { name: "refNo", label: "Ref No", type: "text" },
        { name: "challanNo", label: "Challan No", type: "text" },
        { name: "challanDate", label: "Challan Date", type: "date" },
        { name: "orderNo", label: "Order No", type: "text" },
        { name: "orderDate", label: "Order Date", type: "date" },
        { name: "transMode", label: "Transport Mode", type: "text" },
        { name: "supplyPlace", label: "Place of Supply", type: "text" },
        { name: "totTaxable", label: "Taxable Amount", type: "number" },
        { name: "discAmt", label: "Discount", type: "number" },
        { name: "totCgst", label: "CGST", type: "number" },
        { name: "totSgst", label: "SGST", type: "number" },
        { name: "totIgst", label: "IGST", type: "number" },
        { name: "freight", label: "Freight", type: "number" },
        { name: "others", label: "Others", type: "number" },
        { name: "tcsAmt", label: "TCS", type: "number" },
        { name: "advance", label: "Advance", type: "number" },
        { name: "narration", label: "Narration", type: "textarea", span2: true },
      ]}
      defaults={{ invoiceNo: "", invoiceDate: formatDate(new Date()), invType: "CREDIT" }}
      numericFields={[
        "totTaxable",
        "discAmt",
        "totCgst",
        "totSgst",
        "totIgst",
        "freight",
        "others",
        "tcsAmt",
        "advance",
      ]}
    />
  );
}
