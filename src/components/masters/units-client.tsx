"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { SimpleMaster } from "@/components/masters/simple-master";
import { saveUnit, deleteUnit } from "@/app/(app)/masters/units/actions";

interface Row {
  id: string;
  name: string;
  value: number;
}

const columns: ColumnDef<Row, unknown>[] = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "value", header: "Value", meta: { numeric: true } },
];

export function UnitsClient({ rows, canDelete }: { rows: Row[]; canDelete: boolean }) {
  return (
    <SimpleMaster
      title="Unit"
      rows={rows}
      columns={columns}
      exportColumns={[
        { header: "Name", key: "name" },
        { header: "Value", key: "value", numeric: true },
      ]}
      exportName="units"
      filters={[{ type: "text", key: "q", label: "Search name..." }]}
      fields={[
        { name: "name", label: "Name *", type: "text", uppercase: true },
        { name: "value", label: "Value", type: "number" },
      ]}
      defaults={{ name: "", value: "1" }}
      toForm={(r) => ({ name: r.name, value: String(r.value) })}
      getId={(r) => r.id}
      save={saveUnit}
      remove={deleteUnit}
      canDelete={canDelete}
    />
  );
}
