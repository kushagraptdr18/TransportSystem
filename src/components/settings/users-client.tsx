"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { SimpleMaster } from "@/components/masters/simple-master";
import { saveUser, deleteUser } from "@/app/(app)/settings/users/actions";

export interface UserRow {
  id: string;
  name: string;
  username: string;
  role: string;
  isActive: boolean;
  createdAt: string;
}

const ROLES = ["OWNER", "ADMIN", "OPERATOR", "ACCOUNTANT", "VIEWER"];

const columns: ColumnDef<UserRow, unknown>[] = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "username", header: "Username" },
  {
    accessorKey: "role",
    header: "Role",
    cell: ({ row }) => <Badge variant="secondary">{row.original.role}</Badge>,
  },
  {
    accessorKey: "isActive",
    header: "Status",
    cell: ({ row }) =>
      row.original.isActive ? <Badge>Active</Badge> : <Badge variant="outline">Inactive</Badge>,
  },
];

export function UsersClient({ rows, canDelete }: { rows: UserRow[]; canDelete: boolean }) {
  return (
    <SimpleMaster
      title="User"
      newLabel="New User"
      rows={rows}
      columns={columns}
      exportColumns={[
        { header: "Name", key: "name" },
        { header: "Username", key: "username" },
        { header: "Role", key: "role" },
        { header: "Active", accessor: (r) => (r.isActive ? "YES" : "NO") },
      ]}
      exportName="users"
      fields={[
        { name: "name", label: "Full Name *", type: "text" },
        { name: "username", label: "Username *", type: "text" },
        {
          name: "password",
          label: "Password (leave blank to keep current)",
          type: "text",
          span2: true,
        },
        {
          name: "role",
          label: "Role *",
          type: "select",
          options: ROLES.map((r) => ({ value: r, label: r })),
        },
        { name: "isActive", label: "Active", type: "switch" },
      ]}
      defaults={{ role: "OPERATOR", isActive: true, password: "" }}
      toForm={(r) => ({ ...r, password: "" })}
      getId={(r) => r.id}
      save={saveUser}
      remove={deleteUser}
      canDelete={canDelete}
    />
  );
}
