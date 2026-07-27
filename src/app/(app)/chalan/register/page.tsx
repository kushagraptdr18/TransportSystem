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
  const { date_from, date_to, q, broker, vehicle, status, payment, vtype, ownership } = searchParams;

  const [rows, brokers, vehicles] = await withTenant(session.tenantId, async (tx) => {
    // vehicle-based filters (type / ownership) resolve to a vehicle-id list
    const allVehicles = await tx.vehicle.findMany({ orderBy: { number: "asc" } });
    const vehicleIdFilter =
      vtype || ownership
        ? allVehicles
            .filter(
              (v) =>
                (!vtype || (v.vehicleType ?? "") === vtype) &&
                (!ownership || v.ownershipType === ownership)
            )
            .map((v) => v.id)
        : null;

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
        ...(q ? { chalanNo: { contains: q, mode: "insensitive" } } : {}),
        ...(broker ? { brokerId: broker } : {}),
        ...(vehicle ? { vehicleId: vehicle } : {}),
        ...(vehicleIdFilter ? { vehicleId: { in: vehicleIdFilter } } : {}),
        ...(status === "final" ? { isFinal: true } : status === "draft" ? { isFinal: false } : {}),
        ...(payment === "paid"
          ? { paymentStatus: "PAID" }
          : payment === "pending"
            ? { paymentStatus: { not: "PAID" } }
            : {}),
      },
      include: { lrs: { include: { lr: { include: { pods: true } } } } },
      orderBy: { chalanDate: "desc" },
    });
    const brokers = await tx.party.findMany({
      where: { ledgerGroup: { in: ["OWNER_BROKER", "RELATIVE"] }, isActive: true },
      orderBy: { name: "asc" },
    });
    const vehicles = allVehicles.filter((v) => v.isActive);
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
    mamool: toNum(c.mamool),
    courierCharge: toNum(c.courierCharge),
    isFinal: c.isFinal,
    podDone: c.lrs.filter((l) => l.lr.pods.length > 0).length,
    // shortage weight recorded on the LRs' PODs (visible before balance payment)
    shortageWt: c.lrs.flatMap((l) => l.lr.pods).reduce((s, p) => s + toNum(p.shortageWt), 0),
    // shortage amount + round-off applied at balance payment (visible after)
    shortage: Number(c.balShortage),
    roundOff: Number(c.balRoundOff),
    paymentStatus: c.paymentStatus,
    balPaidAmount: Number(c.balPaidAmount),
  }));

  const vehicleTypes = Array.from(
    new Set(vehicles.map((v) => v.vehicleType).filter((t): t is string => Boolean(t)))
  ).sort();

  return (
    <ChalanRegisterClient
      rows={data}
      brokers={brokers.map((b) => ({ value: b.id, label: b.name }))}
      vehicles={vehicles.map((v) => ({ value: v.id, label: v.number }))}
      vehicleTypes={vehicleTypes}
      canDelete={session.role === "ADMIN" || session.role === "OWNER"}
    />
  );
}
