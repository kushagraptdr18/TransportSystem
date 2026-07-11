"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { SimpleMaster } from "@/components/masters/simple-master";
import { saveDocumentType, deleteDocumentType } from "@/app/(app)/masters/document-master/actions";

interface Row {
  id: string;
  name: string;
  description: string | null;
  showReminder: boolean;
}

const columns: ColumnDef<Row, unknown>[] = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "description", header: "Description" },
  {
    accessorKey: "showReminder",
    header: "Reminder",
    cell: ({ row }) =>
      row.original.showReminder ? <Badge>Yes</Badge> : <Badge variant="secondary">No</Badge>,
  },
];

export function DocumentMasterClient({ rows, canDelete }: { rows: Row[]; canDelete: boolean }) {
  return (
    <SimpleMaster
      title="Document Type"
      rows={rows}
      columns={columns}
      exportColumns={[
        { header: "Name", key: "name" },
        { header: "Description", key: "description" },
        { header: "Reminder", accessor: (r) => (r.showReminder ? "Yes" : "No") },
      ]}
      exportName="document-types"
      filters={[{ type: "text", key: "q", label: "Search name..." }]}
      fields={[
        { name: "name", label: "Name *", type: "text" },
        { name: "showReminder", label: "Show Reminder", type: "switch" },
        { name: "description", label: "Description", type: "textarea", span2: true },
      ]}
      defaults={{ name: "", description: "", showReminder: true }}
      toForm={(r) => ({
        name: r.name,
        description: r.description ?? "",
        showReminder: r.showReminder,
      })}
      getId={(r) => r.id}
      save={saveDocumentType}
      remove={deleteDocumentType}
      canDelete={canDelete}
    />
  );
}
