import { requireSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { toNum } from "@/lib/utils";
import { ChalanRegisterClient, type ChalanRegisterRow } from "./register-client";

export const dynamic = "force-dynamic";

export default async function ChalanRegisterPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const session = requireSession();
  const { date_from, date_to, broker, vehicle, status } = searchParams;

  const [rows, brokers, vehicles] = await withTenant(session.tenantId, async (tx) => {
    const chalans = await tx.chalan.findMany({
      where: {
        firmId: session.firmId,
        fyId: session.fyId,
        deletedAt: null,
        ...(date_from || date_to
          ? {
              chalanDate: {
                ...(date_from ? { gte: new Date(date_from + "T00:00:00") } : {}),
                ...(date_to ? { lte: new Date(date_to + "T23:59:59") } : {}),
              },
            }
          : {}),
        ...(broker ? { brokerId: broker } : {}),
        ...(vehicle ? { vehicleId: vehicle } : {}),
        ...(status === "final" ? { isFinal: true } : status === "draft" ? { isFinal: false } : {}),
      },
      include: { lrs: true },
      orderBy: { chalanDate: "desc" },
    });
    const brokers = await tx.party.findMany({
      where: { ledgerGroup: "OWNER_BROKER", isActive: true },
      orderBy: { name: "asc" },
    });
    const vehicles = await tx.vehicle.findMany({
      where: { isActive: true },
      orderBy: { number: "asc" },
    });
    return [chalans, brokers, vehicles] as const;
  });

  const brokerName = (id: string) => brokers.find((b) => b.id === id)?.name ?? "";
  const vehicleNo = (id: string) => vehicles.find((v) => v.id === id)?.number ?? "";

  const data: ChalanRegisterRow[] = rows.map((c) => ({
    id: c.id,
    chalanNo: c.chalanNo,
    chalanDate: c.chalanDate.toISOString(),
    broker: brokerName(c.brokerId),
    vehicle: vehicleNo(c.vehicleId),
    lrCount: c.lrs.length,
    freight: toNum(c.freight),
    tdsAmt: toNum(c.tdsAmt),
    commissionAmt: toNum(c.commissionAmt),
    advanceTotal: toNum(c.advanceTotal),
    balance: toNum(c.balance),
    isFinal: c.isFinal,
  }));

  return (
    <ChalanRegisterClient
      rows={data}
      brokers={brokers.map((b) => ({ value: b.id, label: b.name }))}
      vehicles={vehicles.map((v) => ({ value: v.id, label: v.number }))}
      canDelete={session.role === "ADMIN" || session.role === "OWNER"}
    />
  );
}
