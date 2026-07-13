import { requireSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { peekDocNumber } from "@/lib/sequences";
import { BrokerSlipForm, type BrokerSlipFormData } from "@/components/broker/slip-form";
import type { MasterOption } from "@/components/data/master-combobox";
import type { BrokerAdvance } from "@/components/broker/broker-calc";

export const dynamic = "force-dynamic";

function iso(d: Date | null | undefined): string {
  if (!d) return "";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

const n = (v: unknown) => Number(v ?? 0);

export default async function BrokerSlipPage({
  searchParams,
}: {
  searchParams: { id?: string };
}) {
  const session = requireSession();

  const { nextNo, cities, parties, brokers, vehicles, products, slip } = await withTenant(
    session.tenantId,
    async (tx) => {
      const [nextNo, cityRows, partyRows, brokerRows, vehicleRows, productRows, slipRow] =
        await Promise.all([
          peekDocNumber(tx, {
            firmId: session.firmId,
            fyId: session.fyId,
            docType: "BROKER_SLIP",
          }),
          tx.city.findMany({ include: { state: true }, orderBy: { name: "asc" } }),
          tx.party.findMany({
            where: { isActive: true, ledgerGroup: "CONSIGNEE_CONSIGNOR" },
            orderBy: { name: "asc" },
          }),
          tx.party.findMany({
            where: { isActive: true, ledgerGroup: "OWNER_BROKER" },
            orderBy: { name: "asc" },
          }),
          tx.vehicle.findMany({
            where: { isActive: true },
            include: { owner: true },
            orderBy: { number: "asc" },
          }),
          tx.product.findMany({ include: { group: true }, orderBy: { name: "asc" } }),
          searchParams.id
            ? tx.brokerSlip.findFirst({
                where: { id: searchParams.id, deletedAt: null },
              })
            : Promise.resolve(null),
        ]);
      return {
        nextNo,
        cities: cityRows.map((c) => ({ value: c.id, label: c.name, meta: c.state.name })),
        parties: partyRows.map((p) => ({
          value: p.id,
          label: p.name,
          meta: [p.gstin, p.pan].filter(Boolean).join(" · ") || undefined,
        })),
        brokers: brokerRows.map((p) => ({
          value: p.id,
          label: p.name,
          meta: [p.gstin, p.pan].filter(Boolean).join(" · ") || undefined,
        })),
        vehicles: vehicleRows.map((v) => ({
          value: v.id,
          label: v.number,
          meta: v.isOwn ? `Owned${v.ownerNames ? " — " + v.ownerNames : ""}` : `Broker — ${v.owner?.name ?? "?"}`,
          isOwn: v.isOwn,
        })),
        products: productRows.map((p) => ({ value: p.id, label: p.name, meta: p.group.name })),
        slip: slipRow,
      };
    }
  );

  const cityOptions: MasterOption[] = cities;
  const ownVehicleIds = vehicles.filter((v) => v.isOwn).map((v) => v.value);
  const vehicleOptions: MasterOption[] = vehicles.map(({ value, label, meta }) => ({
    value,
    label,
    meta,
  }));

  let initial: BrokerSlipFormData | null = null;
  if (slip) {
    initial = {
      id: slip.id,
      slipNo: slip.slipNo,
      slipDate: iso(slip.slipDate),
      vehicleId: slip.vehicleId,
      transporterId: slip.transporterId,
      loadStationId: slip.loadStationId,
      destCityId: slip.destCityId,
      consignorId: slip.consignorId,
      consigneeId: slip.consigneeId,
      lrNo: slip.lrNo ?? "",
      lrDate: iso(slip.lrDate),
      ewbNo: slip.ewbNo ?? "",
      ewbDate: iso(slip.ewbDate),
      productId: slip.productId,
      productName: slip.productName ?? "",
      qty: n(slip.qty),
      actualWt: n(slip.actualWt),
      chargeWt: n(slip.chargeWt),
      unit: slip.unit ?? "MT",
      rateBasis: slip.rateBasis,
      partyId: slip.partyId,
      p: {
        rate: n(slip.pRate),
        freight: n(slip.pFreight),
        detention: n(slip.pDetention),
        odcAmt: n(slip.pOdcAmt),
        fineAmt: n(slip.pFineSlip),
        ldCharge: n(slip.pLdCharge),
        shortageAmt: n(slip.pShortageAmt),
        tdsPct: n(slip.pTdsPct),
        tdsAmt: n(slip.pTdsAmt),
        commPct: n(slip.pCommPct),
        commAmt: n(slip.pCommAmt),
        mamool: n(slip.pMamool),
        paymentCharge: n(slip.pPaymentCharge),
        remarks: slip.pRemarks ?? "",
      },
      ownerId: slip.ownerId,
      ownerName: slip.ownerName ?? "",
      v: {
        rate: n(slip.vRate),
        freight: n(slip.vFreight),
        detention: n(slip.vDetention),
        odcAmt: n(slip.vOdcAmt),
        fineAmt: n(slip.vFineAmt),
        ldCharge: n(slip.vLdCharge),
        shortageAmt: n(slip.vShortageAmt),
        tdsPct: n(slip.vTdsPct),
        tdsAmt: n(slip.vTdsAmt),
        commPct: n(slip.vCommPct),
        commAmt: n(slip.vCommAmt),
        mamool: n(slip.vMamool),
        paymentCharge: n(slip.vPaymentAmt),
        remarks: slip.vRemarks ?? "",
      },
      advances: ((slip.advances as unknown as BrokerAdvance[] | null) ?? []).map((a) => ({
        ...a,
        amount: n(a.amount),
        dieselQty: a.dieselQty == null ? null : n(a.dieselQty),
        dieselRate: a.dieselRate == null ? null : n(a.dieselRate),
      })),
      startKm: slip.startKm == null ? null : n(slip.startKm),
      unloadDate: iso(slip.unloadDate),
      unloadKm: slip.unloadKm == null ? null : n(slip.unloadKm),
      unloadRemarks: slip.unloadRemarks ?? "",
    };
  }

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-semibold">
        {initial ? `Edit Broker Slip ${initial.slipNo}` : "Broker Slip Entry"}
      </h1>
      <BrokerSlipForm
        initial={initial}
        nextSlipNo={nextNo ?? "1"}
        cityOptions={cityOptions}
        partyOptions={parties}
        brokerOptions={brokers}
        vehicleOptions={vehicleOptions}
        ownVehicleIds={ownVehicleIds}
        productOptions={products}
      />
    </div>
  );
}
