import { requireSession } from "@/lib/session";
import { authorize } from "@/lib/authz";
import { withTenant } from "@/lib/db";
import { JobHeadsClient } from "@/components/masters/job-heads-client";

export default async function JobHeadsPage({ searchParams }: { searchParams: { q?: string } }) {
  const session = requireSession();
  await authorize(session, "masters", "view");
  const q = searchParams.q?.trim();

  const rows = await withTenant(session.tenantId, (tx) =>
    tx.jobHead.findMany({
      where: q ? { name: { contains: q, mode: "insensitive" } } : undefined,
      orderBy: { name: "asc" },
    })
  );

  const canDelete = session.role === "ADMIN" || session.role === "OWNER";
  return (
    <JobHeadsClient
      rows={rows.map((r) => ({
        id: r.id,
        name: r.name,
        gstPct: Number(r.gstPct),
        hsnCode: r.hsnCode,
        description: r.description,
        showReminder: r.showReminder,
      }))}
      canDelete={canDelete}
    />
  );
}
