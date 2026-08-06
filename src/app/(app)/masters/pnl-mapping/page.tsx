import { requireSession } from "@/lib/session";
import { authorize } from "@/lib/authz";
import { withTenant } from "@/lib/db";
import { PnlMappingClient } from "./pnl-mapping-client";

export const dynamic = "force-dynamic";

/** P&L Head Mapping — decide which operational P&L each ledger head reports in. */
export default async function PnlMappingPage() {
  const session = requireSession();
  await authorize(session, "masters", "view");
  const heads = await withTenant(session.tenantId, (tx) =>
    tx.accountHead.findMany({
      select: { id: true, name: true, kind: true, pnlScope: true },
      orderBy: { name: "asc" },
    })
  );
  return (
    <PnlMappingClient
      heads={heads.map((h) => ({
        id: h.id,
        name: h.name,
        kind: h.kind,
        pnlScope: h.pnlScope as "AUTO" | "COMPANY" | "VEHICLE" | "EXCLUDE",
      }))}
    />
  );
}
