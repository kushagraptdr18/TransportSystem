"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { SimpleMaster } from "@/components/masters/simple-master";
import { saveJobHead, deleteJobHead } from "@/app/(app)/masters/job-heads/actions";

interface Row {
  id: string;
  name: string;
  gstPct: number;
  hsnCode: string | null;
  description: string | null;
  showReminder: boolean;
}

const columns: ColumnDef<Row, unknown>[] = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "gstPct", header: "GST %", meta: { numeric: true } },
  { accessorKey: "hsnCode", header: "HSN Code" },
  { accessorKey: "description", header: "Description" },
  {
    accessorKey: "showReminder",
    header: "Reminder",
    cell: ({ row }) =>
      row.original.showReminder ? <Badge>Yes</Badge> : <Badge variant="secondary">No</Badge>,
  },
];

export function JobHeadsClient({ rows, canDelete }: { rows: Row[]; canDelete: boolean }) {
  return (
    <SimpleMaster
      title="Job Head"
      rows={rows}
      columns={columns}
      exportColumns={[
        { header: "Name", key: "name" },
        { header: "GST %", key: "gstPct", numeric: true },
        { header: "HSN Code", key: "hsnCode" },
        { header: "Description", key: "description" },
        { header: "Reminder", accessor: (r) => (r.showReminder ? "Yes" : "No") },
      ]}
      exportName="job-heads"
      filters={[{ type: "text", key: "q", label: "Search name..." }]}
      fields={[
        { name: "name", label: "Name *", type: "text" },
        { name: "gstPct", label: "GST %", type: "number" },
        { name: "hsnCode", label: "HSN Code", type: "text" },
        { name: "showReminder", label: "Show Reminder", type: "switch" },
        { name: "description", label: "Description", type: "textarea", span2: true },
      ]}
      defaults={{ name: "", gstPct: "0", hsnCode: "", description: "", showReminder: false }}
      toForm={(r) => ({
        name: r.name,
        gstPct: String(r.gstPct),
        hsnCode: r.hsnCode ?? "",
        description: r.description ?? "",
        showReminder: r.showReminder,
      })}
      getId={(r) => r.id}
      save={saveJobHead}
      remove={deleteJobHead}
      canDelete={canDelete}
    />
  );
}
