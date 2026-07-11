"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { DataTable } from "@/components/data/data-table";
import { FilterBar } from "@/components/data/filter-bar";
import { ExportButton } from "@/components/data/export-button";
import { formatDate, formatMoney } from "@/lib/utils";
import { deleteChalan } from "../actions";

export interface ChalanRegisterRow {
  id: string;
  chalanNo: string;
  chalanDate: string;
  broker: string;
  vehicle: string;
  lrCount: number;
  freight: number;
  tdsAmt: number;
  commissionAmt: number;
  advanceTotal: number;
  balance: number;
  isFinal: boolean;
}

const sum = (rows: ChalanRegisterRow[], k: keyof ChalanRegisterRow) =>
  formatMoney(rows.reduce((s, r) => s + (r[k] as number), 0));

export function ChalanRegisterClient({
  rows,
  brokers,
  vehicles,
  canDelete,
}: {
  rows: ChalanRegisterRow[];
  brokers: { value: string; label: string }[];
  vehicles: { value: string; label: string }[];
  canDelete: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();

  const columns: ColumnDef<ChalanRegisterRow>[] = [
    { accessorKey: "chalanNo", header: "Chalan No" },
    {
      accessorKey: "chalanDate",
      header: "Date",
      cell: ({ row }) => formatDate(row.original.chalanDate),
    },
    { accessorKey: "broker", header: "Broker" },
    { accessorKey: "vehicle", header: "Vehicle" },
    {
      accessorKey: "lrCount",
      header: "LRs",
      meta: { numeric: true, total: (r: ChalanRegisterRow[]) => r.reduce((s, x) => s + x.lrCount, 0) },
    },
    {
      accessorKey: "freight",
      header: "Freight",
      cell: ({ row }) => formatMoney(row.original.freight),
      meta: { numeric: true, total: (r: ChalanRegisterRow[]) => sum(r, "freight") },
    },
    {
      accessorKey: "tdsAmt",
      header: "TDS",
      cell: ({ row }) => formatMoney(row.original.tdsAmt),
      meta: { numeric: true, total: (r: ChalanRegisterRow[]) => sum(r, "tdsAmt") },
    },
    {
      accessorKey: "commissionAmt",
      header: "Commission",
      cell: ({ row }) => formatMoney(row.original.commissionAmt),
      meta: { numeric: true, total: (r: ChalanRegisterRow[]) => sum(r, "commissionAmt") },
    },
    {
      accessorKey: "advanceTotal",
      header: "Advance",
      cell: ({ row }) => formatMoney(row.original.advanceTotal),
      meta: { numeric: true, total: (r: ChalanRegisterRow[]) => sum(r, "advanceTotal") },
    },
    {
      accessorKey: "balance",
      header: "Balance",
      cell: ({ row }) => formatMoney(row.original.balance),
      meta: { numeric: true, total: (r: ChalanRegisterRow[]) => sum(r, "balance") },
    },
    {
      accessorKey: "isFinal",
      header: "Status",
      cell: ({ row }) =>
        row.original.isFinal ? <Badge>Final</Badge> : <Badge variant="secondary">Draft</Badge>,
    },
    {
      id: "actions",
      header: "",
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
          <Button asChild variant="ghost" size="sm" className="h-7 px-2">
            <Link href={`/chalan?id=${row.original.id}`}>Edit</Link>
          </Button>
          <Button asChild variant="ghost" size="sm" className="h-7 px-2">
            <Link href={`/print/chalan/${row.original.id}`} target="_blank">
              Print
            </Link>
          </Button>
          {canDelete && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-destructive"
              onClick={async () => {
                if (!confirm(`Delete chalan ${row.original.chalanNo}?`)) return;
                const res = await deleteChalan(row.original.id);
                if (res.ok) {
                  toast({ title: "Chalan deleted" });
                  router.refresh();
                } else {
                  toast({ variant: "destructive", title: "Delete failed", description: res.error });
                }
              }}
            >
              Delete
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Chalan Register</h1>
        <div className="flex gap-2">
          <ExportButton
            rows={rows}
            fileName="chalan-register"
            columns={[
              { header: "Chalan No", key: "chalanNo" },
              { header: "Date", accessor: (r) => formatDate(r.chalanDate) },
              { header: "Broker", key: "broker" },
              { header: "Vehicle", key: "vehicle" },
              { header: "LRs", key: "lrCount", numeric: true },
              { header: "Freight", key: "freight", numeric: true },
              { header: "TDS", key: "tdsAmt", numeric: true },
              { header: "Commission", key: "commissionAmt", numeric: true },
              { header: "Advance", key: "advanceTotal", numeric: true },
              { header: "Balance", key: "balance", numeric: true },
              { header: "Status", accessor: (r) => (r.isFinal ? "FINAL" : "DRAFT") },
            ]}
          />
          <Button asChild size="sm">
            <Link href="/chalan">+ New Chalan</Link>
          </Button>
        </div>
      </div>
      <FilterBar
        filters={[
          { type: "daterange", key: "date", label: "Date" },
          { type: "combobox", key: "broker", label: "Broker", options: brokers },
          { type: "combobox", key: "vehicle", label: "Vehicle", options: vehicles },
          {
            type: "select",
            key: "status",
            label: "Status",
            options: [
              { value: "final", label: "Final" },
              { value: "draft", label: "Draft" },
            ],
          },
        ]}
      />
      <DataTable
        columns={columns}
        data={rows}
        onRowClick={(row) => router.push(`/chalan?id=${row.id}`)}
      />
    </div>
  );
}
