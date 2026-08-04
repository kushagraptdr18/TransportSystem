import type { Prisma } from "@prisma/client";
import { requireSession } from "@/lib/session";
import { authorize } from "@/lib/authz";
import { withTenant } from "@/lib/db";
import { toNum } from "@/lib/utils";
import { AdblueClient, type AdblueRow } from "@/components/vehicle/adblue-client";
import { settledByRef } from "@/lib/settlement";

export const dynamic = "force-dynamic";

export default async function AdbluePage({
  searchParams,
}: {
  searchParams: {
    type?: string;
    vehicle?: string;
    status?: string;
    date_from?: string;
    date_to?: string;
  };
}) {
  const session = requireSession();
  await authorize(session, "maintenance", "view");

  const { txns, allTxns, vehicles, banks, suppliers, settled } = await withTenant(
    session.tenantId,
    async (tx) => {
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
    const [txns, allTxns, vehicles, banks, suppliers] = await Promise.all([
      tx.adblueTxn.findMany({ where, orderBy: [{ date: "desc" }, { createdAt: "desc" }] }),
      // overall stock position is always computed over ALL entries of the FY
      tx.adblueTxn.groupBy({ by: ["type"], where: base, _sum: { qty: true } }),
      tx.vehicle.findMany({ where: { isActive: true }, orderBy: { number: "asc" } }),
      tx.party.findMany({
        where: { isActive: true, ledgerGroup: { in: ["BANK", "CASH", "CARD"] } },
        orderBy: { name: "asc" },
      }),
      tx.party.findMany({
        where: { isActive: true, ledgerGroup: { notIn: ["BANK", "CASH", "CARD"] } },
        orderBy: { name: "asc" },
      }),
    ]);
    // what payment vouchers have already settled against these bills
    const settled = await settledByRef(tx, {
      firmId: session.firmId,
      fyId: session.fyId,
      refTypes: ["ADBLUE_PURCHASE"],
      refIds: txns.map((t) => t.id),
    });
      return { txns, allTxns, vehicles, banks, suppliers, settled };
    }
  );

  const vehicleNo = new Map(vehicles.map((v) => [v.id, v.number]));
  const sumOf = (t: string) =>
    toNum(String(allTxns.find((r) => r.type === t)?._sum.qty ?? 0));
  const totalRefill = sumOf("REFILL");
  const totalIssued = sumOf("ISSUE");

  const supplierName = new Map(suppliers.map((p) => [p.id, p.name]));
  const DAY = 24 * 60 * 60 * 1000;
  const today = new Date();

  /**
   * Where a refill stands. A receipt with no bill is PENDING BILL and carries no
   * accounting at all; once billed it is BILL UPDATED until it is settled —
   * immediately, when it was paid at entry, or later by a payment voucher.
   */
  const statusOf = (t: (typeof txns)[number]) => {
    if (t.type !== "REFILL") return "";
    if (!t.billNo) return "PENDING BILL";
    if (t.paymentMode) return "PAID";
    const amount = toNum(String(t.amount));
    const paid = settled.get(t.id) ?? 0;
    if (paid >= amount - 0.009) return "PAID";
    return paid > 0.009 ? "PARTLY PAID" : "BILL UPDATED";
  };

  const rows: AdblueRow[] = txns.map((t) => ({
    id: t.id,
    type: t.type,
    date: t.date.toISOString(),
    supplierName: t.supplierId ? supplierName.get(t.supplierId) ?? "" : t.supplierName ?? "",
    supplierId: t.supplierId,
    vehicleId: t.vehicleId,
    vehicle: t.vehicleId ? vehicleNo.get(t.vehicleId) ?? "" : "",
    destination: t.destination ?? "",
    qty: toNum(String(t.qty)),
    amount: toNum(String(t.amount)),
    billNo: t.billNo ?? "",
    billDate: t.billDate ? t.billDate.toISOString() : null,
    gstPct: toNum(String(t.gstPct)),
    gstAmount: toNum(String(t.gstAmount)),
    paymentMode: t.paymentMode ?? "",
    bankPartyId: t.bankPartyId,
    refNo: t.refNo ?? "",
    remarks: t.remarks ?? "",
    status: statusOf(t),
    // how long this receipt has been waiting for its invoice
    pendingDays:
      t.type === "REFILL" && !t.billNo
        ? Math.max(0, Math.floor((today.getTime() - t.date.getTime()) / DAY))
        : null,
  }));

  const STATUS_FILTER: Record<string, string> = {
    PENDING: "PENDING BILL",
    BILLED: "BILL UPDATED",
    PARTLY: "PARTLY PAID",
    PAID: "PAID",
  };
  const wanted = searchParams.status ? STATUS_FILTER[searchParams.status] : null;
  const visible = wanted ? rows.filter((r) => r.status === wanted) : rows;

  return (
    <div className="space-y-4 p-4">
      <AdblueClient
        rows={visible}
        totals={{
          totalRefill,
          totalIssued,
          closing: Math.round((totalRefill - totalIssued) * 100) / 100,
        }}
        vehicleOptions={vehicles.map((v) => ({ value: v.id, label: v.number }))}
        bankOptions={banks.map((b) => ({ value: b.id, label: b.name, meta: b.ledgerGroup }))}
        partyOptions={suppliers.map((p) => ({ value: p.id, label: p.name }))}
        canDelete={session.role === "ADMIN" || session.role === "OWNER"}
      />
    </div>
  );
}
