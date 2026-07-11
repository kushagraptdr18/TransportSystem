"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { SimpleMaster } from "@/components/masters/simple-master";
import { saveProductGroup, deleteProductGroup } from "@/app/(app)/masters/product-groups/actions";

interface Row {
  id: string;
  name: string;
  products: number;
}

const columns: ColumnDef<Row, unknown>[] = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "products", header: "Products", meta: { numeric: true } },
];

export function ProductGroupsClient({ rows, canDelete }: { rows: Row[]; canDelete: boolean }) {
  return (
    <SimpleMaster
      title="Product Group"
      rows={rows}
      columns={columns}
      exportColumns={[
        { header: "Name", key: "name" },
        { header: "Products", key: "products", numeric: true },
      ]}
      exportName="product-groups"
      filters={[{ type: "text", key: "q", label: "Search name..." }]}
      fields={[{ name: "name", label: "Name *", type: "text" }]}
      defaults={{ name: "" }}
      toForm={(r) => ({ name: r.name })}
      getId={(r) => r.id}
      save={saveProductGroup}
      remove={deleteProductGroup}
      canDelete={canDelete}
    />
  );
}
