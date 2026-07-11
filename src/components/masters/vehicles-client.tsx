"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import type { MasterOption } from "@/components/data/master-combobox";
import { SimpleMaster, type FormState } from "@/components/masters/simple-master";
import { PartyCreateDialog } from "@/components/masters/inline-dialogs";
import { saveVehicle, deleteVehicle } from "@/app/(app)/masters/vehicles/actions";

interface Row {
  id: string;
  number: string;
  isOwn: boolean;
  ownerId: string | null;
  ownerName: string | null; // broker (party) name for broker vehicles
  ownerNames: string | null; // owner name(s) for owned vehicles
  chassisNo: string | null;
  engineNo: string | null;
  vehicleType: string | null;
  permitNo: string | null;
  insuranceNo: string | null;
}

const columns: ColumnDef<Row, unknown>[] = [
  { accessorKey: "number", header: "Vehicle No" },
  {
    id: "ownership",
    header: "Ownership",
    cell: ({ row }) =>
      row.original.isOwn ? (
        <Badge>Owned</Badge>
      ) : (
        <Badge variant="secondary">Broker</Badge>
      ),
  },
  {
    id: "ownerNames",
    header: "Owner(s)",
    cell: ({ row }) => (row.original.isOwn ? row.original.ownerNames ?? "-" : "-"),
  },
  {
    id: "broker",
    header: "Broker",
    cell: ({ row }) => (row.original.isOwn ? "-" : row.original.ownerName ?? "-"),
  },
  { accessorKey: "vehicleType", header: "Type" },
];

export function VehiclesClient({
  rows,
  ownerOptions,
  canDelete,
}: {
  rows: Row[];
  ownerOptions: MasterOption[];
  canDelete: boolean;
}) {
  const isBroker = (f: FormState) => f.ownership === "BROKER";
  const isOwned = (f: FormState) => f.ownership === "OWNED";
  return (
    <SimpleMaster
      title="Vehicle"
      rows={rows}
      columns={columns}
      exportColumns={[
        { header: "Vehicle No", key: "number" },
        { header: "Ownership", accessor: (r) => (r.isOwn ? "OWNED" : "BROKER") },
        { header: "Owner(s)", accessor: (r) => (r.isOwn ? r.ownerNames ?? "" : "") },
        { header: "Broker", accessor: (r) => (r.isOwn ? "" : r.ownerName ?? "") },
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
            { value: "OWN", label: "Owned" },
            { value: "MARKET", label: "Broker" },
          ],
        },
      ]}
      fields={[
        { name: "number", label: "Vehicle Number *", type: "text", uppercase: true },
        {
          name: "ownership",
          label: "Ownership *",
          type: "radio",
          options: [
            { value: "BROKER", label: "Broker vehicle" },
            { value: "OWNED", label: "Owned vehicle" },
          ],
        },
        {
          name: "ownerId",
          label: "Broker Name *",
          type: "combobox",
          options: ownerOptions,
          visibleIf: isBroker,
          createDialog: (props) => <PartyCreateDialog {...props} defaultGroup="OWNER_BROKER" />,
          span2: true,
        },
        {
          name: "ownerNames",
          label: "Owner Name(s) — separate multiple owners with commas",
          type: "textarea",
          placeholder: "e.g. RAMESH PATEL, SURESH PATEL",
          visibleIf: isOwned,
          span2: true,
        },
        { name: "vehicleType", label: "Vehicle Type", type: "text" },
        { name: "chassisNo", label: "Chassis No", type: "text", uppercase: true },
        { name: "engineNo", label: "Engine No", type: "text", uppercase: true },
        { name: "permitNo", label: "Permit No", type: "text" },
        { name: "insuranceNo", label: "Insurance No", type: "text" },
      ]}
      defaults={{
        number: "",
        ownership: "BROKER",
        ownerId: null,
        ownerNames: "",
        vehicleType: "",
        chassisNo: "",
        engineNo: "",
        permitNo: "",
        insuranceNo: "",
      }}
      toForm={(r) => ({
        number: r.number,
        ownership: r.isOwn ? "OWNED" : "BROKER",
        ownerId: r.ownerId,
        ownerNames: r.ownerNames ?? "",
        vehicleType: r.vehicleType ?? "",
        chassisNo: r.chassisNo ?? "",
        engineNo: r.engineNo ?? "",
        permitNo: r.permitNo ?? "",
        insuranceNo: r.insuranceNo ?? "",
      })}
      getId={(r) => r.id}
      save={saveVehicle}
      remove={deleteVehicle}
      canDelete={canDelete}
      transform={({ ownership, ...f }) => ({ ...f, isOwn: ownership === "OWNED" })}
    />
  );
}
