import { requireSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { peekDocNumber } from "@/lib/sequences";
import { getPartyOptions, getBankOptions, getVehicleOptions } from "@/lib/lookups";
import { VoucherEntry, RecentVoucher } from "@/components/accounts/voucher-entry";
import { VoucherType, DocNumberType } from "@prisma/client";

export const dynamic = "force-dynamic";

const TYPES: VoucherType[] = ["RECEIPT", "PAYMENT", "CONTRA", "JOURNAL"];

export default async function VouchersPage() {
  const session = requireSession();

  const [partyOptions, bankOptions, vehicleOptions] = await Promise.all([
    getPartyOptions(),
    getBankOptions(),
    getVehicleOptions(),
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
      // advances these vouchers created, with the documents that consumed them
      const advances = vouchers.length
        ? await tx.partyAdvance.findMany({
            where: { voucherId: { in: vouchers.map((v) => v.id) }, deletedAt: null },
            include: { uses: { orderBy: { date: "asc" } } },
          })
        : [];
      const advByVoucher = new Map(advances.map((a) => [a.voucherId ?? "", a]));
      recent[t] = vouchers.map((v) => ({
        id: v.id,
        voucherNo: v.voucherNo,
        voucherDate: v.voucherDate.toISOString(),
        partyName: v.partyId ? partyName.get(v.partyId) ?? null : null,
        bankName: v.bankPartyId ? partyName.get(v.bankPartyId) ?? null : null,
        moduleLink: v.moduleLink,
        amount: Number(v.amount),
        netAmount: Number(v.netAmount),
        advance: (() => {
          const a = advByVoucher.get(v.id);
          if (!a) return null;
          const amount = Number(a.amount);
          const consumed = Number(a.consumedAmount);
          return {
            amount,
            consumed,
            balance: Math.round((amount - consumed) * 100) / 100,
            uses: a.uses.map((u) => ({
              refNo: u.refNo,
              amount: Number(u.amount),
              date: u.date.toISOString(),
            })),
          };
        })(),
      }));
    }
    return { peekNumbers, recent };
  });

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-semibold">Voucher Entry</h1>
      <VoucherEntry
        peekNumbers={peekNumbers}
        partyOptions={partyOptions}
        bankOptions={bankOptions}
        vehicleOptions={vehicleOptions}
        recent={recent}
      />
    </div>
  );
}
