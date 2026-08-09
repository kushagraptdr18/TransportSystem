import { requireSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { authorize } from "@/lib/authz";
import { toNum } from "@/lib/utils";
import { buildAuditChalanWhere } from "@/lib/audit-chalan-query";
import { AuditChalanRegisterClient, type AuditChalanRow } from "./register-client";

export const dynamic = "force-dynamic";

/**
 * Reports -> Audit Function -> Audit Challan Register.
 *
 * Reads only the AuditChalan table. No master is joined, so a row referring
 * to a transport or city that exists nowhere else still lists, exports and
 * prints exactly as captured.
 */
export default async function AuditChalanRegisterPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const session = requireSession();
  await authorize(session, "auditreg", "view");

  const rows = await withTenant(session.tenantId, async (tx) =>
    tx.auditChalan.findMany({
      where: buildAuditChalanWhere(session.firmId, searchParams),
      orderBy: [{ chalanDate: "desc" }, { chalanNo: "desc" }],
    })
  );

  const data: AuditChalanRow[] = rows.map((r) => ({
    id: r.id,
    chalanNo: r.chalanNo,
    chalanDate: r.chalanDate.toISOString(),
    transportName: r.transportName,
    ownerName: r.ownerName,
    panCard: r.panCard,
    loadingFrom: r.loadingFrom,
    toLocation: r.toLocation,
    actualWt: toNum(r.actualWt),
    chargeWt: toNum(r.chargeWt),
    freightRate: toNum(r.freightRate),
    freightAmount: toNum(r.freightAmount),
    tdsAmount: toNum(r.tdsAmount),
    advanceBank: toNum(r.advanceBank),
    cash: toNum(r.cash),
    diesel: toNum(r.diesel),
    tyre: toNum(r.tyre),
    uria: toNum(r.uria),
    other: toNum(r.other),
    balance: toNum(r.balance),
  }));

  return (
    <AuditChalanRegisterClient
      rows={data}
      canCreate={session.role !== "VIEWER"}
      canDelete={session.role === "OWNER" || session.role === "ADMIN"}
    />
  );
}
