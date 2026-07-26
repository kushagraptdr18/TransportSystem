"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import type { MasterOption } from "@/components/data/master-combobox";
import { SimpleMaster, type FormState } from "@/components/masters/simple-master";
import { PartyCreateDialog } from "@/components/masters/inline-dialogs";
import { saveVehicle, deleteVehicle, importVehicles } from "@/app/(app)/masters/vehicles/actions";

interface Row {
  id: string;
  number: string;
  isOwn: boolean;
  ownershipType: string; // OWNER | BROKER | RELATIVE
  ownerId: string | null;
  ownerName: string | null; // linked party name
  ownerNames: string | null; // legacy free-text owners
  chassisNo: string | null;
  engineNo: string | null;
  vehicleType: string | null;
  permitNo: string | null;
  insuranceNo: string | null;
}

const OWNERSHIP_LABEL: Record<string, string> = {
  OWNER: "Owner",
  BROKER: "Broker",
  RELATIVE: "Relative",
};

const columns: ColumnDef<Row, unknown>[] = [
  { accessorKey: "number", header: "Vehicle No" },
  {
    id: "ownership",
    header: "Ownership",
    cell: ({ row }) => (
      <Badge
        variant={
          row.original.ownershipType === "OWNER"
            ? "default"
            : row.original.ownershipType === "RELATIVE"
              ? "outline"
              : "secondary"
        }
      >
        {OWNERSHIP_LABEL[row.original.ownershipType] ?? row.original.ownershipType}
      </Badge>
    ),
  },
  {
    id: "person",
    header: "Name",
    cell: ({ row }) => row.original.ownerName ?? row.original.ownerNames ?? "-",
  },
  { accessorKey: "vehicleType", header: "Type" },
];

export function VehiclesClient({
  rows,
  ownerOptions,
  relativeOptions,
  canDelete,
}: {
  rows: Row[];
  ownerOptions: MasterOption[];
  relativeOptions: MasterOption[];
  canDelete: boolean;
}) {
  const nameFieldFor = (types: string[], options: MasterOption[], group: string) => ({
    name: "ownerId",
    label: "Name *",
    type: "combobox" as const,
    options,
    visibleIf: (f: FormState) => types.includes(String(f.ownershipType)),
    createDialog: (props: Parameters<typeof PartyCreateDialog>[0]) => (
      <PartyCreateDialog
        {...props}
        defaultGroup={group as "OWNER_BROKER" | "RELATIVE"}
      />
    ),
    span2: true,
  });

  return (
    <SimpleMaster
      title="Vehicle"
      rows={rows}
      columns={columns}
      exportColumns={[
        { header: "Vehicle No", key: "number" },
        { header: "Ownership", accessor: (r) => OWNERSHIP_LABEL[r.ownershipType] ?? r.ownershipType },
        { header: "Name", accessor: (r) => r.ownerName ?? r.ownerNames ?? "" },
        { header: "Type", key: "vehicleType" },
        { header: "Chassis No", key: "chassisNo" },
        { header: "Engine No", key: "engineNo" },
        { header: "Permit No", key: "permitNo" },
        { header: "Insurance No", key: "insuranceNo" },
      ]}
      exportName="vehicles"
      filters={[
        { type: "text", key: "q", label: "Search vehicle no..." },
        {
          type: "select",
          key: "own",
          label: "Ownership",
          options: [
            { value: "OWN", label: "Owner" },
            { value: "MARKET", label: "Broker / Relative" },
          ],
        },
      ]}
      fields={[
        { name: "number", label: "Vehicle Number *", type: "text", uppercase: true },
        {
          name: "ownershipType",
          label: "Ownership *",
          type: "radio",
          options: [
            { value: "OWNER", label: "Owner" },
            { value: "BROKER", label: "Broker" },
            { value: "RELATIVE", label: "Relative" },
          ],
        },
        // same form key, different source list per ownership type
        nameFieldFor(["OWNER", "BROKER"], ownerOptions, "OWNER_BROKER"),
        nameFieldFor(["RELATIVE"], relativeOptions, "RELATIVE"),
        { name: "vehicleType", label: "Vehicle Type", type: "text" },
        { name: "chassisNo", label: "Chassis No", type: "text", uppercase: true },
        { name: "engineNo", label: "Engine No", type: "text", uppercase: true },
        { name: "permitNo", label: "Permit No", type: "text" },
        { name: "insuranceNo", label: "Insurance No", type: "text" },
      ]}
      defaults={{
        number: "",
        ownershipType: "OWNER",
        ownerId: null,
        vehicleType: "",
        chassisNo: "",
        engineNo: "",
        permitNo: "",
        insuranceNo: "",
      }}
      toForm={(r) => ({
        number: r.number,
        ownershipType: r.ownershipType,
        ownerId: r.ownerId,
        vehicleType: r.vehicleType ?? "",
        chassisNo: r.chassisNo ?? "",
        engineNo: r.engineNo ?? "",
        permitNo: r.permitNo ?? "",
        insuranceNo: r.insuranceNo ?? "",
      })}
      getId={(r) => r.id}
      save={saveVehicle}
      remove={deleteVehicle}
      importConfig={{
        action: importVehicles,
        templateHeaders: ["Vehicle No", "Ownership", "Name", "Type", "Chassis No", "Engine No", "Permit No", "Insurance No"],
        templateExample: ["CG04AB1234", "BROKER", "DEMO TRANSPORT CO", "TRAILER", "", "", "", ""],
        templateName: "vehicles",
      }}
      canDelete={canDelete}
    />
  );
}
