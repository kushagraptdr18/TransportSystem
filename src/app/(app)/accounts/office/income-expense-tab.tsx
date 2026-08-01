import { requireSession } from "@/lib/session";
import { authorize } from "@/lib/authz";
import { withTenant } from "@/lib/db";
import { toNum } from "@/lib/utils";
import {
  OfficeTxnClient,
  type OfficeTxnRow,
} from "@/components/accounts/office-txn-client";

export const dynamic = "force-dynamic";

export async function OfficeIncomeExpenseTab({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const session = requireSession();
  await authorize(session, "vouchers", "view");
  const { date_from, date_to, type, head, party, mode, q } = searchParams;

  const { txns, heads, parties, banks } = await withTenant(session.tenantId, async (tx) => {
    const [txns, heads, parties, banks] = await Promise.all([
      tx.officeTransaction.findMany({
        where: {
          firmId: session.firmId,
          fyId: session.fyId,
          deletedAt: null,
          ...(date_from || date_to
            ? {
                date: {
                  ...(date_from ? { gte: new Date(date_from + "T00:00:00") } : {}),
                  ...(date_to ? { lte: new Date(date_to + "T23:59:59") } : {}),
                },
              }
            : {}),
          ...(type === "INCOME" || type === "EXPENSE" ? { txnType: type } : {}),
          ...(head ? { headId: head } : {}),
          ...(party ? { partyId: party } : {}),
          ...(mode === "CASH" || mode === "BANK"
            ? { paymentMode: mode }
            : mode === "CREDIT"
              ? { paymentMode: null }
              : {}),
          ...(q
            ? {
                OR: [
                  { voucherNo: { contains: q, mode: "insensitive" } },
                  { refNo: { contains: q, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      }),
      tx.accountHead.findMany({
        where: { kind: { in: ["INCOME", "EXPENSE"] } },
        orderBy: { name: "asc" },
      }),
      tx.party.findMany({
        where: { isActive: true, ledgerGroup: { notIn: ["BANK", "CASH"] } },
        orderBy: { name: "asc" },
      }),
      tx.party.findMany({
        where: { isActive: true, ledgerGroup: { in: ["BANK", "CASH"] } },
        orderBy: { name: "asc" },
      }),
    ]);
    return { txns, heads, parties, banks };
  });

  const headName = new Map(heads.map((h) => [h.id, h.name]));
  const partyName = new Map([...parties, ...banks].map((p) => [p.id, p.name]));

  const rows: OfficeTxnRow[] = txns.map((t) => ({
    id: t.id,
    voucherNo: t.voucherNo,
    date: t.date.toISOString(),
    txnType: t.txnType,
    headId: t.headId,
    head: headName.get(t.headId) ?? "",
    partyId: t.partyId,
    party: t.partyId ? partyName.get(t.partyId) ?? "" : "",
    paymentMode: t.paymentMode ?? "",
    bankPartyId: t.bankPartyId,
    bank: t.bankPartyId ? partyName.get(t.bankPartyId) ?? "" : "",
    amount: toNum(String(t.amount)),
    gstPct: toNum(String(t.gstPct)),
    gstAmount: toNum(String(t.gstAmount)),
    refNo: t.refNo ?? "",
    remarks: t.remarks ?? "",
    attachmentPath: t.attachmentPath,
  }));

  return (
    <div className="space-y-4">
      <OfficeTxnClient
        rows={rows}
        headOptions={heads.map((h) => ({ value: h.id, label: h.name, meta: h.kind }))}
        partyOptions={parties.map((p) => ({
          value: p.id,
          label: p.name,
          meta: p.ledgerGroup.replace(/_/g, " "),
        }))}
        bankOptions={banks.map((b) => ({ value: b.id, label: b.name, meta: b.ledgerGroup }))}
        canDelete={session.role === "ADMIN" || session.role === "OWNER"}
      />
    </div>
  );
}
