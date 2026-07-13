import { requireSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { nextLrNumber } from "@/lib/sequences";
import { formatDate } from "@/lib/utils";
import type { MasterOption } from "@/components/data/master-combobox";
import type { LrFormValues, PartyDetail } from "@/components/lr/lr-form";
import { emptyLrItem } from "@/components/lr/lr-calc";
import type { RateBasis } from "@/lib/calc/rate";

export interface LrFormData {
  mode: "create" | "edit";
  lrId?: string;
  defaults: LrFormValues;
  gstPct: number;
  cityOptions: MasterOption[];
  partyOptions: MasterOption[];
  billToOptions: MasterOption[];
  vehicleOptions: MasterOption[];
  productOptions: MasterOption[];
  bankOptions: MasterOption[];
  partyDetails: Record<string, PartyDetail>;
  vehicleOwners: Record<string, string>;
  productUnits: Record<string, string>;
}

export async function loadLrFormData(editId?: string): Promise<LrFormData> {
  const session = requireSession();

  return withTenant(session.tenantId, async (tx) => {
    const [firm, cities, parties, billToParties, vehicles, products, banks, nextNo, existing] =
      await Promise.all([
        tx.firm.findUniqueOrThrow({ where: { id: session.firmId } }),
        tx.city.findMany({ include: { state: true }, orderBy: { name: "asc" } }),
        tx.party.findMany({
          where: { isActive: true, ledgerGroup: "CONSIGNEE_CONSIGNOR" },
          orderBy: { name: "asc" },
        }),
        tx.party.findMany({
          where: { isActive: true, ledgerGroup: { in: ["CONSIGNEE_CONSIGNOR", "OWNER_BROKER"] } },
          orderBy: { name: "asc" },
        }),
        tx.vehicle.findMany({
          where: { isActive: true },
          include: { owner: true },
          orderBy: { number: "asc" },
        }),
        tx.product.findMany({ include: { group: true }, orderBy: { name: "asc" } }),
        tx.party.findMany({
          where: { isActive: true, ledgerGroup: { in: ["BANK", "CASH"] } },
          orderBy: { name: "asc" },
        }),
        nextLrNumber(tx, { firmId: session.firmId, fyId: session.fyId }),
        editId
          ? tx.lr.findFirst({
              where: { id: editId, deletedAt: null },
              include: { items: true },
            })
          : Promise.resolve(null),
      ]);

    const igstPct = Number(firm.igstPct);
    const gstPct = igstPct > 0 ? igstPct : Number(firm.cgstPct) + Number(firm.sgstPct);

    const partyDetails: Record<string, PartyDetail> = {};
    for (const p of [...parties, ...billToParties]) {
      partyDetails[p.id] = {
        address: [p.address1, p.address2].filter(Boolean).join(", "),
        gstin: p.gstin ?? "",
      };
    }

    const vehicleOwners: Record<string, string> = {};
    for (const veh of vehicles) {
      vehicleOwners[veh.id] = veh.isOwn ? "Own Vehicle" : veh.owner?.name ?? "";
    }

    const productUnits: Record<string, string> = {};
    for (const p of products) if (p.unit) productUnits[p.id] = p.unit;

    const defaults: LrFormValues = existing
      ? {
          lrNo: existing.lrNo,
          lrDateText: formatDate(existing.lrDate),
          refLrNo: existing.refLrNo ?? "",
          privateMarka: existing.privateMarka ?? "",
          sourceCityId: existing.sourceCityId,
          destCityId: existing.destCityId,
          consignorId: existing.consignorId,
          consigneeId: existing.consigneeId,
          billToId: existing.billToId ?? "",
          consignorGstText: "",
          consigneeGstText: "",
          vehicleId: existing.vehicleId ?? "",
          vehicleText: existing.vehicleText ?? "",
          invoiceNo: existing.invoiceNo ?? "",
          obdNo: existing.obdNo ?? "",
          refNo: existing.refNo ?? "",
          invoiceDateText: existing.invoiceDate ? formatDate(existing.invoiceDate) : "",
          goodsValue: existing.goodsValue ? Number(existing.goodsValue) : 0,
          ewayBillNo: existing.ewayBillNo ?? "",
          ewayExpiryText: existing.ewayExpiry ? formatDate(existing.ewayExpiry) : "",
          insCompany: existing.insCompany ?? "",
          insPolicyNo: existing.insPolicyNo ?? "",
          insAmount: existing.insAmount ? Number(existing.insAmount) : 0,
          items: existing.items.map((i) => ({
            productId: i.productId ?? "",
            productName: i.productName,
            description: i.description ?? "",
            qty: Number(i.qty),
            actualWt: Number(i.actualWt),
            chargeWt: Number(i.chargeWt),
            unit: i.unit,
            rate: Number(i.rate),
            rateBasis: i.rateBasis as RateBasis,
          })),
          freight: Number(existing.freight),
          hamali: Number(existing.hamali),
          preBhada: Number(existing.preBhada),
          biltyCharge: Number(existing.biltyCharge),
          collCharge: Number(existing.collCharge),
          cpc: Number(existing.cpc),
          otherCharge: Number(existing.otherCharge),
          gstApplicable: existing.gstApplicable,
          advance: Number(existing.advance),
          advanceBank: existing.advanceBank ?? "",
          lrType: existing.lrType,
          printFreight: existing.printFreight,
          remarks: existing.remarks ?? "",
          deliveryAt: existing.deliveryAt ?? "",
        }
      : {
          lrNo: nextNo ?? "1",
          lrDateText: formatDate(new Date()),
          refLrNo: "",
          privateMarka: "",
          sourceCityId: "",
          destCityId: "",
          consignorId: "",
          consigneeId: "",
          billToId: "",
          consignorGstText: "",
          consigneeGstText: "",
          vehicleId: "",
          vehicleText: "",
          invoiceNo: "",
          obdNo: "",
          refNo: "",
          invoiceDateText: "",
          goodsValue: 0,
          ewayBillNo: "",
          ewayExpiryText: "",
          insCompany: "",
          insPolicyNo: "",
          insAmount: 0,
          items: [emptyLrItem()],
          freight: 0,
          hamali: 0,
          preBhada: 0,
          biltyCharge: 0,
          collCharge: 0,
          cpc: 0,
          otherCharge: 0,
          gstApplicable: false,
          advance: 0,
          advanceBank: "",
          lrType: "TBB",
          printFreight: true,
          remarks: "",
          deliveryAt: "",
        };

    return {
      mode: existing ? ("edit" as const) : ("create" as const),
      lrId: existing?.id,
      defaults,
      gstPct,
      cityOptions: cities.map((c) => ({ value: c.id, label: c.name, meta: c.state.name })),
      partyOptions: parties.map((p) => ({
        value: p.id,
        label: p.name,
        meta: [p.gstin, p.pan].filter(Boolean).join(" · ") || undefined,
      })),
      billToOptions: billToParties.map((p) => ({
        value: p.id,
        label: p.name,
        meta: [p.gstin, p.pan].filter(Boolean).join(" · ") || undefined,
      })),
      vehicleOptions: vehicles.map((veh) => ({
        value: veh.id,
        label: veh.number,
        meta: veh.isOwn ? `Owned${veh.ownerNames ? " — " + veh.ownerNames : ""}` : `Broker — ${veh.owner?.name ?? "?"}`,
      })),
      productOptions: products.map((p) => ({ value: p.id, label: p.name, meta: p.group.name })),
      bankOptions: banks.map((p) => ({ value: p.id, label: p.name })),
      partyDetails,
      vehicleOwners,
      productUnits,
    };
  });
}
