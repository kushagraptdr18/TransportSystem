import type { Prisma } from "@prisma/client";
import { requireSession } from "@/lib/session";
import { authorize } from "@/lib/authz";
import { withTenant } from "@/lib/db";
import { formatDate, toNum } from "@/lib/utils";
import { DocModule } from "@/components/data/doc-module";
import { saveOutwardCrossing, deleteOutwardCrossing } from "./actions";

export const dynamic = "force-dynamic";

export default async function OutwardCrossingPage({
  searchParams,
}: {
  searchParams: { date_from?: string; date_to?: string; transporter?: string };
}) {
  const session = requireSession();
  await authorize(session, "crossing", "view");

  const { rows, transporters, vehicles, cities } = await withTenant(session.tenantId, async (tx) => {
    const where: Prisma.OutwardCrossingWhereInput = {
      firmId: session.firmId,
      fyId: session.fyId,
      deletedAt: null,
    };
    if (searchParams.transporter) where.transporterId = searchParams.transporter;
    if (searchParams.date_from || searchParams.date_to) {
      where.chalanDate = {
        ...(searchParams.date_from ? { gte: new Date(searchParams.date_from + "T00:00:00") } : {}),
        ...(searchParams.date_to ? { lte: new Date(searchParams.date_to + "T23:59:59") } : {}),
      };
    }
    const [rows, transporters, vehicles, cities] = await Promise.all([
      tx.outwardCrossing.findMany({ where, orderBy: [{ chalanDate: "desc" }, { ocNo: "desc" }] }),
      tx.party.findMany({ where: { isActive: true, ledgerGroup: "OWNER_BROKER" }, orderBy: { name: "asc" } }),
      tx.vehicle.findMany({ where: { isActive: true }, orderBy: { number: "asc" } }),
      tx.city.findMany({ orderBy: { name: "asc" } }),
    ]);
    return { rows, transporters, vehicles, cities };
  });

  const partyById = new Map(transporters.map((p) => [p.id, p.name]));
  const vehicleById = new Map(vehicles.map((v) => [v.id, v.number]));
  const cityById = new Map(cities.map((c) => [c.id, c.name]));
  const n = (v: unknown) => toNum(String(v));

  return (
    <DocModule
      title="Outward Crossing"
      exportName="outward-crossings"
      canDelete={session.role === "ADMIN" || session.role === "OWNER"}
      save={saveOutwardCrossing}
      remove={deleteOutwardCrossing}
      rows={rows.map((r) => ({
        id: r.id,
        ocNo: r.ocNo,
        chalanDate: formatDate(r.chalanDate),
        arrivalNo: r.arrivalNo ?? "",
        arrivalDate: r.arrivalDate ? formatDate(r.arrivalDate) : "",
        vehicleId: r.vehicleId,
        vehicleNumber: (r.vehicleId && vehicleById.get(r.vehicleId)) || "",
        transporterId: r.transporterId,
        transporterName: (r.transporterId && partyById.get(r.transporterId)) || "",
        sourceCityId: r.sourceCityId,
        sourceName: (r.sourceCityId && cityById.get(r.sourceCityId)) || "",
        destCityId: r.destCityId,
        destName: (r.destCityId && cityById.get(r.destCityId)) || "",
        lrType: r.lrType,
        unit: r.unit ?? "",
        remarks: r.remarks ?? "",
        totalQty: n(r.totalQty),
        totalWt: n(r.totalWt),
        totFreight: n(r.totFreight),
        crossingFreight: n(r.crossingFreight),
        grandTotal: n(r.grandTotal),
      }))}
      columns={[
        { key: "ocNo", header: "OC No" },
        { key: "chalanDate", header: "Date" },
        { key: "transporterName", header: "Transporter" },
        { key: "vehicleNumber", header: "Vehicle" },
        { key: "sourceName", header: "From" },
        { key: "destName", header: "To" },
        { key: "lrType", header: "LR Type", kind: "badge" },
        { key: "totalQty", header: "Qty", kind: "money", total: false },
        { key: "totFreight", header: "Freight", kind: "money" },
        { key: "crossingFreight", header: "Crossing Freight", kind: "money" },
        { key: "grandTotal", header: "Grand Total", kind: "money" },
      ]}
      filters={[
        { type: "daterange", key: "date", label: "Chalan Date" },
        {
          type: "combobox",
          key: "transporter",
          label: "Transporter",
          options: transporters.map((p) => ({ value: p.id, label: p.name })),
        },
      ]}
      fields={[
        { name: "ocNo", label: "OC No (blank = auto)", type: "text" },
        { name: "chalanDate", label: "Chalan Date *", type: "date" },
        { name: "arrivalNo", label: "Arrival No", type: "text" },
        { name: "arrivalDate", label: "Arrival Date", type: "date" },
        {
          name: "transporterId",
          label: "Transporter",
          type: "combobox",
          options: transporters.map((p) => ({ value: p.id, label: p.name })),
        },
        {
          name: "vehicleId",
          label: "Vehicle",
          type: "combobox",
          options: vehicles.map((v) => ({ value: v.id, label: v.number })),
        },
        {
          name: "sourceCityId",
          label: "From",
          type: "combobox",
          options: cities.map((c) => ({ value: c.id, label: c.name })),
        },
        {
          name: "destCityId",
          label: "To",
          type: "combobox",
          options: cities.map((c) => ({ value: c.id, label: c.name })),
        },
        {
          name: "lrType",
          label: "LR Type",
          type: "select",
          options: [
            { value: "TO_PAY", label: "To Pay" },
            { value: "TBB", label: "TBB" },
            { value: "PAID", label: "Paid" },
            { value: "FOC", label: "FOC" },
          ],
        },
        { name: "unit", label: "Unit", type: "text" },
        { name: "totalQty", label: "Total Qty", type: "number" },
        { name: "totalWt", label: "Total Weight", type: "number" },
        { name: "totFreight", label: "Total Freight", type: "number" },
        { name: "crossingFreight", label: "Crossing Freight", type: "number" },
        { name: "remarks", label: "Remarks", type: "textarea", span2: true },
      ]}
      defaults={{ ocNo: "", chalanDate: formatDate(new Date()), lrType: "TO_PAY" }}
      numericFields={["totalQty", "totalWt", "totFreight", "crossingFreight"]}
    />
  );
}
