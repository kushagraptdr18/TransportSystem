"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { MasterOption } from "@/components/data/master-combobox";
import { SimpleMaster } from "@/components/masters/simple-master";
import { saveCity, deleteCity } from "@/app/(app)/masters/cities/actions";

interface Row {
  id: string;
  name: string;
  stateId: string;
  stateName: string;
  district: string | null;
  pincode: string | null;
  stdCode: string | null;
}

const columns: ColumnDef<Row, unknown>[] = [
  { accessorKey: "name", header: "City" },
  { accessorKey: "stateName", header: "State" },
  { accessorKey: "district", header: "District" },
  { accessorKey: "pincode", header: "Pincode" },
  { accessorKey: "stdCode", header: "STD Code" },
];

export function CitiesClient({
  rows,
  stateOptions,
  canDelete,
}: {
  rows: Row[];
  stateOptions: MasterOption[];
  canDelete: boolean;
}) {
  return (
    <SimpleMaster
      title="City"
      rows={rows}
      columns={columns}
      exportColumns={[
        { header: "City", key: "name" },
        { header: "State", key: "stateName" },
        { header: "District", key: "district" },
        { header: "Pincode", key: "pincode" },
        { header: "STD Code", key: "stdCode" },
      ]}
      exportName="cities"
      filters={[
        { type: "text", key: "q", label: "Search city..." },
        { type: "combobox", key: "stateId", label: "State", options: stateOptions },
      ]}
      fields={[
        { name: "name", label: "City Name *", type: "text", uppercase: true },
        { name: "stateId", label: "State *", type: "combobox", options: stateOptions },
        { name: "district", label: "District", type: "text" },
        { name: "pincode", label: "Pincode", type: "text" },
        { name: "stdCode", label: "STD Code", type: "text" },
      ]}
      defaults={{ name: "", stateId: null, district: "", pincode: "", stdCode: "" }}
      toForm={(r) => ({
        name: r.name,
        stateId: r.stateId,
        district: r.district ?? "",
        pincode: r.pincode ?? "",
        stdCode: r.stdCode ?? "",
      })}
      getId={(r) => r.id}
      save={saveCity}
      remove={deleteCity}
      canDelete={canDelete}
    />
  );
}
