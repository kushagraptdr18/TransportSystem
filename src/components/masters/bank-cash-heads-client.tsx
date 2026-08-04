"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { SimpleMaster, type FormState } from "@/components/masters/simple-master";
import { saveParty, deleteParty, importParties } from "@/app/(app)/masters/parties/actions";

export interface BankCashHeadRow {
  id: string;
  name: string;
  ledgerGroup: string; // BANK | CASH | CARD
  alias: string | null; // used as description
  bankName: string | null;
  bankAccount: string | null;
  bankIfsc: string | null;
  isActive: boolean;
}

const columns: ColumnDef<BankCashHeadRow, unknown>[] = [
  { accessorKey: "name", header: "Head Name" },
  {
    accessorKey: "ledgerGroup",
    header: "Type",
    cell: ({ row }) => (
      <Badge
        variant={
          row.original.ledgerGroup === "BANK"
            ? "default"
            : row.original.ledgerGroup === "CARD"
              ? "outline"
              : "secondary"
        }
      >
        {row.original.ledgerGroup}
      </Badge>
    ),
  },
  { accessorKey: "alias", header: "Description" },
  { accessorKey: "bankAccount", header: "A/c No" },
  { accessorKey: "bankIfsc", header: "IFSC" },
  {
    accessorKey: "isActive",
    header: "Status",
    cell: ({ row }) =>
      row.original.isActive ? <Badge>Active</Badge> : <Badge variant="outline">Inactive</Badge>,
  },
];

/**
 * Accounts master (Bank / Cash / Card) — these heads back the money-account
 * pickers in chalan advances, vouchers, billing and the books. A CARD (fuel /
 * fleet card) behaves exactly like a bank account: pay from it in a Payment
 * Voucher, recharge it with a Contra Voucher.
 */
export function BankCashHeadsClient({
  rows,
  canDelete,
}: {
  rows: BankCashHeadRow[];
  canDelete: boolean;
}) {
  return (
    <SimpleMaster
      title="Accounts (Bank / Cash / Card)"
      newLabel="New Account"
      rows={rows}
      columns={columns}
      exportColumns={[
        { header: "Head Name", key: "name" },
        { header: "Type", key: "ledgerGroup" },
        { header: "Description", key: "alias" },
        { header: "Bank", key: "bankName" },
        { header: "A/c No", key: "bankAccount" },
        { header: "IFSC", key: "bankIfsc" },
        { header: "Active", accessor: (r) => (r.isActive ? "YES" : "NO") },
      ]}
      exportName="bank-cash-heads"
      filters={[
        { type: "text", key: "q", label: "Search head..." },
        {
          type: "select",
          key: "type",
          label: "Type",
          options: [
            { value: "BANK", label: "Bank" },
            { value: "CASH", label: "Cash" },
            { value: "CARD", label: "Card" },
          ],
        },
      ]}
      fields={[
        { name: "name", label: "Head Name *", type: "text", uppercase: true },
        {
          name: "ledgerGroup",
          label: "Type *",
          type: "radio",
          options: [
            { value: "BANK", label: "Bank" },
            { value: "CASH", label: "Cash" },
            { value: "CARD", label: "Card (fuel / fleet)" },
          ],
        },
        { name: "alias", label: "Description", type: "text", span2: true },
        {
          name: "bankName",
          label: "Bank Name",
          type: "text",
          visibleIf: (f: FormState) => f.ledgerGroup === "BANK",
        },
        {
          name: "bankAccount",
          label: "Account No",
          type: "text",
          visibleIf: (f: FormState) => f.ledgerGroup === "BANK",
        },
        {
          name: "bankIfsc",
          label: "IFSC",
          type: "text",
          uppercase: true,
          visibleIf: (f: FormState) => f.ledgerGroup === "BANK",
        },
        { name: "isActive", label: "Active", type: "switch" },
      ]}
      defaults={{ name: "", ledgerGroup: "BANK", isActive: true }}
      toForm={(r) => ({ ...r })}
      getId={(r) => r.id}
      save={saveParty}
      remove={deleteParty}
      importConfig={{
        action: importParties,
        templateHeaders: ["Name", "Group"],
        templateExample: ["HDFC BANK", "BANK"],
        templateName: "bank-cash-heads",
      }}
      canDelete={canDelete}
    />
  );
}
