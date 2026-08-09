import { requireSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { authorize } from "@/lib/authz";
import { buildAuditChalanWhere } from "@/lib/audit-chalan-query";
import { AuditChalanPrint } from "../audit-chalan-print";
import { AuditPrintToolbar } from "../print-toolbar";

export const dynamic = "force-dynamic";

/**
 * Bulk print. Two ways in:
 *   ?ids=a,b,c                      — the rows ticked in the register
 *   ?date_from=&date_to=&q=         — everything the current filter matches
 *
 * Each challan is its own page (break-after-page on the card), so a 100-row
 * filter prints as a 100-page document and "Save as PDF" in the browser's
 * print dialog produces one combined 100-page PDF.
 */
export default async function AuditChalanBulkPrintPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const session = requireSession();
  await authorize(session, "auditreg", "print");

  const ids = (searchParams.ids ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const data = await withTenant(session.tenantId, async (tx) => {
    const rows = await tx.auditChalan.findMany({
      where: ids.length
        ? { id: { in: ids }, firmId: session.firmId, deletedAt: null }
        : buildAuditChalanWhere(session.firmId, searchParams),
      orderBy: [{ chalanDate: "asc" }, { chalanNo: "asc" }],
    });
    const firm = await tx.firm.findUnique({ where: { id: session.firmId } });
    return { rows, firm };
  });

  if (data.rows.length === 0) {
    return (
      <div className="bg-white p-8 text-center text-black">
        <p className="text-sm">
          No Audit Challans match the current selection — nothing to print.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white p-4 text-black">
      <AuditPrintToolbar count={data.rows.length} />
      <div className="space-y-6">
        {data.rows.map((row) => (
          <AuditChalanPrint key={row.id} row={row} firm={data.firm} />
        ))}
      </div>
    </div>
  );
}
