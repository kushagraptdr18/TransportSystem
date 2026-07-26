import type { Prisma } from "@prisma/client";
import { requireSession } from "@/lib/session";
import { authorize } from "@/lib/authz";
import { withTenant } from "@/lib/db";
import {
  BankCashHeadsClient,
  type BankCashHeadRow,
} from "@/components/masters/bank-cash-heads-client";

export const dynamic = "force-dynamic";

export default async function BankCashHeadsPage({
  searchParams,
}: {
  searchParams: { q?: string; type?: string };
}) {
  const session = requireSession();
  await authorize(session, "masters", "view");

  const rows = await withTenant(session.tenantId, async (tx) => {
    const where: Prisma.PartyWhereInput = {
      ledgerGroup: searchParams.type === "BANK" || searchParams.type === "CASH"
        ? searchParams.type
        : { in: ["BANK", "CASH"] },
    };
    if (searchParams.q) where.name = { contains: searchParams.q, mode: "insensitive" };
    return tx.party.findMany({ where, orderBy: [{ ledgerGroup: "asc" }, { name: "asc" }] });
  });

  const data: BankCashHeadRow[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    ledgerGroup: r.ledgerGroup,
    alias: r.alias,
    bankName: r.bankName,
    bankAccount: r.bankAccount,
    bankIfsc: r.bankIfsc,
    isActive: r.isActive,
  }));

  const canDelete = session.role === "ADMIN" || session.role === "OWNER";
  return <BankCashHeadsClient rows={data} canDelete={canDelete} />;
}
