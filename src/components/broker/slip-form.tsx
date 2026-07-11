"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Copy, Plus, Trash2 } from "lucide-react";
import { formatDate, formatMoney, parseDdMmYyyy, toNum } from "@/lib/utils";
import type { RateBasis } from "@/lib/calc/rate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { DateInput } from "@/components/data/date-input";
import { MasterCombobox, type MasterOption } from "@/components/data/master-combobox";
import {
  CityCreateDialog as CityDialog,
  PartyCreateDialog as PartyDialog,
  ProductCreateDialog as ProductDialog,
  VehicleCreateDialog as VehicleDialog,
} from "@/components/masters/inline-dialogs";
import type { LedgerGroup } from "@prisma/client";
import {
  ADVANCE_TYPES,
  advanceAmount,
  computeBrokerSide,
  computeTripKm,
  sideAdvanceTotal,
  type BrokerAdvance,
} from "@/components/broker/broker-calc";
import { saveBrokerSlip } from "@/app/(app)/broker/actions";

export interface SideValues {
  rate: number;
  freight: number;
  detention: number;
  odcAmt: number;
  fineAmt: number;
  ldCharge: number;
  shortageAmt: number;
  tdsPct: number;
  tdsAmt: number;
  commPct: number;
  commAmt: number;
  mamool: number;
  paymentCharge: number;
  remarks: string;
}

export interface BrokerSlipFormData {
  id?: string | null;
  slipNo: string;
  slipDate: string; // ISO
  vehicleId?: string | null;
  transporterId?: string | null;
  loadStationId?: string | null;
  destCityId?: string | null;
  consignorId?: string | null;
  consigneeId?: string | null;
  lrNo: string;
  lrDate: string; // ISO or ""
  ewbNo: string;
  ewbDate: string;
  productId?: string | null;
  productName: string;
  qty: number;
  actualWt: number;
  chargeWt: number;
  unit: string;
  rateBasis: RateBasis;
  partyId?: string | null;
  p: SideValues;
  ownerId?: string | null;
  ownerName: string;
  v: SideValues;
  advances: BrokerAdvance[];
  startKm?: number | null;
  unloadDate: string;
  unloadKm?: number | null;
  unloadRemarks: string;
}

const emptySide = (): SideValues => ({
  rate: 0,
  freight: 0,
  detention: 0,
  odcAmt: 0,
  fineAmt: 0,
  ldCharge: 0,
  shortageAmt: 0,
  tdsPct: 0,
  tdsAmt: 0,
  commPct: 0,
  commAmt: 0,
  mamool: 0,
  paymentCharge: 0,
  remarks: "",
});

const RATE_BASIS_OPTIONS: { value: RateBasis; label: string }[] = [
  { value: "QTY", label: "Quantity" },
  { value: "ACTUAL_WT", label: "Actual Weight" },
  { value: "CHARGE_WT", label: "Guaranteed Weight" },
  { value: "FIXED", label: "Fixed" },
];

function isoToText(iso: string): string {
  if (!iso) return "";
  return formatDate(new Date(iso + "T00:00:00"));
}

function textToIso(text: string): string {
  const d = parseDdMmYyyy(text);
  if (!d) return "";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function todayText(): string {
  return formatDate(new Date());
}

// small labelled number input
function Num({
  label,
  value,
  onChange,
  disabled,
  className,
}: {
  label: string;
  value: number;
  onChange?: (n: number) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={className ?? "space-y-1"}>
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        inputMode="decimal"
        step="any"
        className="h-8 text-right tabular-nums"
        value={Number.isFinite(value) ? String(value) : ""}
        disabled={disabled}
        onChange={(e) => onChange?.(toNum(e.target.value))}
        onFocus={(e) => e.target.select()}
      />
    </div>
  );
}

interface BrokerSlipFormProps {
  initial: BrokerSlipFormData | null;
  nextSlipNo: string;
  cityOptions: MasterOption[];
  partyOptions: MasterOption[];
  brokerOptions: MasterOption[];
  vehicleOptions: MasterOption[];
  ownVehicleIds: string[];
  productOptions: MasterOption[];
}

export function BrokerSlipForm({
  initial,
  nextSlipNo,
  cityOptions: cityOptions0,
  partyOptions: partyOptions0,
  brokerOptions: brokerOptions0,
  vehicleOptions: vehicleOptions0,
  ownVehicleIds: ownVehicleIds0,
  productOptions: productOptions0,
}: BrokerSlipFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [saving, setSaving] = React.useState(false);

  // options grow via inline creates
  const [cityOptions, setCityOptions] = React.useState(cityOptions0);
  const [partyOptions, setPartyOptions] = React.useState(partyOptions0);
  const [brokerOptions, setBrokerOptions] = React.useState(brokerOptions0);
  const [vehicleOptions, setVehicleOptions] = React.useState(vehicleOptions0);
  const [productOptions, setProductOptions] = React.useState(productOptions0);
  const [ownVehicleIds] = React.useState(ownVehicleIds0);

  const [form, setForm] = React.useState<BrokerSlipFormData>(
    initial ?? {
      slipNo: nextSlipNo,
      slipDate: "",
      lrNo: "",
      lrDate: "",
      ewbNo: "",
      ewbDate: "",
      productName: "",
      qty: 0,
      actualWt: 0,
      chargeWt: 0,
      unit: "MT",
      rateBasis: "CHARGE_WT",
      p: emptySide(),
      ownerName: "",
      v: emptySide(),
      advances: [],
      unloadDate: "",
      unloadRemarks: "",
    }
  );
  // date display texts
  const [slipDateText, setSlipDateText] = React.useState(
    initial ? isoToText(initial.slipDate) : todayText()
  );
  const [lrDateText, setLrDateText] = React.useState(initial ? isoToText(initial.lrDate) : "");
  const [ewbDateText, setEwbDateText] = React.useState(initial ? isoToText(initial.ewbDate) : "");
  const [unloadDateText, setUnloadDateText] = React.useState(
    initial ? isoToText(initial.unloadDate) : ""
  );

  const set = <K extends keyof BrokerSlipFormData>(key: K, value: BrokerSlipFormData[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const setSide = (side: "p" | "v", patch: Partial<SideValues>) =>
    setForm((f) => ({ ...f, [side]: { ...f[side], ...patch } }));

  const isOwnVehicle = !!form.vehicleId && ownVehicleIds.includes(form.vehicleId);

  // live totals
  const pAdvance = sideAdvanceTotal(form.advances, "P");
  const vAdvance = sideAdvanceTotal(form.advances, "V");
  const sideTotals = (s: SideValues, advance: number) =>
    computeBrokerSide({
      rate: s.rate,
      rateBasis: form.rateBasis,
      qty: form.qty,
      actualWt: form.actualWt,
      chargeWt: form.chargeWt,
      manualFreight: s.freight,
      detention: s.detention,
      odcAmt: s.odcAmt,
      fineAmt: s.fineAmt,
      ldCharge: s.ldCharge,
      shortageAmt: s.shortageAmt,
      tdsPct: s.tdsPct,
      tdsAmtManual: s.tdsAmt,
      commPct: s.commPct,
      commAmtManual: s.commAmt,
      mamool: s.mamool,
      paymentCharge: s.paymentCharge,
      advance,
    });
  const pTotals = sideTotals(form.p, pAdvance);
  const vTotals = sideTotals(form.v, vAdvance);
  const margin = pTotals.netAmt - vTotals.netAmt;

  const km = computeTripKm({
    startKm: form.startKm ?? null,
    unloadKm: form.unloadKm ?? null,
    slipDate: parseDdMmYyyy(slipDateText),
    unloadDate: parseDdMmYyyy(unloadDateText),
  });

  // freight auto from rate x basis (still editable)
  const recomputeFreight = (side: "p" | "v", rate: number) => {
    const auto = computeBrokerSide({
      rate,
      rateBasis: form.rateBasis,
      qty: form.qty,
      actualWt: form.actualWt,
      chargeWt: form.chargeWt,
      detention: 0,
      odcAmt: 0,
      fineAmt: 0,
      ldCharge: 0,
      shortageAmt: 0,
      tdsPct: 0,
      commPct: 0,
      mamool: 0,
      paymentCharge: 0,
      advance: 0,
    }).freight;
    setSide(side, { rate, freight: auto });
  };

  const copyFromBooking = () => {
    setForm((f) => ({
      ...f,
      v: {
        ...f.v,
        rate: f.p.rate,
        freight: f.p.freight,
        detention: f.p.detention,
        odcAmt: f.p.odcAmt,
        fineAmt: f.p.fineAmt,
        ldCharge: f.p.ldCharge,
        shortageAmt: f.p.shortageAmt,
      },
    }));
  };

  const onVehicleChange = (v: string | null) => {
    set("vehicleId", v);
    if (v && ownVehicleIds.includes(v)) {
      setSide("v", { tdsPct: 0, tdsAmt: 0, commPct: 0, commAmt: 0, mamool: 0 });
    }
  };

  // ---------- advances ----------
  const addAdvance = () =>
    set("advances", [
      ...form.advances,
      { side: "V", type: "CASH", amount: 0, date: null, remarks: "" },
    ]);
  const updateAdvance = (idx: number, patch: Partial<BrokerAdvance>) =>
    set(
      "advances",
      form.advances.map((a, i) => (i === idx ? { ...a, ...patch } : a))
    );
  const removeAdvance = (idx: number) =>
    set(
      "advances",
      form.advances.filter((_, i) => i !== idx)
    );

  const handleSave = async () => {
    const slipDateIso = textToIso(slipDateText);
    if (!form.slipNo.trim()) {
      toast({ variant: "destructive", title: "Slip number is required" });
      return;
    }
    if (!slipDateIso) {
      toast({ variant: "destructive", title: "Valid slip date is required" });
      return;
    }
    setSaving(true);
    try {
      const res = await saveBrokerSlip({
        ...form,
        slipDate: slipDateIso,
        lrDate: textToIso(lrDateText) || null,
        ewbDate: textToIso(ewbDateText) || null,
        unloadDate: textToIso(unloadDateText) || null,
        advances: form.advances.map((a) => ({ ...a, amount: advanceAmount(a) })),
      });
      if (res.ok) {
        toast({ title: `Broker slip ${form.slipNo} saved` });
        router.push("/broker/register");
      } else {
        toast({ variant: "destructive", title: "Save failed", description: res.error });
      }
    } finally {
      setSaving(false);
    }
  };

  const partyCombo = (
    value: string | null | undefined,
    onChange: (v: string | null) => void,
    options: MasterOption[],
    setOptions: React.Dispatch<React.SetStateAction<MasterOption[]>>,
    ledgerGroup: LedgerGroup,
    placeholder: string
  ) => (
    <MasterCombobox
      options={options}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      renderCreateDialog={(closeAndSelect) => (
        <PartyDialog
          open
          onOpenChange={(o) => {
            if (!o) closeAndSelect("");
          }}
          onCreated={(opt) => {
            setOptions((prev) => [...prev, opt]);
            closeAndSelect(opt.value);
          }}
          defaultGroup={ledgerGroup}
        />
      )}
    />
  );

  const cityCombo = (
    value: string | null | undefined,
    onChange: (v: string | null) => void,
    placeholder: string
  ) => (
    <MasterCombobox
      options={cityOptions}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      renderCreateDialog={(closeAndSelect) => (
        <CityDialog
          open
          onOpenChange={(o) => {
            if (!o) closeAndSelect("");
          }}
          onCreated={(opt) => {
            setCityOptions((prev) => [...prev, opt]);
            closeAndSelect(opt.value);
          }}
        />
      )}
    />
  );

  const sideCard = (side: "p" | "v", totals: ReturnType<typeof computeBrokerSide>) => {
    const s = form[side];
    const isP = side === "p";
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-base">
            <span>{isP ? "Party Side (Receivable)" : "Owner Side (Payable)"}</span>
            {!isP && (
              <span className="flex items-center gap-2">
                {isOwnVehicle && (
                  <Badge variant="secondary">Own vehicle — TDS/Comm/Mamool default 0</Badge>
                )}
                <Button type="button" variant="outline" size="sm" onClick={copyFromBooking}>
                  <Copy className="h-3.5 w-3.5" /> Copy from booking
                </Button>
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isP ? (
            <div className="space-y-1">
              <Label className="text-xs">Party</Label>
              {partyCombo(
                form.partyId,
                (v) => set("partyId", v),
                partyOptions,
                setPartyOptions,
                "CONSIGNEE_CONSIGNOR",
                "Select party..."
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Owner / Broker</Label>
                {partyCombo(
                  form.ownerId,
                  (v) => set("ownerId", v),
                  brokerOptions,
                  setBrokerOptions,
                  "OWNER_BROKER",
                  "Select owner..."
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Owner Name (text)</Label>
                <Input
                  className="h-8"
                  value={form.ownerName}
                  onChange={(e) => set("ownerName", e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2 md:grid-cols-4">
            <Num label="Rate" value={s.rate} onChange={(n) => recomputeFreight(side, n)} />
            <Num label="Freight" value={s.freight} onChange={(n) => setSide(side, { freight: n })} />
            <Num
              label="Detention"
              value={s.detention}
              onChange={(n) => setSide(side, { detention: n })}
            />
            <Num label="ODC Amt" value={s.odcAmt} onChange={(n) => setSide(side, { odcAmt: n })} />
            <Num
              label="Fine / Slip"
              value={s.fineAmt}
              onChange={(n) => setSide(side, { fineAmt: n })}
            />
            <Num
              label="LD Charge (−)"
              value={s.ldCharge}
              onChange={(n) => setSide(side, { ldCharge: n })}
            />
            <Num
              label="Shortage (−)"
              value={s.shortageAmt}
              onChange={(n) => setSide(side, { shortageAmt: n })}
            />
            <Num label="Chalan Amt" value={totals.chalanAmt} disabled />
          </div>

          <div className="grid grid-cols-3 gap-2 md:grid-cols-4">
            <Num label="TDS %" value={s.tdsPct} onChange={(n) => setSide(side, { tdsPct: n })} />
            <Num
              label="TDS Amt"
              value={s.tdsPct > 0 ? totals.tdsAmt : s.tdsAmt}
              disabled={s.tdsPct > 0}
              onChange={(n) => setSide(side, { tdsAmt: n })}
            />
            <Num label="Comm %" value={s.commPct} onChange={(n) => setSide(side, { commPct: n })} />
            <Num
              label="Comm Amt"
              value={s.commPct > 0 ? totals.commAmt : s.commAmt}
              disabled={s.commPct > 0}
              onChange={(n) => setSide(side, { commAmt: n })}
            />
            <Num label="Mamool" value={s.mamool} onChange={(n) => setSide(side, { mamool: n })} />
            <Num
              label="Payment Charge"
              value={s.paymentCharge}
              onChange={(n) => setSide(side, { paymentCharge: n })}
            />
            <Num label="Net Amt" value={totals.netAmt} disabled />
            <Num label={`Advance (${isP ? "P" : "V"})`} value={isP ? pAdvance : vAdvance} disabled />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Num label="Balance" value={totals.balance} disabled />
            <div className="space-y-1">
              <Label className="text-xs">Remarks</Label>
              <Input
                className="h-8"
                value={s.remarks}
                onChange={(e) => setSide(side, { remarks: e.target.value })}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-4">
      {/* header */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Slip Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="space-y-1">
            <Label className="text-xs">Slip No</Label>
            <Input
              className="h-8"
              value={form.slipNo}
              onChange={(e) => set("slipNo", e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Slip Date</Label>
            <DateInput className="h-8" value={slipDateText} onChange={(t) => setSlipDateText(t)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Vehicle</Label>
            <MasterCombobox
              options={vehicleOptions}
              value={form.vehicleId}
              onChange={onVehicleChange}
              placeholder="Select vehicle..."
              renderCreateDialog={(closeAndSelect) => (
                <VehicleDialog
                  open
                  onOpenChange={(o) => {
                    if (!o) closeAndSelect("");
                  }}
                  onCreated={(opt) => {
                    setVehicleOptions((prev) => [...prev, opt]);
                    closeAndSelect(opt.value);
                  }}
                />
              )}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Transporter / Broker</Label>
            {partyCombo(
              form.transporterId,
              (v) => set("transporterId", v),
              brokerOptions,
              setBrokerOptions,
              "OWNER_BROKER",
              "Select transporter..."
            )}
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Load Station</Label>
            {cityCombo(form.loadStationId, (v) => set("loadStationId", v), "Select city...")}
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Destination</Label>
            {cityCombo(form.destCityId, (v) => set("destCityId", v), "Select city...")}
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Consignor</Label>
            {partyCombo(
              form.consignorId,
              (v) => set("consignorId", v),
              partyOptions,
              setPartyOptions,
              "CONSIGNEE_CONSIGNOR",
              "Optional..."
            )}
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Consignee</Label>
            {partyCombo(
              form.consigneeId,
              (v) => set("consigneeId", v),
              partyOptions,
              setPartyOptions,
              "CONSIGNEE_CONSIGNOR",
              "Optional..."
            )}
          </div>
          <div className="space-y-1">
            <Label className="text-xs">LR No</Label>
            <Input className="h-8" value={form.lrNo} onChange={(e) => set("lrNo", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">LR Date</Label>
            <DateInput className="h-8" value={lrDateText} onChange={(t) => setLrDateText(t)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">E-Way Bill No</Label>
            <Input
              className="h-8"
              value={form.ewbNo}
              onChange={(e) => set("ewbNo", e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">EWB Date</Label>
            <DateInput className="h-8" value={ewbDateText} onChange={(t) => setEwbDateText(t)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Product</Label>
            <MasterCombobox
              options={productOptions}
              value={form.productId}
              onChange={(v) => {
                const opt = productOptions.find((o) => o.value === v);
                setForm((f) => ({
                  ...f,
                  productId: v,
                  productName: opt ? opt.label : f.productName,
                }));
              }}
              placeholder="Optional..."
              renderCreateDialog={(closeAndSelect) => (
                <ProductDialog
                  open
                  onOpenChange={(o) => {
                    if (!o) closeAndSelect("");
                  }}
                  onCreated={(opt) => {
                    setProductOptions((prev) => [...prev, opt]);
                    setForm((f) => ({ ...f, productName: opt.label }));
                    closeAndSelect(opt.value);
                  }}
                />
              )}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Product Name</Label>
            <Input
              className="h-8"
              value={form.productName}
              onChange={(e) => set("productName", e.target.value)}
            />
          </div>
          <Num label="Qty" value={form.qty} onChange={(n) => set("qty", n)} />
          <Num label="Actual Wt" value={form.actualWt} onChange={(n) => set("actualWt", n)} />
          <Num
            label="Charge Wt (Guaranteed)"
            value={form.chargeWt}
            onChange={(n) => set("chargeWt", n)}
          />
          <div className="space-y-1">
            <Label className="text-xs">Unit</Label>
            <Input className="h-8" value={form.unit} onChange={(e) => set("unit", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Rate Basis</Label>
            <Select
              value={form.rateBasis}
              onValueChange={(v) => set("rateBasis", v as RateBasis)}
            >
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RATE_BASIS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* dual sides */}
      <div className="grid gap-4 lg:grid-cols-2">
        {sideCard("p", pTotals)}
        {sideCard("v", vTotals)}
      </div>

      {/* advances */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-base">
            <span>Advances</span>
            <Button type="button" variant="outline" size="sm" onClick={addAdvance}>
              <Plus className="h-3.5 w-3.5" /> Add advance
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {form.advances.length === 0 && (
            <p className="text-sm text-muted-foreground">No advances entered.</p>
          )}
          {form.advances.map((a, idx) => (
            <div key={idx} className="grid grid-cols-2 items-end gap-2 md:grid-cols-9">
              <div className="space-y-1">
                <Label className="text-xs">Side</Label>
                <Select
                  value={a.side}
                  onValueChange={(v) => updateAdvance(idx, { side: v as "P" | "V" })}
                >
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="P">Party</SelectItem>
                    <SelectItem value="V">Owner</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Type</Label>
                <Select
                  value={a.type}
                  onValueChange={(v) => updateAdvance(idx, { type: v as BrokerAdvance["type"] })}
                >
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ADVANCE_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t.replace(/_/g, " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Supplier</Label>
                <Input
                  className="h-8"
                  value={a.supplierName ?? ""}
                  onChange={(e) => updateAdvance(idx, { supplierName: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Bank</Label>
                <Input
                  className="h-8"
                  value={a.bankName ?? ""}
                  onChange={(e) => updateAdvance(idx, { bankName: e.target.value })}
                />
              </div>
              <Num
                label="Diesel Qty"
                value={a.dieselQty ?? 0}
                onChange={(n) => updateAdvance(idx, { dieselQty: n })}
              />
              <Num
                label="Diesel Rate"
                value={a.dieselRate ?? 0}
                onChange={(n) => updateAdvance(idx, { dieselRate: n })}
              />
              <Num
                label="Amount"
                value={advanceAmount(a)}
                disabled={a.type === "DIESEL" && (a.dieselQty ?? 0) > 0 && (a.dieselRate ?? 0) > 0}
                onChange={(n) => updateAdvance(idx, { amount: n })}
              />
              <div className="space-y-1">
                <Label className="text-xs">Date</Label>
                <DateInput
                  className="h-8"
                  value={a.date ? isoToText(a.date) : ""}
                  onChange={(t) => updateAdvance(idx, { date: textToIso(t) || null })}
                />
              </div>
              <div className="flex items-end gap-1">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">Remarks</Label>
                  <Input
                    className="h-8"
                    value={a.remarks ?? ""}
                    onChange={(e) => updateAdvance(idx, { remarks: e.target.value })}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive"
                  onClick={() => removeAdvance(idx)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
          {form.advances.length > 0 && (
            <div className="flex justify-end gap-6 border-t pt-2 text-sm tabular-nums">
              <span>Party advances: {formatMoney(pAdvance)}</span>
              <span>Owner advances: {formatMoney(vAdvance)}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* trip km + payment summary */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Trip KM</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-2">
            <Num
              label="Start KM"
              value={form.startKm ?? 0}
              onChange={(n) => set("startKm", n)}
            />
            <div className="space-y-1">
              <Label className="text-xs">Unload Date</Label>
              <DateInput
                className="h-8"
                value={unloadDateText}
                onChange={(t) => setUnloadDateText(t)}
              />
            </div>
            <Num
              label="Unload KM"
              value={form.unloadKm ?? 0}
              onChange={(n) => set("unloadKm", n)}
            />
            <Num label="Running KM" value={km.runningKm ?? 0} disabled />
            <Num label="Trip Days" value={km.tripDays ?? 0} disabled />
            <div className="space-y-1">
              <Label className="text-xs">Unload Remarks</Label>
              <Input
                className="h-8"
                value={form.unloadRemarks}
                onChange={(e) => set("unloadRemarks", e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Payment Summary (Owner Side)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm tabular-nums">
            {[
              ["Gross Freight", vTotals.chalanAmt],
              ["Commission", vTotals.commAmt],
              ["TDS", vTotals.tdsAmt],
              ["Mamool", form.v.mamool],
              ["Other (Payment Charge)", form.v.paymentCharge],
            ].map(([label, val]) => (
              <div key={label as string} className="flex justify-between">
                <span className="text-muted-foreground">{label}</span>
                <span>{formatMoney(val as number)}</span>
              </div>
            ))}
            <div className="flex justify-between border-t pt-1 font-semibold">
              <span>Net Payable</span>
              <span>{formatMoney(vTotals.netAmt)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Less: Advances</span>
              <span>{formatMoney(vAdvance)}</span>
            </div>
            <div className="flex justify-between font-semibold">
              <span>Balance Payable</span>
              <span>{formatMoney(vTotals.balance)}</span>
            </div>
            <div className="flex justify-between border-t pt-1">
              <span className="text-muted-foreground">Margin (Party Net − Owner Net)</span>
              <span className={margin < 0 ? "text-destructive" : ""}>{formatMoney(margin)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.push("/broker/register")}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : initial ? "Update Slip" : "Save Slip"}
        </Button>
      </div>
    </div>
  );
}
