"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { DateInput } from "@/components/data/date-input";
import { MasterCombobox } from "@/components/data/master-combobox";
import { Field, NumInput, PartyCombobox, VehicleCombobox, enterAdvances } from "@/components/fleet/fields";
import { LrPicker, SelectedLrList, type PendingLrRow } from "@/components/fleet/lr-picker";
import { computeChalan, dieselAdvanceAmount } from "@/lib/calc/chalan";
import { tdsPctFromPan, type TdsMode } from "@/lib/calc/tds";
import { formatDate, formatMoney, parseDdMmYyyy } from "@/lib/utils";
import {
  finalizeChalan,
  getBrokerTdsInfo,
  getPendingLrsForVehicle,
  saveChalan,
  saveChalanAdvances,
} from "./actions";

export interface BrokerOption {
  value: string;
  label: string;
  meta?: string;
  pan: string | null;
  tdsMode: TdsMode | null;
}

export interface AdvanceRow {
  type: "CASH" | "BANK" | "DIESEL" | "TOLL" | "TYRE" | "SPARE_PARTS" | "REPAIR" | "OTHER";
  supplierName: string;
  bankName: string;
  bankPartyId?: string | null;
  dieselQty: number;
  dieselRate: number;
  amount: number;
  date: string | null;
  remarks: string;
}

export interface ChalanRecord {
  id: string;
  chalanNo: string;
  chalanDate: string;
  brokerId: string;
  vehicleId: string;
  driverName: string;
  driverMobile: string;
  licenseNo: string;
  payableAt: string;
  remarks: string;
  isFinal: boolean;
  freight: number;
  rate: number;
  rateBasis: "QTY" | "ACTUAL_WT" | "CHARGE_WT" | "FIXED";
  detention: number;
  odcAmt: number;
  fineSlip: number;
  ldCharge: number;
  shortageAmt: number;
  otherAmt: number;
  otherRemarks: string;
  commissionPct: number;
  commissionAmt: number;
  mamool: number;
  courierCharge: number;
  tdsPct: number;
  startKm: number | null;
  unloadDate: string | null;
  unloadKm: number | null;
  unloadRemarks: string;
  lrs: PendingLrRow[];
  advances: AdvanceRow[];
}

const ADVANCE_TYPES = [
  "CASH",
  "BANK",
  "DIESEL",
  "TOLL",
  "TYRE",
  "SPARE_PARTS",
  "REPAIR",
  "OTHER",
] as const;

export function ChalanForm({
  nextChalanNo,
  brokers,
  vehicles,
  banks,
  record,
}: {
  nextChalanNo: string;
  brokers: BrokerOption[];
  vehicles: { value: string; label: string; meta?: string }[];
  banks: { value: string; label: string }[];
  record: ChalanRecord | null;
}) {
  const router = useRouter();
  const { toast } = useToast();

  // ------- header -------
  const [id, setId] = React.useState<string | null>(record?.id ?? null);
  const [chalanNo, setChalanNo] = React.useState(record?.chalanNo ?? nextChalanNo);
  const [dateText, setDateText] = React.useState(
    formatDate(record ? new Date(record.chalanDate) : new Date())
  );
  const [brokerId, setBrokerId] = React.useState<string | null>(record?.brokerId ?? null);
  const [brokerTds, setBrokerTds] = React.useState<{ pan: string | null; tdsMode: TdsMode | null } | null>(
    null
  );
  const [vehicleId, setVehicleId] = React.useState<string | null>(record?.vehicleId ?? null);
  const [driverName, setDriverName] = React.useState(record?.driverName ?? "");
  const [driverMobile, setDriverMobile] = React.useState(record?.driverMobile ?? "");
  const [licenseNo, setLicenseNo] = React.useState(record?.licenseNo ?? "");
  const [payableAt, setPayableAt] = React.useState(record?.payableAt ?? "");
  const [remarks, setRemarks] = React.useState(record?.remarks ?? "");

  // ------- LRs -------
  const [pending, setPending] = React.useState<PendingLrRow[]>([]);
  const [selected, setSelected] = React.useState<PendingLrRow[]>(record?.lrs ?? []);

  // ------- amounts -------
  const [freight, setFreight] = React.useState(record?.freight ?? 0);
  const [rate, setRate] = React.useState(record?.rate ?? 0);
  const [rateBasis, setRateBasis] = React.useState<"QTY" | "ACTUAL_WT" | "CHARGE_WT" | "FIXED">(
    record?.rateBasis ?? "CHARGE_WT"
  );
  const [detention, setDetention] = React.useState(record?.detention ?? 0);
  const [odcAmt, setOdcAmt] = React.useState(record?.odcAmt ?? 0);
  const [fineSlip, setFineSlip] = React.useState(record?.fineSlip ?? 0);
  const [ldCharge, setLdCharge] = React.useState(record?.ldCharge ?? 0);
  const [shortageAmt, setShortageAmt] = React.useState(record?.shortageAmt ?? 0);
  const [otherAmt, setOtherAmt] = React.useState(record?.otherAmt ?? 0);
  const [otherRemarks, setOtherRemarks] = React.useState(record?.otherRemarks ?? "");
  const [commMode, setCommMode] = React.useState<"PCT" | "MANUAL">(
    record && record.commissionPct === 0 && record.commissionAmt > 0 ? "MANUAL" : "PCT"
  );
  const [commissionPct, setCommissionPct] = React.useState(record?.commissionPct ?? 0);
  const [commissionAmt, setCommissionAmt] = React.useState(record?.commissionAmt ?? 0);
  const [mamool, setMamool] = React.useState(record?.mamool ?? 0);
  const [courierCharge, setCourierCharge] = React.useState(record?.courierCharge ?? 0);
  const [tdsPct, setTdsPct] = React.useState(record?.tdsPct ?? 0);
  const [tdsOverridden, setTdsOverridden] = React.useState(!!record);

  // ------- trip km -------
  const [startKm, setStartKm] = React.useState(record?.startKm ?? 0);
  const [unloadDateText, setUnloadDateText] = React.useState(
    record?.unloadDate ? formatDate(new Date(record.unloadDate)) : ""
  );
  const [unloadKm, setUnloadKm] = React.useState(record?.unloadKm ?? 0);
  const [unloadRemarks, setUnloadRemarks] = React.useState(record?.unloadRemarks ?? "");

  // ------- advances -------
  const [advances, setAdvances] = React.useState<AdvanceRow[]>(record?.advances ?? []);

  const [saving, setSaving] = React.useState(false);
  const isFinal = record?.isFinal ?? false;

  // fetch pending LRs when vehicle changes
  React.useEffect(() => {
    if (!vehicleId) {
      setPending([]);
      return;
    }
    getPendingLrsForVehicle(vehicleId, id ?? undefined).then((rows) =>
      setPending(rows.filter((r) => !selected.some((s) => s.id === r.id)))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicleId, id]);

  // auto TDS pct from broker PAN
  React.useEffect(() => {
    if (!brokerId) return;
    const b = brokers.find((x) => x.value === brokerId);
    const apply = (pan: string | null, mode: TdsMode | null) => {
      setBrokerTds({ pan, tdsMode: mode });
      if (!tdsOverridden) setTdsPct(tdsPctFromPan(pan, mode));
    };
    if (b) apply(b.pan, b.tdsMode);
    else getBrokerTdsInfo(brokerId).then((info) => apply(info.pan, info.tdsMode));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brokerId]);

  const bookingFreight = selected.reduce((s, r) => s + r.freight, 0);
  const actualWt = selected.reduce((s, r) => s + r.actualWt, 0);
  const chargeWt = selected.reduce((s, r) => s + r.chargeWt, 0);

  const totals = computeChalan({
    rate,
    rateBasis,
    qty: selected.reduce((s, r) => s + r.qty, 0),
    actualWt,
    chargeWt,
    manualFreight: rate > 0 ? 0 : freight,
    detention,
    odcAmt,
    fineSlip,
    otherAmt,
    ldCharge,
    shortageAmt,
    mamool,
    courierCharge,
    commissionPct: commMode === "PCT" ? commissionPct : 0,
    commissionAmt: commMode === "MANUAL" ? commissionAmt : 0,
    tdsPct,
    advances: advances.map((a) => a.amount),
  });

  const autoTdsPct = tdsPctFromPan(brokerTds?.pan, brokerTds?.tdsMode);
  const tdsBadge =
    brokerTds?.tdsMode === "DECLARATION"
      ? "0% — declaration"
      : autoTdsPct === 1
        ? "1% — individual PAN"
        : "2% — company PAN";

  const runningKm = startKm && unloadKm ? unloadKm - startKm : 0;
  const chalanDate = parseDdMmYyyy(dateText);
  const unloadDate = parseDdMmYyyy(unloadDateText);
  const tripDays =
    chalanDate && unloadDate
      ? Math.max(0, Math.round((unloadDate.getTime() - chalanDate.getTime()) / 86400000))
      : 0;

  const buildPayload = () => ({
    id,
    chalanNo,
    chalanDate: chalanDate ? chalanDate.toISOString() : new Date().toISOString(),
    brokerId,
    vehicleId,
    driverName,
    driverMobile,
    licenseNo,
    payableAt,
    remarks,
    lrIds: selected.map((r) => r.id),
    freight,
    rate,
    rateBasis,
    detention,
    odcAmt,
    fineSlip,
    ldCharge,
    shortageAmt,
    otherAmt,
    otherRemarks,
    commissionPct: commMode === "PCT" ? commissionPct : 0,
    commissionAmt: commMode === "MANUAL" ? commissionAmt : 0,
    mamool,
    courierCharge,
    tdsPct,
    startKm: startKm || null,
    unloadDate: unloadDate ? unloadDate.toISOString() : null,
    unloadKm: unloadKm || null,
    unloadRemarks,
  });

  const handleSave = async () => {
    if (!brokerId || !vehicleId || !chalanNo || !chalanDate) {
      toast({ variant: "destructive", title: "Broker, vehicle, chalan no & date are required" });
      return;
    }
    setSaving(true);
    const res = await saveChalan(buildPayload());
    setSaving(false);
    if (res.ok) {
      if (!id) {
        setId(res.id);
        router.replace(`/chalan?id=${res.id}`, { scroll: false });
      }
      toast({ title: "Chalan saved", description: "You can now add advances." });
    } else {
      toast({ variant: "destructive", title: "Save failed", description: res.error });
    }
  };

  const handleSaveAdvances = async () => {
    if (!id) return;
    setSaving(true);
    const res = await saveChalanAdvances(id, advances);
    setSaving(false);
    if (res.ok) toast({ title: "Advances saved" });
    else toast({ variant: "destructive", title: "Save failed", description: res.error });
  };

  const handleFinalSave = async () => {
    if (!id) return;
    setSaving(true);
    // persist latest edits + advances first, then finalize
    const s = await saveChalan(buildPayload());
    if (!s.ok) {
      setSaving(false);
      toast({ variant: "destructive", title: "Save failed", description: s.error });
      return;
    }
    const a = await saveChalanAdvances(id, advances);
    if (!a.ok) {
      setSaving(false);
      toast({ variant: "destructive", title: "Save failed", description: a.error });
      return;
    }
    const res = await finalizeChalan(id);
    setSaving(false);
    if (res.ok) {
      toast({ title: "Chalan finalized", description: "LRs moved to ON CHALAN." });
      router.push("/chalan/register");
    } else {
      toast({ variant: "destructive", title: "Finalize failed", description: res.error });
    }
  };

  const setAdvance = (i: number, patch: Partial<AdvanceRow>) =>
    setAdvances((prev) =>
      prev.map((row, idx) => {
        if (idx !== i) return row;
        const next = { ...row, ...patch };
        if (next.type === "DIESEL" && ("dieselQty" in patch || "dieselRate" in patch || patch.type)) {
          next.amount = dieselAdvanceAmount(next.dieselQty, next.dieselRate);
        }
        return next;
      })
    );

  const brokerName = brokers.find((b) => b.value === brokerId)?.label;

  return (
    <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          Chalan Entry{" "}
          {isFinal && <Badge className="ml-2 align-middle">Final</Badge>}
          {id && !isFinal && (
            <Badge variant="secondary" className="ml-2 align-middle">
              Draft
            </Badge>
          )}
        </h1>
        <div className="flex gap-2">
          {id && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/print/chalan/${id}`} target="_blank">
                Print
              </Link>
            </Button>
          )}
          <Button asChild variant="outline" size="sm">
            <Link href="/chalan/register">Register</Link>
          </Button>
        </div>
      </div>

      {/* header */}
      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm">Chalan Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 p-4 pt-0 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Chalan No">
            <Input value={chalanNo} onChange={(e) => setChalanNo(e.target.value)} onKeyDown={enterAdvances} />
          </Field>
          <Field label="Date">
            <DateInput value={dateText} onChange={(t) => setDateText(t)} />
          </Field>
          <Field label="Broker / Owner">
            <PartyCombobox
              options={brokers}
              value={brokerId}
              onChange={(v) => {
                setBrokerId(v);
                setTdsOverridden(false);
              }}
              ledgerGroup="OWNER_BROKER"
              placeholder="Select broker..."
            />
          </Field>
          <Field label="Vehicle">
            <VehicleCombobox options={vehicles} value={vehicleId} onChange={setVehicleId} />
          </Field>
          <Field label="Driver Name">
            <Input value={driverName} onChange={(e) => setDriverName(e.target.value)} onKeyDown={enterAdvances} />
          </Field>
          <Field label="Driver Mobile">
            <Input value={driverMobile} onChange={(e) => setDriverMobile(e.target.value)} onKeyDown={enterAdvances} />
          </Field>
          <Field label="License No">
            <Input value={licenseNo} onChange={(e) => setLicenseNo(e.target.value)} onKeyDown={enterAdvances} />
          </Field>
          <Field label="Payable At">
            <Input value={payableAt} onChange={(e) => setPayableAt(e.target.value)} onKeyDown={enterAdvances} />
          </Field>
        </CardContent>
      </Card>

      {/* LR picker */}
      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm">LRs on this Chalan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 p-4 pt-0">
          {vehicleId ? (
            <LrPicker
              rows={pending.filter((p) => !selected.some((s) => s.id === p.id))}
              onAdd={(rows) => {
                setSelected((prev) => [...prev, ...rows]);
                // adopt rate, basis and remarks from the LR when not typed yet
                const withRate = rows.find((r) => r.rate > 0);
                if (rate === 0 && withRate) {
                  setRate(withRate.rate);
                  setRateBasis(withRate.rateBasis);
                }
                const withRemarks = rows.find((r) => r.remarks);
                if (!remarks && withRemarks) setRemarks(withRemarks.remarks);
              }}
              title="Pending LRs for vehicle"
            />
          ) : (
            <div className="text-sm text-muted-foreground">
              Select a vehicle to load its pending LRs.
            </div>
          )}
          <SelectedLrList
            rows={selected}
            onRemove={(lrId) => setSelected((prev) => prev.filter((r) => r.id !== lrId))}
          />
        </CardContent>
      </Card>

      {/* amounts */}
      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm">Amounts</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 p-4 pt-0 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Rate">
            <NumInput value={rate} onChange={setRate} />
          </Field>
          <Field label="Rate Basis">
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              value={rateBasis}
              onChange={(e) => setRateBasis(e.target.value as typeof rateBasis)}
            >
              <option value="CHARGE_WT">Per Charge Wt</option>
              <option value="ACTUAL_WT">Per Actual Wt</option>
              <option value="QTY">Per Qty</option>
              <option value="FIXED">Fixed Amount</option>
            </select>
          </Field>
          <Field label={rate > 0 ? "Vehicle Freight (auto = rate × basis)" : "Vehicle Freight (manual)"}>
            <NumInput
              value={rate > 0 ? totals.freight : freight}
              onChange={setFreight}
              readOnly={rate > 0}
            />
          </Field>
          <Field label="Booking Freight (reference — not printed)">
            <NumInput value={bookingFreight} readOnly />
          </Field>
          <Field label="Actual Wt">
            <NumInput value={actualWt} readOnly />
          </Field>
          <Field label="Charge Wt">
            <NumInput value={chargeWt} readOnly />
          </Field>
          <Field label="Detention">
            <NumInput value={detention} onChange={setDetention} />
          </Field>
          <Field label="ODC Amount">
            <NumInput value={odcAmt} onChange={setOdcAmt} />
          </Field>
          <Field label="Fine Slip">
            <NumInput value={fineSlip} onChange={setFineSlip} />
          </Field>
          <Field label="LD Charge (−)">
            <NumInput value={ldCharge} onChange={setLdCharge} />
          </Field>
          <Field label="Shortage Amount (−)">
            <NumInput value={shortageAmt} onChange={setShortageAmt} />
          </Field>
          <Field label="Other Amount">
            <NumInput value={otherAmt} onChange={setOtherAmt} />
          </Field>
          <Field label="Other Remarks" className="sm:col-span-2">
            <Input value={otherRemarks} onChange={(e) => setOtherRemarks(e.target.value)} onKeyDown={enterAdvances} />
          </Field>

          <Field label="Commission" className="lg:col-span-2">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-sm">
                <input
                  type="radio"
                  name="commMode"
                  checked={commMode === "PCT"}
                  onChange={() => setCommMode("PCT")}
                />
                %
              </label>
              <NumInput
                value={commissionPct}
                onChange={setCommissionPct}
                disabled={commMode !== "PCT"}
                className="w-20"
              />
              <label className="flex items-center gap-1.5 text-sm">
                <input
                  type="radio"
                  name="commMode"
                  checked={commMode === "MANUAL"}
                  onChange={() => setCommMode("MANUAL")}
                />
                Manual
              </label>
              <NumInput
                value={commissionAmt}
                onChange={setCommissionAmt}
                disabled={commMode !== "MANUAL"}
                className="w-28"
              />
              <span className="text-sm text-muted-foreground">
                = {formatMoney(totals.commissionAmt)}
              </span>
            </div>
          </Field>
          <Field label="Mamool">
            <NumInput value={mamool} onChange={setMamool} />
          </Field>
          <Field label="Courier Charge">
            <NumInput value={courierCharge} onChange={setCourierCharge} />
          </Field>

          <Field label="TDS %" className="lg:col-span-2">
            <div className="flex items-center gap-2">
              <NumInput
                value={tdsPct}
                onChange={(n) => {
                  setTdsPct(n);
                  setTdsOverridden(true);
                }}
                className="w-20"
              />
              {brokerTds && (
                <Badge variant={tdsPct === autoTdsPct ? "secondary" : "outline"}>{tdsBadge}</Badge>
              )}
              <span className="text-sm text-muted-foreground">
                TDS = {formatMoney(totals.tdsAmt)}
              </span>
            </div>
          </Field>
          <Field label="Remarks" className="lg:col-span-2">
            <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} onKeyDown={enterAdvances} />
          </Field>
        </CardContent>
      </Card>

      {/* step 1 save */}
      {!id && (
        <div className="flex justify-end">
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save (Step 1)"}
          </Button>
        </div>
      )}

      {/* advances */}
      <Card className={!id ? "opacity-50" : undefined}>
        <CardHeader className="flex flex-row items-center justify-between p-4 pb-2">
          <CardTitle className="text-sm">
            Advances {brokerName && <span className="font-normal text-muted-foreground">— {brokerName}</span>}
          </CardTitle>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!id}
            onClick={() =>
              setAdvances((prev) => [
                ...prev,
                {
                  type: "CASH",
                  supplierName: "",
                  bankName: "",
                  dieselQty: 0,
                  dieselRate: 0,
                  amount: 0,
                  date: new Date().toISOString(),
                  remarks: "",
                },
              ])
            }
          >
            + Add advance
          </Button>
        </CardHeader>
        <CardContent className="space-y-2 p-4 pt-0">
          {!id && (
            <div className="text-sm text-muted-foreground">Save the chalan first to add advances.</div>
          )}
          {advances.map((a, i) => (
            <div key={i} className="grid items-end gap-2 rounded-md border p-2 sm:grid-cols-4 lg:grid-cols-8">
              <Field label="Type">
                <Select value={a.type} onValueChange={(v) => setAdvance(i, { type: v as AdvanceRow["type"] })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ADVANCE_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t.replace("_", " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Supplier">
                <Input value={a.supplierName} onChange={(e) => setAdvance(i, { supplierName: e.target.value })} />
              </Field>
              {a.type === "BANK" ? (
                <Field label="Bank">
                  <MasterCombobox
                    options={banks}
                    value={a.bankPartyId ?? banks.find((b) => b.label === a.bankName)?.value ?? null}
                    onChange={(v) =>
                      setAdvance(i, {
                        bankPartyId: v,
                        bankName: banks.find((b) => b.value === v)?.label ?? "",
                      })
                    }
                    placeholder="Bank..."
                  />
                </Field>
              ) : (
                <div />
              )}
              {a.type === "DIESEL" ? (
                <>
                  <Field label="Diesel Qty">
                    <NumInput value={a.dieselQty} onChange={(n) => setAdvance(i, { dieselQty: n })} />
                  </Field>
                  <Field label="Rate">
                    <NumInput value={a.dieselRate} onChange={(n) => setAdvance(i, { dieselRate: n })} />
                  </Field>
                </>
              ) : (
                <>
                  <div />
                  <div />
                </>
              )}
              <Field label="Amount">
                <NumInput
                  value={a.amount}
                  onChange={(n) => setAdvance(i, { amount: n })}
                  readOnly={a.type === "DIESEL"}
                />
              </Field>
              <Field label="Date">
                <DateInput
                  value={a.date ? formatDate(new Date(a.date)) : ""}
                  onChange={(_, d) => setAdvance(i, { date: d ? d.toISOString() : null })}
                />
              </Field>
              <div className="flex items-end gap-2">
                <Field label="Remarks" className="flex-1">
                  <Input value={a.remarks} onChange={(e) => setAdvance(i, { remarks: e.target.value })} />
                </Field>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  onClick={() => setAdvances((prev) => prev.filter((_, idx) => idx !== i))}
                >
                  ×
                </Button>
              </div>
            </div>
          ))}
          {id && advances.length > 0 && (
            <div className="flex justify-end">
              <Button type="button" variant="outline" size="sm" onClick={handleSaveAdvances} disabled={saving}>
                Save advances
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* trip km */}
      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm">Trip KM</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 p-4 pt-0 sm:grid-cols-3 lg:grid-cols-6">
          <Field label="Start KM">
            <NumInput value={startKm} onChange={setStartKm} />
          </Field>
          <Field label="Unload Date">
            <DateInput value={unloadDateText} onChange={(t) => setUnloadDateText(t)} />
          </Field>
          <Field label="Unload KM">
            <NumInput value={unloadKm} onChange={setUnloadKm} />
          </Field>
          <Field label="Running KM">
            <NumInput value={runningKm} readOnly />
          </Field>
          <Field label="Trip Days">
            <NumInput value={tripDays} readOnly />
          </Field>
          <Field label="Unload Remarks">
            <Input value={unloadRemarks} onChange={(e) => setUnloadRemarks(e.target.value)} />
          </Field>
        </CardContent>
      </Card>

      {/* summary */}
      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm">Summary</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <SummaryItem label="Total Freight" value={totals.totalChalanAmt} />
            <SummaryItem label="Commission" value={totals.commissionAmt} negative />
            <SummaryItem label="Mamool" value={mamool} negative />
            <SummaryItem label="Courier" value={courierCharge} negative />
            <SummaryItem label="TDS" value={totals.tdsAmt} negative />
            <SummaryItem label="Other" value={otherAmt} />
            <SummaryItem label="Advance Paid" value={totals.advanceTotal} negative />
            <div className="rounded-md border bg-muted/40 p-2">
              <div className="text-xs text-muted-foreground">Final Balance Payable</div>
              <div className="text-lg font-semibold tabular-nums">{formatMoney(totals.balance)}</div>
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : id ? "Save changes" : "Save (Step 1)"}
            </Button>
            <Button type="button" onClick={handleFinalSave} disabled={saving || !id}>
              Final Save
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}

function SummaryItem({
  label,
  value,
  negative,
}: {
  label: string;
  value: number;
  negative?: boolean;
}) {
  return (
    <div className="rounded-md border p-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium tabular-nums">
        {negative && value > 0 ? "− " : ""}
        {formatMoney(value)}
      </div>
    </div>
  );
}
