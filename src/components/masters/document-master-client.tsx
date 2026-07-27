"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { SimpleMaster } from "@/components/masters/simple-master";
import { saveDocumentType, deleteDocumentType, importDocumentTypes } from "@/app/(app)/masters/document-master/actions";

interface Row {
  id: string;
  name: string;
  description: string | null;
  showReminder: boolean;
  reminderDays: number;
  expiryDays: number;
}

const columns: ColumnDef<Row, unknown>[] = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "expiryDays", header: "Expiry Days", meta: { numeric: true } },
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
        { header: "Expiry Days", key: "expiryDays", numeric: true },
        { header: "Description", key: "description" },
        { header: "Reminder", accessor: (r) => (r.showReminder ? "Yes" : "No") },
      ]}
      exportName="document-types"
      filters={[{ type: "text", key: "q", label: "Search name..." }]}
      fields={[
        { name: "name", label: "Name *", type: "text" },
        { name: "expiryDays", label: "Expiry Days * (document valid for this many days)", type: "number" },
        { name: "showReminder", label: "Show Reminder", type: "switch" },
        {
          name: "reminderDays",
          label: "Remind Before Expiry (days) — 15 / 30 / 45 / 60 / 90 or custom",
          type: "number",
        },
        { name: "description", label: "Description", type: "textarea", span2: true },
      ]}
      defaults={{ name: "", description: "", showReminder: true, reminderDays: 30, expiryDays: 365 }}
      toForm={(r) => ({
        name: r.name,
        description: r.description ?? "",
        showReminder: r.showReminder,
        reminderDays: r.reminderDays,
        expiryDays: r.expiryDays,
      })}
      getId={(r) => r.id}
      save={saveDocumentType}
      remove={deleteDocumentType}
      importConfig={{
        action: importDocumentTypes,
        templateHeaders: ["Name", "Expiry Days", "Description", "Reminder Days"],
        templateExample: ["INSURANCE", "365", "Vehicle insurance", "30"],
        templateName: "document-types",
      }}
      canDelete={canDelete}
    />
  );
}
