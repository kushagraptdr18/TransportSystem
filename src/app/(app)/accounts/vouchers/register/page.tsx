import { requireSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { getPartyOptions, getVehicleOptions } from "@/lib/lookups";
import { FilterBar } from "@/components/data/filter-bar";
import {
  VoucherRegisterTable,
  RegisterRow,
} from "@/components/accounts/voucher-register-table";
import { VoucherType, ModuleLink, Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const MODULE_LINKS = [
  "BILLING",
  "LORRY_HIRE",
  "BROKER_ENTRY",
  "FREIGHT_CHALLAN",
  "CASH_MEMO",
  "GST_BILLING",
  "LR_ENTRY",
  "OTHERS",
];

function toDate(s: string | undefined, end = false): Date | undefined {
  if (!s) return undefined;
  return new Date(`${s}T${end ? "23:59:59" : "00:00:00"}`);
}

export default async function VoucherRegisterPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const session = requireSession();
  const [partyOptions, vehicleOptions] = await Promise.all([
    getPartyOptions(),
    getVehicleOptions(),
  ]);

  const type = searchParams.type as VoucherType | undefined;
  const where: Prisma.VoucherWhereInput = {
    firmId: session.firmId,
    fyId: session.fyId,
    deletedAt: null,
    ...(type && ["RECEIPT", "PAYMENT", "CONTRA"].includes(type) ? { type } : {}),
    ...(searchParams.party ? { partyId: searchParams.party } : {}),
    ...(searchParams.vehicle ? { vehicleId: searchParams.vehicle } : {}),
    ...(searchParams.module && MODULE_LINKS.includes(searchParams.module)
      ? { moduleLink: searchParams.module as ModuleLink }
      : {}),
    ...(searchParams.date_from || searchParams.date_to
      ? {
          voucherDate: {
            ...(toDate(searchParams.date_from) ? { gte: toDate(searchParams.date_from) } : {}),
            ...(toDate(searchParams.date_to, true) ? { lte: toDate(searchParams.date_to, true) } : {}),
          },
        }
      : {}),
  };

  const rows: RegisterRow[] = await withTenant(session.tenantId, async (tx) => {
    const [vouchers, parties] = await Promise.all([
      tx.voucher.findMany({ where, orderBy: [{ voucherDate: "asc" }, { voucherNo: "asc" }] }),
      tx.party.findMany({ select: { id: true, name: true } }),
    ]);
    const partyName = new Map(parties.map((p) => [p.id, p.name]));
    return vouchers.map((v) => ({
      id: v.id,
      voucherNo: v.voucherNo,
      voucherDate: v.voucherDate.toISOString(),
      type: v.type,
      partyName: v.partyId ? partyName.get(v.partyId) ?? null : null,
      moduleLink: v.moduleLink,
      bankName: v.bankPartyId ? partyName.get(v.bankPartyId) ?? null : null,
      chequeNo: v.chequeNo,
      amount: Number(v.amount),
      tdsAmt: Number(v.tdsAmt),
      deduction: Number(v.deduction),
      netAmount: Number(v.netAmount),
    }));
  });

  const canDelete = session.role === "ADMIN" || session.role === "OWNER";

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-semibold">
        {type === "PAYMENT" ? "Payment Register" : type === "RECEIPT" ? "Receipt Register" : "Voucher Register"}
      </h1>
      <FilterBar
        filters={[
          { type: "daterange", key: "date", label: "Date" },
          {
            type: "select",
            key: "type",
            label: "Type",
            options: [
              { value: "RECEIPT", label: "Receipt" },
              { value: "PAYMENT", label: "Payment" },
              { value: "CONTRA", label: "Contra" },
            ],
          },
          { type: "combobox", key: "party", label: "Party", options: partyOptions },
          {
            type: "select",
            key: "module",
            label: "Module",
            options: MODULE_LINKS.map((m) => ({ value: m, label: m.replace(/_/g, " ") })),
          },
          { type: "combobox", key: "vehicle", label: "Vehicle", options: vehicleOptions },
        ]}
      />
      <VoucherRegisterTable rows={rows} canDelete={canDelete} />
    </div>
  );
}
