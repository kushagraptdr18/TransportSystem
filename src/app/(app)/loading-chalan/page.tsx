import type { Prisma } from "@prisma/client";
import { requireSession } from "@/lib/session";
import { authorize } from "@/lib/authz";
import { withTenant } from "@/lib/db";
import { formatDate, toNum } from "@/lib/utils";
import { DocModule } from "@/components/data/doc-module";
import { saveLoadingChalan, deleteLoadingChalan } from "./actions";

export const dynamic = "force-dynamic";

export default async function LoadingChalanPage({
  searchParams,
}: {
  searchParams: { date_from?: string; date_to?: string; vehicle?: string };
}) {
  const session = requireSession();
  await authorize(session, "loading", "view");

  const { rows, vehicles, brokers, cities } = await withTenant(session.tenantId, async (tx) => {
    const where: Prisma.LoadingChalanWhereInput = {
      firmId: session.firmId,
      fyId: session.fyId,
      deletedAt: null,
    };
    if (searchParams.vehicle) where.vehicleId = searchParams.vehicle;
    if (searchParams.date_from || searchParams.date_to) {
      where.chalanDate = {
        ...(searchParams.date_from ? { gte: new Date(searchParams.date_from + "T00:00:00") } : {}),
        ...(searchParams.date_to ? { lte: new Date(searchParams.date_to + "T23:59:59") } : {}),
      };
    }
    const [rows, vehicles, brokers, cities] = await Promise.all([
      tx.loadingChalan.findMany({ where, orderBy: [{ chalanDate: "desc" }, { chalanNo: "desc" }] }),
      tx.vehicle.findMany({ where: { isActive: true }, orderBy: { number: "asc" } }),
      tx.party.findMany({ where: { isActive: true, ledgerGroup: "OWNER_BROKER" }, orderBy: { name: "asc" } }),
      tx.city.findMany({ orderBy: { name: "asc" } }),
    ]);
    return { rows, vehicles, brokers, cities };
  });

  const vehicleById = new Map(vehicles.map((v) => [v.id, v.number]));
  const cityById = new Map(cities.map((c) => [c.id, c.name]));
  const vehicleOptions = vehicles.map((v) => ({ value: v.id, label: v.number }));
  const brokerOptions = brokers.map((b) => ({ value: b.id, label: b.name }));
  const cityOptions = cities.map((c) => ({ value: c.id, label: c.name }));
  const n = (v: unknown) => toNum(String(v));

  return (
    <DocModule
      title="Loading Challan"
      exportName="loading-chalans"
      canDelete={session.role === "ADMIN" || session.role === "OWNER"}
      save={saveLoadingChalan}
      remove={deleteLoadingChalan}
      rows={rows.map((r) => ({
        id: r.id,
        chalanNo: r.chalanNo,
        chalanDate: formatDate(r.chalanDate),
        type: r.type,
        vehicleId: r.vehicleId,
        vehicleNumber: (r.vehicleId && vehicleById.get(r.vehicleId)) || "",
        driverName: r.driverName ?? "",
        driverMobile: r.driverMobile ?? "",
        licenseNo: r.licenseNo ?? "",
        vehicleOwner: r.vehicleOwner ?? "",
        brokerId: r.brokerId,
        sourceCityId: r.sourceCityId,
        sourceName: (r.sourceCityId && cityById.get(r.sourceCityId)) || "",
        destCityId: r.destCityId,
        destName: (r.destCityId && cityById.get(r.destCityId)) || "",
        remarks: r.remarks ?? "",
        totFreight: n(r.totFreight),
        truckFreight: n(r.truckFreight),
        advance: n(r.advance),
        commAmt: n(r.commAmt),
        lcCharge: n(r.lcCharge),
        dcCharge: n(r.dcCharge),
        cfCharge: n(r.cfCharge),
        totCrossing: n(r.totCrossing),
        netAmount: n(r.netAmount),
      }))}
      columns={[
        { key: "chalanNo", header: "Chalan No" },
        { key: "chalanDate", header: "Date" },
        { key: "type", header: "Type", kind: "badge" },
        { key: "vehicleNumber", header: "Vehicle" },
        { key: "sourceName", header: "From" },
        { key: "destName", header: "To" },
        { key: "totFreight", header: "Total Freight", kind: "money" },
        { key: "truckFreight", header: "Truck Freight", kind: "money" },
        { key: "advance", header: "Advance", kind: "money" },
        { key: "netAmount", header: "Net Amount", kind: "money" },
      ]}
      filters={[
        { type: "daterange", key: "date", label: "Chalan Date" },
        { type: "combobox", key: "vehicle", label: "Vehicle", options: vehicleOptions },
      ]}
      fields={[
        { name: "chalanNo", label: "Chalan No (blank = auto)", type: "text" },
        { name: "chalanDate", label: "Chalan Date *", type: "date" },
        {
          name: "type",
          label: "Type",
          type: "radio",
          options: [
            { value: "DIRECT", label: "Direct" },
            { value: "CROSSING", label: "Crossing" },
          ],
        },
        { name: "vehicleId", label: "Vehicle", type: "combobox", options: vehicleOptions },
        { name: "brokerId", label: "Broker / Owner", type: "combobox", options: brokerOptions },
        { name: "vehicleOwner", label: "Owner Name (text)", type: "text" },
        { name: "driverName", label: "Driver", type: "text" },
        { name: "driverMobile", label: "Driver Mobile", type: "text" },
        { name: "licenseNo", label: "License No", type: "text" },
        { name: "sourceCityId", label: "From", type: "combobox", options: cityOptions },
        { name: "destCityId", label: "To", type: "combobox", options: cityOptions },
        { name: "totFreight", label: "Total LR Freight", type: "number" },
        { name: "truckFreight", label: "Truck Freight", type: "number" },
        { name: "advance", label: "Advance", type: "number" },
        { name: "commAmt", label: "Commission", type: "number" },
        { name: "lcCharge", label: "LC Charge", type: "number" },
        { name: "dcCharge", label: "DC Charge", type: "number" },
        { name: "cfCharge", label: "CF Charge", type: "number" },
        { name: "totCrossing", label: "Total Crossing", type: "number" },
        { name: "remarks", label: "Remarks", type: "textarea", span2: true },
      ]}
      defaults={{ chalanNo: "", chalanDate: formatDate(new Date()), type: "DIRECT" }}
      numericFields={[
        "totFreight",
        "truckFreight",
        "advance",
        "commAmt",
        "lcCharge",
        "dcCharge",
        "cfCharge",
        "totCrossing",
      ]}
    />
  );
}
