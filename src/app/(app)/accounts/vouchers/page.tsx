import { requireSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { peekDocNumber } from "@/lib/sequences";
import { getPartyOptions, getBankOptions, getVehicleOptions } from "@/lib/lookups";
import { VoucherForm, RecentVoucher } from "@/components/accounts/voucher-form";
import { getAccountHeadOptions } from "./actions";
import { VoucherType, DocNumberType } from "@prisma/client";

export const dynamic = "force-dynamic";

const TYPES: VoucherType[] = ["RECEIPT", "PAYMENT", "CONTRA"];

export default async function VouchersPage() {
  const session = requireSession();

  const [partyOptions, bankOptions, vehicleOptions, accountHeadOptions] = await Promise.all([
    getPartyOptions(),
    getBankOptions(),
    getVehicleOptions(),
    getAccountHeadOptions(),
  ]);

  const { peekNumbers, recent } = await withTenant(session.tenantId, async (tx) => {
    const peekNumbers = {} as Record<VoucherType, string>;
    const recent = {} as Record<VoucherType, RecentVoucher[]>;
    const parties = await tx.party.findMany({ select: { id: true, name: true } });
    const partyName = new Map(parties.map((p) => [p.id, p.name]));
    for (const t of TYPES) {
      peekNumbers[t] =
        (await peekDocNumber(tx, {
          firmId: session.firmId,
          fyId: session.fyId,
          docType: `VOUCHER_${t}` as DocNumberType,
        })) ?? "1";
      const vouchers = await tx.voucher.findMany({
        where: {
          firmId: session.firmId,
          fyId: session.fyId,
          type: t,
          deletedAt: null,
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      });
      recent[t] = vouchers.map((v) => ({
        id: v.id,
        voucherNo: v.voucherNo,
        voucherDate: v.voucherDate.toISOString(),
        partyName: v.partyId ? partyName.get(v.partyId) ?? null : null,
        bankName: v.bankPartyId ? partyName.get(v.bankPartyId) ?? null : null,
        moduleLink: v.moduleLink,
        amount: Number(v.amount),
        netAmount: Number(v.netAmount),
      }));
    }
    return { peekNumbers, recent };
  });

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-semibold">Voucher Entry</h1>
      <VoucherForm
        peekNumbers={peekNumbers}
        partyOptions={partyOptions}
        bankOptions={bankOptions}
        vehicleOptions={vehicleOptions}
        accountHeadOptions={accountHeadOptions}
        recent={recent}
      />
    </div>
  );
}
