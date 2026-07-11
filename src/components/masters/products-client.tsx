"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { MasterOption } from "@/components/data/master-combobox";
import { SimpleMaster } from "@/components/masters/simple-master";
import { saveProduct, deleteProduct } from "@/app/(app)/masters/products/actions";

interface Row {
  id: string;
  name: string;
  groupId: string;
  groupName: string;
  unit: string | null;
  hsnCode: string | null;
  gstPct: number;
  type: string | null;
  className: string | null;
  division: string | null;
}

const columns: ColumnDef<Row, unknown>[] = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "groupName", header: "Group" },
  { accessorKey: "unit", header: "Unit" },
  { accessorKey: "hsnCode", header: "HSN" },
  { accessorKey: "gstPct", header: "GST %", meta: { numeric: true } },
  { accessorKey: "type", header: "Type" },
];

export function ProductsClient({
  rows,
  groupOptions,
  canDelete,
}: {
  rows: Row[];
  groupOptions: MasterOption[];
  canDelete: boolean;
}) {
  return (
    <SimpleMaster
      title="Product"
      rows={rows}
      columns={columns}
      exportColumns={[
        { header: "Name", key: "name" },
        { header: "Group", key: "groupName" },
        { header: "Unit", key: "unit" },
        { header: "HSN", key: "hsnCode" },
        { header: "GST %", key: "gstPct", numeric: true },
        { header: "Type", key: "type" },
        { header: "Class", key: "className" },
        { header: "Division", key: "division" },
      ]}
      exportName="products"
      filters={[
        { type: "text", key: "q", label: "Search product..." },
        { type: "combobox", key: "groupId", label: "Group", options: groupOptions },
      ]}
      fields={[
        { name: "groupId", label: "Product Group *", type: "combobox", options: groupOptions },
        { name: "name", label: "Name *", type: "text", uppercase: true },
        { name: "unit", label: "Unit", type: "text" },
        { name: "hsnCode", label: "HSN Code", type: "text" },
        { name: "gstPct", label: "GST %", type: "number" },
        { name: "type", label: "Type", type: "text" },
        { name: "className", label: "Class", type: "text" },
        { name: "division", label: "Division", type: "text" },
      ]}
      defaults={{
        groupId: null,
        name: "",
        unit: "MT",
        hsnCode: "",
        gstPct: "0",
        type: "",
        className: "",
        division: "",
      }}
      toForm={(r) => ({
        groupId: r.groupId,
        name: r.name,
        unit: r.unit ?? "",
        hsnCode: r.hsnCode ?? "",
        gstPct: String(r.gstPct),
        type: r.type ?? "",
        className: r.className ?? "",
        division: r.division ?? "",
      })}
      getId={(r) => r.id}
      save={saveProduct}
      remove={deleteProduct}
      canDelete={canDelete}
    />
  );
}
