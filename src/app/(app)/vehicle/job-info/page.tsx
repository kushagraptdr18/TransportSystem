import type { Prisma } from "@prisma/client";
import { requireSession } from "@/lib/session";
import { authorize } from "@/lib/authz";
import { withTenant } from "@/lib/db";
import { formatDate } from "@/lib/utils";
import { DocModule } from "@/components/data/doc-module";
import { saveJobInfo, deleteJobInfo } from "./actions";

export const dynamic = "force-dynamic";

export default async function JobInfoPage({
  searchParams,
}: {
  searchParams: { vehicle?: string; status?: string };
}) {
  const session = requireSession();
  await authorize(session, "maintenance", "view");

  const { rows, vehicles, garages } = await withTenant(session.tenantId, async (tx) => {
    const where: Prisma.JobInfoWhereInput = { firmId: session.firmId };
    if (searchParams.vehicle) where.vehicleId = searchParams.vehicle;
    if (searchParams.status) where.status = searchParams.status;
    const [rows, vehicles, garages] = await Promise.all([
      tx.jobInfo.findMany({ where, orderBy: { entryDate: "desc" } }),
      tx.vehicle.findMany({ where: { isActive: true }, orderBy: { number: "asc" } }),
      tx.party.findMany({ where: { isActive: true, ledgerGroup: "SUPPLIERS" }, orderBy: { name: "asc" } }),
    ]);
    return { rows, vehicles, garages };
  });

  const vehicleById = new Map(vehicles.map((v) => [v.id, v.number]));
  const garageById = new Map(garages.map((g) => [g.id, g.name]));

  return (
    <DocModule
      title="Job Info (Garage Work)"
      newLabel="New Job"
      exportName="job-info"
      canDelete={session.role === "ADMIN" || session.role === "OWNER"}
      save={saveJobInfo}
      remove={deleteJobInfo}
      rows={rows.map((r) => ({
        id: r.id,
        entryDate: formatDate(r.entryDate),
        vehicleId: r.vehicleId,
        vehicleNumber: vehicleById.get(r.vehicleId) ?? "",
        garageId: r.garageId,
        garageName: (r.garageId && garageById.get(r.garageId)) || "",
        jobDescription: r.jobDescription ?? "",
        jobCompDate: r.jobCompDate ? formatDate(r.jobCompDate) : "",
        status: r.status,
        remarks: r.remarks ?? "",
      }))}
      columns={[
        { key: "entryDate", header: "Entry Date" },
        { key: "vehicleNumber", header: "Vehicle" },
        { key: "garageName", header: "Garage / Supplier" },
        { key: "jobDescription", header: "Job Description" },
        { key: "jobCompDate", header: "Completed On" },
        { key: "status", header: "Status", kind: "badge" },
      ]}
      filters={[
        {
          type: "combobox",
          key: "vehicle",
          label: "Vehicle",
          options: vehicles.map((v) => ({ value: v.id, label: v.number })),
        },
        {
          type: "select",
          key: "status",
          label: "Status",
          options: [
            { value: "PENDING", label: "Pending" },
            { value: "DONE", label: "Done" },
          ],
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
          name: "garageId",
          label: "Garage / Supplier",
          type: "combobox",
          options: garages.map((g) => ({ value: g.id, label: g.name })),
        },
        { name: "jobDescription", label: "Job Description", type: "textarea", span2: true },
        { name: "jobCompDate", label: "Completion Date", type: "date" },
        {
          name: "status",
          label: "Status",
          type: "radio",
          options: [
            { value: "PENDING", label: "Pending" },
            { value: "DONE", label: "Done" },
          ],
        },
        { name: "remarks", label: "Remarks", type: "textarea", span2: true },
      ]}
      defaults={{ entryDate: formatDate(new Date()), status: "PENDING" }}
    />
  );
}
