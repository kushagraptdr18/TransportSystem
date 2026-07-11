import type { Prisma } from "@prisma/client";
import { requireSession } from "@/lib/session";
import { authorize } from "@/lib/authz";
import { withTenant } from "@/lib/db";
import { formatDate, toNum } from "@/lib/utils";
import { DocModule } from "@/components/data/doc-module";
import { saveTyre, deleteTyre } from "./actions";

export const dynamic = "force-dynamic";

export default async function TyresPage({
  searchParams,
}: {
  searchParams: { vehicle?: string };
}) {
  const session = requireSession();
  await authorize(session, "maintenance", "view");

  const { rows, vehicles, products } = await withTenant(session.tenantId, async (tx) => {
    const where: Prisma.TyreInstallationWhereInput = { firmId: session.firmId };
    if (searchParams.vehicle) where.vehicleId = searchParams.vehicle;
    const [rows, vehicles, products] = await Promise.all([
      tx.tyreInstallation.findMany({ where, orderBy: { entryDate: "desc" } }),
      tx.vehicle.findMany({ where: { isActive: true }, orderBy: { number: "asc" } }),
      tx.product.findMany({ orderBy: { name: "asc" } }),
    ]);
    return { rows, vehicles, products };
  });

  const vehicleById = new Map(vehicles.map((v) => [v.id, v.number]));
  const productById = new Map(products.map((p) => [p.id, p.name]));

  return (
    <DocModule
      title="Tyre Installation"
      newLabel="New Installation"
      exportName="tyre-installations"
      canDelete={session.role === "ADMIN" || session.role === "OWNER"}
      save={saveTyre}
      remove={deleteTyre}
      rows={rows.map((r) => ({
        id: r.id,
        entryDate: formatDate(r.entryDate),
        vehicleId: r.vehicleId,
        vehicleNumber: vehicleById.get(r.vehicleId) ?? "",
        productId: r.productId,
        productName: (r.productId && productById.get(r.productId)) || "",
        position: r.position ?? "",
        partNo: r.partNo ?? "",
        instKm: r.instKm == null ? 0 : toNum(String(r.instKm)),
        uninstKm: r.uninstKm == null ? 0 : toNum(String(r.uninstKm)),
        instDate: r.instDate ? formatDate(r.instDate) : "",
        uninstDate: r.uninstDate ? formatDate(r.uninstDate) : "",
        remarks: r.remarks ?? "",
      }))}
      columns={[
        { key: "entryDate", header: "Entry Date" },
        { key: "vehicleNumber", header: "Vehicle" },
        { key: "productName", header: "Tyre / Product" },
        { key: "position", header: "Position", kind: "badge" },
        { key: "partNo", header: "Part No" },
        { key: "instDate", header: "Installed" },
        { key: "instKm", header: "Inst. KM", kind: "money", total: false },
        { key: "uninstDate", header: "Removed" },
        { key: "uninstKm", header: "Uninst. KM", kind: "money", total: false },
      ]}
      filters={[
        {
          type: "combobox",
          key: "vehicle",
          label: "Vehicle",
          options: vehicles.map((v) => ({ value: v.id, label: v.number })),
        },
      ]}
      fields={[
        { name: "entryDate", label: "Entry Date *", type: "date" },
        {
          name: "vehicleId",
          label: "Vehicle *",
          type: "combobox",
          options: vehicles.map((v) => ({ value: v.id, label: v.number })),
        },
        {
          name: "productId",
          label: "Tyre / Product",
          type: "combobox",
          options: products.map((p) => ({ value: p.id, label: p.name })),
        },
        {
          name: "position",
          label: "Position",
          type: "select",
          options: [
            { value: "FRONT", label: "Front" },
            { value: "REAR", label: "Rear" },
          ],
        },
        { name: "partNo", label: "Part / Serial No", type: "text" },
        { name: "instDate", label: "Installation Date", type: "date" },
        { name: "instKm", label: "Installation KM", type: "number" },
        { name: "uninstDate", label: "Removal Date", type: "date" },
        { name: "uninstKm", label: "Removal KM", type: "number" },
        { name: "remarks", label: "Remarks", type: "textarea", span2: true },
      ]}
      defaults={{ entryDate: formatDate(new Date()) }}
      numericFields={["instKm", "uninstKm"]}
    />
  );
}
