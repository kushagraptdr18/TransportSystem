"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { SimpleMaster } from "@/components/masters/simple-master";
import { saveAccountHead, deleteAccountHead, importAccountHeads } from "@/app/(app)/masters/account-heads/actions";

interface Row {
  id: string;
  name: string;
  kind: string;
  /** software-owned head — seeded automatically, cannot be edited or deleted */
  system: boolean;
}

const columns: ColumnDef<Row, unknown>[] = [
  { accessorKey: "name", header: "Name" },
  {
    accessorKey: "kind",
    header: "Kind",
    cell: ({ row }) => (
      <Badge variant={row.original.kind === "INCOME" ? "default" : "secondary"}>
        {row.original.kind}
      </Badge>
    ),
  },
  {
    accessorKey: "system",
    header: "Source",
    cell: ({ row }) =>
      row.original.system ? (
        <Badge variant="outline" title="Created and used by the software — cannot be edited or deleted">
          SYSTEM
        </Badge>
      ) : (
        <span className="text-xs text-muted-foreground">User</span>
      ),
  },
];

export function AccountHeadsClient({ rows, canDelete }: { rows: Row[]; canDelete: boolean }) {
  return (
    <SimpleMaster
      title="Account Head"
      rows={rows}
      columns={columns}
      exportColumns={[
        { header: "Name", key: "name" },
        { header: "Kind", key: "kind" },
      ]}
      exportName="account-heads"
      filters={[
        { type: "text", key: "q", label: "Search name..." },
        {
          type: "select",
          key: "kind",
          label: "Kind",
          options: [
            { value: "INCOME", label: "Income" },
            { value: "EXPENSE", label: "Expense" },
          ],
        },
      ]}
      fields={[
        { name: "name", label: "Name *", type: "text", uppercase: false },
        {
          name: "kind",
          label: "Kind *",
          type: "select",
          options: [
            { value: "INCOME", label: "Income" },
            { value: "EXPENSE", label: "Expense" },
          ],
        },
      ]}
      defaults={{ name: "", kind: "EXPENSE" }}
      toForm={(r) => ({ name: r.name, kind: r.kind })}
      getId={(r) => r.id}
      save={saveAccountHead}
      remove={deleteAccountHead}
      importConfig={{
        action: importAccountHeads,
        templateHeaders: ["Name", "Kind"],
        templateExample: ["LOADING CHARGES", "INCOME"],
        templateName: "account-heads",
      }}
      canDelete={canDelete}
      rowLocked={(r) =>
        r.system
          ? `"${r.name}" is a system ledger head — the software posts to it automatically, so it cannot be edited or deleted.`
          : null
      }
    />
  );
}
