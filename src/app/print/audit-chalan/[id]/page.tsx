import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { authorize } from "@/lib/authz";
import { AuditChalanPrint } from "../audit-chalan-print";
import { AuditPrintToolbar } from "../print-toolbar";

export const dynamic = "force-dynamic";

/** Single Audit Challan sheet. Values come straight from the register row. */
export default async function AuditChalanPrintPage({ params }: { params: { id: string } }) {
  const session = requireSession();
  await authorize(session, "auditreg", "print");

  const data = await withTenant(session.tenantId, async (tx) => {
    const row = await tx.auditChalan.findFirst({
      where: { id: params.id, firmId: session.firmId, deletedAt: null },
    });
    if (!row) return null;
    const firm = await tx.firm.findUnique({ where: { id: session.firmId } });
    return { row, firm };
  });

  if (!data) notFound();

  return (
    <div className="bg-white p-4 text-black">
      <AuditPrintToolbar count={1} />
      <AuditChalanPrint row={data.row} firm={data.firm} />
    </div>
  );
}
