import { requireSession } from "@/lib/session";
import { authorize } from "@/lib/authz";
import { withTenant } from "@/lib/db";
import { TripClosureClient } from "@/components/billing/trip-closure-client";

export const dynamic = "force-dynamic";

export default async function TripClosurePage() {
  const session = requireSession();
  await authorize(session, "billing", "view");

  // LR numbers of the current FY for the type-ahead selector (read-only)
  const lrs = await withTenant(session.tenantId, (tx) =>
    tx.lr.findMany({
      where: { firmId: session.firmId, fyId: session.fyId, deletedAt: null },
      select: { lrNo: true, obdNo: true },
      orderBy: { lrDate: "desc" },
    })
  );

  return (
    <div className="space-y-4 p-4">
      <TripClosureClient
        lrOptions={lrs.map((l) => ({
          value: l.lrNo,
          label: l.lrNo,
          meta: l.obdNo ?? undefined,
        }))}
      />
    </div>
  );
}
