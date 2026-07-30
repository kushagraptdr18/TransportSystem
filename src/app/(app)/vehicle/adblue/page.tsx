import type { Prisma } from "@prisma/client";
import { requireSession } from "@/lib/session";
import { authorize } from "@/lib/authz";
import { withTenant } from "@/lib/db";
import { toNum } from "@/lib/utils";
import { AdblueClient, type AdblueRow } from "@/components/vehicle/adblue-client";

export const dynamic = "force-dynamic";

export default async function AdbluePage({
  searchParams,
}: {
  searchParams: { type?: string; vehicle?: string; date_from?: string; date_to?: string };
}) {
  const session = requireSession();
  await authorize(session, "maintenance", "view");

  const { txns, allTxns, vehicles, banks } = await withTenant(session.tenantId, async (tx) => {
    const base: Prisma.AdblueTxnWhereInput = {
      firmId: session.firmId,
      fyId: session.fyId,
      deletedAt: null,
    };
    const where: Prisma.AdblueTxnWhereInput = { ...base };
    if (searchParams.type === "REFILL" || searchParams.type === "ISSUE") {
      where.type = searchParams.type;
    }
    if (searchParams.vehicle) where.vehicleId = searchParams.vehicle;
    if (searchParams.date_from || searchParams.date_to) {
      where.date = {
        ...(searchParams.date_from ? { gte: new Date(searchParams.date_from + "T00:00:00") } : {}),
        ...(searchParams.date_to ? { lte: new Date(searchParams.date_to + "T23:59:59") } : {}),
      };
    }
    const [txns, allTxns, vehicles, banks] = await Promise.all([
      tx.adblueTxn.findMany({ where, orderBy: [{ date: "desc" }, { createdAt: "desc" }] }),
      // overall stock position is always computed over ALL entries of the FY
      tx.adblueTxn.groupBy({ by: ["type"], where: base, _sum: { qty: true } }),
      tx.vehicle.findMany({ where: { isActive: true }, orderBy: { number: "asc" } }),
      tx.party.findMany({
        where: { isActive: true, ledgerGroup: { in: ["BANK", "CASH"] } },
        orderBy: { name: "asc" },
      }),
    ]);
    return { txns, allTxns, vehicles, banks };
  });

  const vehicleNo = new Map(vehicles.map((v) => [v.id, v.number]));
  const sumOf = (t: string) =>
    toNum(String(allTxns.find((r) => r.type === t)?._sum.qty ?? 0));
  const totalRefill = sumOf("REFILL");
  const totalIssued = sumOf("ISSUE");

  const rows: AdblueRow[] = txns.map((t) => ({
    id: t.id,
    type: t.type,
    date: t.date.toISOString(),
    supplierName: t.supplierName ?? "",
    vehicleId: t.vehicleId,
    vehicle: t.vehicleId ? vehicleNo.get(t.vehicleId) ?? "" : "",
    destination: t.destination ?? "",
    qty: toNum(String(t.qty)),
    amount: toNum(String(t.amount)),
    bankPartyId: t.bankPartyId,
    refNo: t.refNo ?? "",
    remarks: t.remarks ?? "",
  }));

  return (
    <div className="space-y-4 p-4">
      <AdblueClient
        rows={rows}
        totals={{
          totalRefill,
          totalIssued,
          closing: Math.round((totalRefill - totalIssued) * 100) / 100,
        }}
        vehicleOptions={vehicles.map((v) => ({ value: v.id, label: v.number }))}
        bankOptions={banks.map((b) => ({ value: b.id, label: b.name, meta: b.ledgerGroup }))}
        canDelete={session.role === "ADMIN" || session.role === "OWNER"}
      />
    </div>
  );
}
