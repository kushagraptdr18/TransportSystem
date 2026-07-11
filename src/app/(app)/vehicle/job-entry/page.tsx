import type { Prisma } from "@prisma/client";
import { requireSession } from "@/lib/session";
import { authorize } from "@/lib/authz";
import { withTenant } from "@/lib/db";
import { formatDate, toNum } from "@/lib/utils";
import { DocModule } from "@/components/data/doc-module";
import { saveJobEntry, deleteJobEntry } from "./actions";

export const dynamic = "force-dynamic";

export default async function JobEntryPage({
  searchParams,
}: {
  searchParams: { date_from?: string; date_to?: string; vehicle?: string };
}) {
  const session = requireSession();
  await authorize(session, "maintenance", "view");

  const { rows, vehicles, suppliers } = await withTenant(session.tenantId, async (tx) => {
    const where: Prisma.JobEntryWhereInput = {
      firmId: session.firmId,
      fyId: session.fyId,
      deletedAt: null,
    };
    if (searchParams.vehicle) where.vehicleId = searchParams.vehicle;
    if (searchParams.date_from || searchParams.date_to) {
      where.invoiceDate = {
        ...(searchParams.date_from ? { gte: new Date(searchParams.date_from + "T00:00:00") } : {}),
        ...(searchParams.date_to ? { lte: new Date(searchParams.date_to + "T23:59:59") } : {}),
      };
    }
    const [rows, vehicles, suppliers] = await Promise.all([
      tx.jobEntry.findMany({ where, orderBy: [{ invoiceDate: "desc" }, { invoiceNo: "desc" }] }),
      tx.vehicle.findMany({ where: { isActive: true }, orderBy: { number: "asc" } }),
      tx.party.findMany({ where: { isActive: true, ledgerGroup: "SUPPLIERS" }, orderBy: { name: "asc" } }),
    ]);
    return { rows, vehicles, suppliers };
  });

  const vehicleById = new Map(vehicles.map((v) => [v.id, v.number]));
  const supplierById = new Map(suppliers.map((s) => [s.id, s.name]));
  const n = (v: unknown) => toNum(String(v));

  return (
    <DocModule
      title="Job Entry (Workshop Invoice)"
      newLabel="New Job Entry"
      exportName="job-entries"
      canDelete={session.role === "ADMIN" || session.role === "OWNER"}
      save={saveJobEntry}
      remove={deleteJobEntry}
      rows={rows.map((r) => ({
        id: r.id,
        invoiceNo: r.invoiceNo,
        refNo: r.refNo ?? "",
        invoiceDate: formatDate(r.invoiceDate),
        billType: r.billType,
        invType: r.invType,
        supplierId: r.supplierId,
        supplierName: (r.supplierId && supplierById.get(r.supplierId)) || "",
        vehicleId: r.vehicleId,
        vehicleNumber: (r.vehicleId && vehicleById.get(r.vehicleId)) || "",
        attenderName: r.attenderName ?? "",
        challanNo: r.challanNo ?? "",
        challanDate: r.challanDate ? formatDate(r.challanDate) : "",
        currKm: r.currKm == null ? 0 : n(r.currKm),
        kmInterval: r.kmInterval == null ? 0 : n(r.kmInterval),
        daysInterval: r.daysInterval ?? 0,
        dueDate: r.dueDate ? formatDate(r.dueDate) : "",
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
        { key: "billType", header: "Bill Type", kind: "badge" },
        { key: "supplierName", header: "Garage / Supplier" },
        { key: "vehicleNumber", header: "Vehicle" },
        { key: "totTaxable", header: "Taxable", kind: "money" },
        { key: "grandTotal", header: "Grand Total", kind: "money" },
        { key: "advance", header: "Advance", kind: "money" },
        { key: "balance", header: "Balance", kind: "money" },
        { key: "dueDate", header: "Next Service" },
      ]}
      filters={[
        { type: "daterange", key: "date", label: "Invoice Date" },
        {
          type: "combobox",
          key: "vehicle",
          label: "Vehicle",
          options: vehicles.map((v) => ({ value: v.id, label: v.number })),
        },
      ]}
      fields={[
        { name: "invoiceNo", label: "Invoice No (blank = auto)", type: "text" },
        { name: "invoiceDate", label: "Invoice Date *", type: "date" },
        {
          name: "billType",
          label: "Bill Type",
          type: "radio",
          options: [
            { value: "INVOICE", label: "Invoice" },
            { value: "ESTIMATE", label: "Estimate" },
          ],
        },
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
          name: "supplierId",
          label: "Garage / Supplier",
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
        { name: "attenderName", label: "Attender", type: "text" },
        { name: "challanNo", label: "Challan No", type: "text" },
        { name: "challanDate", label: "Challan Date", type: "date" },
        { name: "currKm", label: "Current KM", type: "number" },
        { name: "kmInterval", label: "Service Interval (KM)", type: "number" },
        { name: "daysInterval", label: "Service Interval (Days)", type: "number" },
        { name: "dueDate", label: "Next Service Due", type: "date" },
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
      defaults={{ invoiceNo: "", invoiceDate: formatDate(new Date()), billType: "INVOICE", invType: "CREDIT" }}
      numericFields={[
        "currKm",
        "kmInterval",
        "daysInterval",
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
