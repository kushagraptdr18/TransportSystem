import { requireSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { toNum } from "@/lib/utils";
import { invoiceSettlement, payableSettlement } from "@/lib/settlement";
import { ChalanRegisterClient, type ChalanRegisterRow } from "./register-client";

export const dynamic = "force-dynamic";

export default async function ChalanRegisterPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const session = requireSession();
  const { date_from, date_to, q, broker, vehicle, status, payment, ownership, shortage } =
    searchParams;
  // two registers in one screen: MARKET (payable workflow, the default) and
  // OWNREL (own + relative vehicles — no payment actions, hisab via ledger)
  const tab = searchParams.type === "OWNREL" ? ("OWNREL" as const) : ("MARKET" as const);
  // each tab has its own Cancel Register: cancelled chalans leave the normal
  // register entirely and live here until restored
  const view = searchParams.view === "CANCELLED" ? ("CANCELLED" as const) : ("ACTIVE" as const);

  const [rows, brokers, vehicles, billStatusByChalan, payable] = await withTenant(
    session.tenantId,
    async (tx) => {
    // ownership resolves to a vehicle-id list (it also covers vehicle type)
    const allVehicles = await tx.vehicle.findMany({ orderBy: { number: "asc" } });
    // the tab decides the ownership universe; the ownership filter can only
    // narrow WITHIN it (Own vs Relative on the OWNREL tab)
    const allowed = tab === "MARKET" ? ["BROKER"] : ["OWNER", "RELATIVE"];
    const effective = ownership && allowed.includes(ownership) ? [ownership] : allowed;
    const vehicleIdFilter = allVehicles
      .filter((v) => effective.includes(v.ownershipType))
      .map((v) => v.id);

    const chalans = await tx.chalan.findMany({
      where: {
        firmId: session.firmId,
        fyId: session.fyId,
        deletedAt: null,
        cancelledAt: view === "CANCELLED" ? { not: null } : null,
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
        // a picked vehicle must still belong to the active tab's universe
        vehicleId:
          vehicle && vehicleIdFilter.includes(vehicle) ? vehicle : { in: vehicleIdFilter },
        ...(status === "final" ? { isFinal: true } : status === "draft" ? { isFinal: false } : {}),
        // the payment filter is applied after settlement is computed, since a
        // voucher can settle a chalan whose stored status still says PENDING
        // shortage weight lives on the LRs' PODs, so filter through the relation
        ...(shortage === "yes"
          ? { lrs: { some: { lr: { pods: { some: { shortageWt: { gt: 0 } } } } } } }
          : shortage === "no"
            ? { lrs: { none: { lr: { pods: { some: { shortageWt: { gt: 0 } } } } } } }
            : {}),
      },
      include: {
        lrs: { include: { lr: { include: { pods: true, invoiceLrs: { include: { invoice: true } } } } } },
      },
      orderBy: { chalanDate: "desc" },
    });
    const brokers = await tx.party.findMany({
      where: { ledgerGroup: { in: ["OWNER_BROKER", "RELATIVE"] }, isActive: true },
      orderBy: { name: "asc" },
    });
    const vehicles = allVehicles.filter((v) => v.isActive);

    // Bill status must reflect receipts entered after the bill was raised, so
    // it is derived from live voucher allocations, never from Invoice.balance
    // (which is frozen at bill-creation time).
    const invoices = Array.from(
      new Map(
        chalans
          .flatMap((c) => c.lrs.flatMap((l) => l.lr.invoiceLrs.map((il) => il.invoice)))
          .map((i) => [i.id, i])
      ).values()
    );
    const settlement = await invoiceSettlement(tx, {
      firmId: session.firmId,
      fyId: session.fyId,
      invoices,
    });
    const billStatusByChalan = new Map<string, string>();
    for (const c of chalans) {
      const invs = Array.from(
        new Set(c.lrs.flatMap((l) => l.lr.invoiceLrs.map((il) => il.invoiceId)))
      );
      if (invs.length === 0) {
        billStatusByChalan.set(c.id, "NOT BILLED");
        continue;
      }
      const states = invs.map((id) => settlement.get(id)?.status ?? "UNPAID");
      billStatusByChalan.set(
        c.id,
        states.every((s) => s === "PAID")
          ? "PAID"
          : states.every((s) => s === "UNPAID")
            ? "UNPAID"
            : "PARTLY PAID"
      );
    }
    // a chalan can also be settled from a Payment Voucher, so the register's
    // balance and payment status come from the combined position
    const payable = await payableSettlement(tx, {
      firmId: session.firmId,
      fyId: session.fyId,
      refType: "FREIGHT_CHALLAN",
      docs: chalans.map((c) => ({
        id: c.id,
        balance: toNum(c.balance),
        ownPaid: toNum(c.balPaidAmount),
        ownShortage: toNum(c.balShortage),
        ownRoundOff: toNum(c.balRoundOff),
        ownAdvanceAdjusted: toNum(c.balAdvanceAdjusted),
      })),
    });
    return [chalans, brokers, vehicles, billStatusByChalan, payable] as const;
    }
  );

  const brokerName = (id: string) => brokers.find((b) => b.id === id)?.name ?? "";
  const vehicleNo = (id: string) => vehicles.find((v) => v.id === id)?.number ?? "";

  const mapped: ChalanRegisterRow[] = rows.map((c) => ({
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
    balance: payable.get(c.id)?.outstanding ?? toNum(c.balance),
    mamool: toNum(c.mamool),
    courierCharge: toNum(c.courierCharge),
    isFinal: c.isFinal,
    podDone: c.lrs.filter((l) => l.lr.pods.length > 0).length,
    // shortage weight recorded on the LRs' PODs (visible before balance payment)
    shortageWt: c.lrs.flatMap((l) => l.lr.pods).reduce((s, p) => s + toNum(p.shortageWt), 0),
    // shortage amount + round-off applied at balance payment (visible after)
    shortage: Number(c.balShortage),
    roundOff: Number(c.balRoundOff),
    // payment status and paid amount span both settlement paths
    paymentStatus: c.cancelledAt
      ? "CANCELLED"
      : (payable.get(c.id)?.outstanding ?? 0) <= 0.009
        ? "PAID"
        : c.paymentStatus,
    balPaidAmount: payable.get(c.id)?.settled ?? Number(c.balPaidAmount),
    billStatus: billStatusByChalan.get(c.id) ?? "NOT BILLED",
    cancelled: !!c.cancelledAt,
    cancelReason: c.cancelReason ?? "",
  }));

  const data =
    payment === "paid"
      ? mapped.filter((r) => r.paymentStatus === "PAID")
      : payment === "pending"
        ? // a cancelled chalan owes nothing, so it is neither paid nor pending
          mapped.filter((r) => r.paymentStatus !== "PAID" && !r.cancelled)
        : mapped;

  return (
    <ChalanRegisterClient
      rows={data}
      mode={tab}
      view={view}
      brokers={brokers.map((b) => ({ value: b.id, label: b.name }))}
      vehicles={vehicles.map((v) => ({ value: v.id, label: v.number }))}
      canDelete={session.role === "ADMIN" || session.role === "OWNER"}
    />
  );
}
