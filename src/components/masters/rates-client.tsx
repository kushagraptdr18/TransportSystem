"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { MasterOption } from "@/components/data/master-combobox";
import { SimpleMaster, type FieldDef } from "@/components/masters/simple-master";
import { saveRate, deleteRate } from "@/app/(app)/masters/rates/actions";
import { formatMoney } from "@/lib/utils";

export interface RateRow {
  id: string;
  partyId: string;
  partyName: string;
  productId: string | null;
  productName: string;
  sourceCityId: string;
  sourceName: string;
  destCityId: string;
  destName: string;
  rate: number;
  rateBasis: string;
  hamali: number;
  hamaliBasis: string;
  preBhada: number;
  preBhadaBasis: string;
  dCharge: number;
  dChargeBasis: string;
  stationery: number;
  stationeryBasis: string;
  crossing: number;
  crossingBasis: string;
}

const BASIS = [
  { value: "QTY", label: "Per Qty" },
  { value: "ACTUAL_WT", label: "Actual Wt" },
  { value: "CHARGE_WT", label: "Charge Wt" },
  { value: "FIXED", label: "Fixed" },
];

const basisLabel = (b: string) => BASIS.find((x) => x.value === b)?.label ?? b;

const columns: ColumnDef<RateRow, unknown>[] = [
  { accessorKey: "partyName", header: "Party" },
  { accessorKey: "productName", header: "Product" },
  { accessorKey: "sourceName", header: "From" },
  { accessorKey: "destName", header: "To" },
  {
    accessorKey: "rate",
    header: "Rate",
    cell: ({ row }) => formatMoney(row.original.rate),
    meta: { numeric: true },
  },
  {
    accessorKey: "rateBasis",
    header: "Basis",
    cell: ({ row }) => basisLabel(row.original.rateBasis),
  },
  {
    accessorKey: "hamali",
    header: "Hamali",
    cell: ({ row }) => formatMoney(row.original.hamali),
    meta: { numeric: true },
  },
  {
    accessorKey: "dCharge",
    header: "D. Charge",
    cell: ({ row }) => formatMoney(row.original.dCharge),
    meta: { numeric: true },
  },
  {
    accessorKey: "crossing",
    header: "Crossing",
    cell: ({ row }) => formatMoney(row.original.crossing),
    meta: { numeric: true },
  },
];

function amountWithBasis(name: string, label: string, options: MasterOption[]): FieldDef[] {
  return [
    { name, label, type: "number" },
    { name: `${name}Basis`, label: `${label} Basis`, type: "select", options },
  ];
}

export function RatesClient({
  rows,
  partyOptions,
  productOptions,
  cityOptions,
  canDelete,
}: {
  rows: RateRow[];
  partyOptions: MasterOption[];
  productOptions: MasterOption[];
  cityOptions: MasterOption[];
  canDelete: boolean;
}) {
  const numeric = [
    "rate",
    "hamali",
    "preBhada",
    "dCharge",
    "stationery",
    "crossing",
  ] as const;
  return (
    <SimpleMaster
      title="Rate Setup"
      newLabel="New Rate"
      rows={rows}
      columns={columns}
      exportColumns={[
        { header: "Party", key: "partyName" },
        { header: "Product", key: "productName" },
        { header: "From", key: "sourceName" },
        { header: "To", key: "destName" },
        { header: "Rate", key: "rate", numeric: true },
        { header: "Basis", accessor: (r) => basisLabel(r.rateBasis) },
        { header: "Hamali", key: "hamali", numeric: true },
        { header: "Pre-Bhada", key: "preBhada", numeric: true },
        { header: "D. Charge", key: "dCharge", numeric: true },
        { header: "Stationery", key: "stationery", numeric: true },
        { header: "Crossing", key: "crossing", numeric: true },
      ]}
      exportName="rate-setup"
      filters={[
        { type: "combobox", key: "party", label: "Party", options: partyOptions },
        { type: "combobox", key: "source", label: "Source", options: cityOptions },
        { type: "combobox", key: "dest", label: "Destination", options: cityOptions },
      ]}
      fields={[
        { name: "partyId", label: "Party *", type: "combobox", options: partyOptions, span2: true },
        { name: "productId", label: "Product (blank = all)", type: "combobox", options: productOptions, span2: true },
        { name: "sourceCityId", label: "Source City *", type: "combobox", options: cityOptions },
        { name: "destCityId", label: "Destination City *", type: "combobox", options: cityOptions },
        ...amountWithBasis("rate", "Freight Rate", BASIS),
        ...amountWithBasis("hamali", "Hamali", BASIS),
        ...amountWithBasis("preBhada", "Pre-Bhada", BASIS),
        ...amountWithBasis("dCharge", "Delivery Charge", BASIS),
        ...amountWithBasis("stationery", "Stationery", BASIS),
        ...amountWithBasis("crossing", "Crossing", BASIS),
      ]}
      defaults={{
        rate: 0,
        rateBasis: "CHARGE_WT",
        hamali: 0,
        hamaliBasis: "FIXED",
        preBhada: 0,
        preBhadaBasis: "FIXED",
        dCharge: 0,
        dChargeBasis: "FIXED",
        stationery: 0,
        stationeryBasis: "FIXED",
        crossing: 0,
        crossingBasis: "FIXED",
      }}
      toForm={(r) => ({ ...r })}
      getId={(r) => r.id}
      save={saveRate}
      remove={deleteRate}
      canDelete={canDelete}
      transform={(f) =>
        numeric.reduce((acc, k) => ({ ...acc, [k]: Number(acc[k as keyof typeof acc]) || 0 }), {
          ...f,
        })
      }
      dialogClassName="max-h-[90vh] overflow-y-auto sm:max-w-2xl"
    />
  );
}
