"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import type { MasterOption } from "@/components/data/master-combobox";
import { SimpleMaster } from "@/components/masters/simple-master";
import {
  saveVehicleDocument,
  deleteVehicleDocument,
} from "@/app/(app)/masters/vehicle-documents/actions";
import { formatDate } from "@/lib/utils";

export interface VehicleDocRow {
  id: string;
  docTypeId: string;
  docTypeName: string;
  vehicleId: string;
  vehicleNumber: string;
  docNo: string | null;
  companyName: string | null;
  status: string;
  entryDate: string; // dd/mm/yyyy
  effectiveDate: string;
  expiryDate: string;
  expiredNow: boolean;
  remarks: string | null;
}

const columns: ColumnDef<VehicleDocRow, unknown>[] = [
  { accessorKey: "docTypeName", header: "Document" },
  { accessorKey: "vehicleNumber", header: "Vehicle" },
  { accessorKey: "docNo", header: "Doc No" },
  { accessorKey: "companyName", header: "Company" },
  { accessorKey: "entryDate", header: "Entry" },
  {
    accessorKey: "expiryDate",
    header: "Expiry",
    cell: ({ row }) => (
      <span className={row.original.expiredNow ? "font-medium text-destructive" : undefined}>
        {row.original.expiryDate}
      </span>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => (
      <Badge variant={row.original.status === "DONE" ? "default" : "secondary"}>
        {row.original.status}
      </Badge>
    ),
  },
];

export function VehicleDocumentsClient({
  rows,
  docTypeOptions,
  vehicleOptions,
  canDelete,
}: {
  rows: VehicleDocRow[];
  docTypeOptions: MasterOption[];
  vehicleOptions: MasterOption[];
  canDelete: boolean;
}) {
  return (
    <SimpleMaster
      title="Document Registration"
      newLabel="New Registration"
      rows={rows}
      columns={columns}
      exportColumns={[
        { header: "Document", key: "docTypeName" },
        { header: "Vehicle", key: "vehicleNumber" },
        { header: "Doc No", key: "docNo" },
        { header: "Company", key: "companyName" },
        { header: "Entry", key: "entryDate" },
        { header: "Effective", key: "effectiveDate" },
        { header: "Expiry", key: "expiryDate" },
        { header: "Status", key: "status" },
        { header: "Remarks", key: "remarks" },
      ]}
      exportName="vehicle-documents"
      filters={[
        { type: "combobox", key: "vehicle", label: "Vehicle", options: vehicleOptions },
        { type: "combobox", key: "docType", label: "Document Type", options: docTypeOptions },
        {
          type: "select",
          key: "due",
          label: "Expiry",
          options: [
            { value: "expired", label: "Expired" },
            { value: "30", label: "Due in 30 days" },
          ],
        },
      ]}
      fields={[
        { name: "docTypeId", label: "Document Type *", type: "combobox", options: docTypeOptions },
        { name: "vehicleId", label: "Vehicle *", type: "combobox", options: vehicleOptions },
        { name: "docNo", label: "Document No", type: "text" },
        { name: "companyName", label: "Company / Issuer", type: "text" },
        { name: "entryDate", label: "Entry Date *", type: "date" },
        { name: "effectiveDate", label: "Effective Date", type: "date" },
        { name: "expiryDate", label: "Expiry Date", type: "date" },
        {
          name: "status",
          label: "Status",
          type: "radio",
          options: [
            { value: "DONE", label: "Done" },
            { value: "PENDING", label: "Pending" },
          ],
        },
        { name: "remarks", label: "Remarks", type: "textarea", span2: true },
      ]}
      defaults={{ status: "DONE", entryDate: formatDate(new Date()) }}
      toForm={(r) => ({ ...r })}
      getId={(r) => r.id}
      save={saveVehicleDocument}
      remove={deleteVehicleDocument}
      canDelete={canDelete}
    />
  );
}
