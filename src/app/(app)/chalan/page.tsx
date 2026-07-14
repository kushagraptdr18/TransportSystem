import { requireSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { randomUniqueDocNumber } from "@/lib/sequences";
import { toNum } from "@/lib/utils";
import { ChalanForm, type ChalanRecord, type BrokerOption } from "./chalan-form";

export const dynamic = "force-dynamic";

export default async function ChalanPage({
  searchParams,
}: {
  searchParams: { id?: string };
}) {
  const session = requireSession();

  const [nextNo, brokers, vehicles, banks, record] = await withTenant(
    session.tenantId,
    async (tx) => {
      const nextNo = await randomUniqueDocNumber(async (n) =>
        Boolean(
          await tx.chalan.findFirst({
            where: { firmId: session.firmId, fyId: session.fyId, chalanNo: n },
            select: { id: true },
          })
        )
      );
      const brokers = await tx.party.findMany({
        where: { ledgerGroup: "OWNER_BROKER", isActive: true },
        orderBy: { name: "asc" },
      });
      const vehicles = await tx.vehicle.findMany({
        where: { isActive: true },
        include: { owner: true },
        orderBy: { number: "asc" },
      });
      const banks = await tx.party.findMany({
        where: { ledgerGroup: { in: ["BANK", "CASH"] }, isActive: true },
        orderBy: { name: "asc" },
      });
      const record = searchParams.id
        ? await tx.chalan.findFirst({
            where: { id: searchParams.id, deletedAt: null },
            include: {
              lrs: { include: { lr: { include: { items: true } } } },
              advances: true,
            },
          })
        : null;
      const cities = record ? await tx.city.findMany() : [];
      const parties = record ? await tx.party.findMany() : [];
      const cityName = (id: string) => cities.find((c) => c.id === id)?.name ?? "";
      const partyName = (id: string) => parties.find((p) => p.id === id)?.name ?? "";

      const rec: ChalanRecord | null = record
        ? {
            id: record.id,
            chalanNo: record.chalanNo,
            chalanDate: record.chalanDate.toISOString(),
            brokerId: record.brokerId,
            vehicleId: record.vehicleId,
            driverName: record.driverName ?? "",
            driverMobile: record.driverMobile ?? "",
            licenseNo: record.licenseNo ?? "",
            payableAt: record.payableAt ?? "",
            remarks: record.remarks ?? "",
            isFinal: record.isFinal,
            freight: toNum(record.freight),
            rate: toNum(record.rate),
            rateBasis: record.rateBasis,
            detention: toNum(record.detention),
            odcAmt: toNum(record.odcAmt),
            fineSlip: toNum(record.fineSlip),
            ldCharge: toNum(record.ldCharge),
            shortageAmt: toNum(record.shortageAmt),
            otherAmt: toNum(record.otherAmt),
            otherRemarks: record.otherRemarks ?? "",
            commissionPct: toNum(record.commissionPct),
            commissionAmt: toNum(record.commissionAmt),
            mamool: toNum(record.mamool),
            courierCharge: toNum(record.courierCharge),
            tdsPct: toNum(record.tdsPct),
            startKm: record.startKm == null ? null : toNum(record.startKm),
            unloadDate: record.unloadDate ? record.unloadDate.toISOString() : null,
            unloadKm: record.unloadKm == null ? null : toNum(record.unloadKm),
            unloadRemarks: record.unloadRemarks ?? "",
            lrs: record.lrs.map(({ lr }) => ({
              id: lr.id,
              lrNo: lr.lrNo,
              lrDate: lr.lrDate.toISOString(),
              source: cityName(lr.sourceCityId),
              destination: cityName(lr.destCityId),
              consignor: partyName(lr.consignorId),
              qty: lr.items.reduce((s, i) => s + toNum(i.qty), 0),
              actualWt: lr.items.reduce((s, i) => s + toNum(i.actualWt), 0),
              chargeWt: lr.items.reduce((s, i) => s + toNum(i.chargeWt), 0),
              freight: toNum(lr.freight),
              rate: lr.items.length ? Math.max(...lr.items.map((i) => toNum(i.rate))) : 0,
              rateBasis: (lr.items.find((i) => toNum(i.rate) > 0)?.rateBasis ?? "CHARGE_WT") as
                | "QTY"
                | "ACTUAL_WT"
                | "CHARGE_WT"
                | "FIXED",
              remarks: lr.remarks ?? "",
            })),
            advances: record.advances.map((a) => ({
              type: a.type,
              supplierName: a.supplierName ?? "",
              bankName: a.bankName ?? "",
              dieselQty: a.dieselQty == null ? 0 : toNum(a.dieselQty),
              dieselRate: a.dieselRate == null ? 0 : toNum(a.dieselRate),
              amount: toNum(a.amount),
              date: a.date ? a.date.toISOString() : null,
              remarks: a.remarks ?? "",
            })),
          }
        : null;

      return [nextNo, brokers, vehicles, banks, rec] as const;
    }
  );

  const brokerOptions: BrokerOption[] = brokers.map((b) => ({
    value: b.id,
    label: b.name,
    meta: [b.gstin, b.pan].filter(Boolean).join(" · ") || undefined,
    pan: b.pan,
    tdsMode: b.tdsMode,
  }));

  return (
    <ChalanForm
      nextChalanNo={nextNo ?? "1"}
      brokers={brokerOptions}
      vehicles={vehicles.map((v) => ({
        value: v.id,
        label: v.number,
        meta: v.isOwn ? `Owned${v.ownerNames ? " — " + v.ownerNames : ""}` : `Broker — ${v.owner?.name ?? "?"}`,
      }))}
      banks={banks.map((b) => ({ value: b.id, label: b.name }))}
      record={record}
    />
  );
}
