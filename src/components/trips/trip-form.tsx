"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { formatMoney } from "@/lib/utils";
import { tripLegTotal, tripLegBalance, tripProfit } from "@/lib/calc/trip";
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
import { MasterCombobox, type MasterOption } from "@/components/data/master-combobox";
import { DateInput } from "@/components/data/date-input";
import {
  CityCreateDialog,
  PartyCreateDialog,
  VehicleCreateDialog,
} from "@/components/masters/inline-dialogs";
import {
  Field,
  NumInput,
  TRIP_EXPENSE_CATEGORIES,
  categoryLabel,
  isoFromText,
  textFromIso,
  todayText,
} from "./shared";
import { saveTrip, findTripSources, type TripSource } from "@/app/(app)/trips/actions";

export interface VehicleOpt extends MasterOption {
  vehicleType?: string | null;
}

export interface TripExpenseRow {
  category: string;
  amount: number;
  remarks: string;
  dateText: string;
}

export interface TripFormValues {
  id?: string | null;
  tripNo: string;
  tripDate: string | null; // ISO
  returnDate: string | null;
  vehicleId: string | null;
  vehicleType: string;
  goingPartyId: string | null;
  goingSourceCityId: string | null;
  goingDestCityId: string | null;
  gFreight: number;
  gHamali: number;
  gOthers: number;
  gDiesel: number;
  gDriverAdvance: number;
  gPartyAdvance: number;
  gOther: number;
  gBankName: string;
  gRemarks: string;
  returnPartyId: string | null;
  returnSourceCityId: string | null;
  returnDestCityId: string | null;
  rFreight: number;
  rHamali: number;
  rOthers: number;
  rDiesel: number;
  rDriverAdvance: number;
  rPartyAdvance: number;
  rDetention: number;
  rBankName: string;
  rRemarks: string;
  expenses: { category: string; amount: number; remarks: string; date: string | null }[];
}

interface TripFormProps {
  vehicles: VehicleOpt[];
  parties: MasterOption[];
  transporters: MasterOption[];
  cities: MasterOption[];
  nextTripNo: string;
  initial?: TripFormValues | null;
}

export function TripForm({
  vehicles: vehicles0,
  parties: parties0,
  transporters: transporters0,
  cities: cities0,
  nextTripNo,
  initial,
}: TripFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = React.useState(false);

  const [vehicles, setVehicles] = React.useState(vehicles0);
  const [parties, setParties] = React.useState(parties0);
  const [transporters, setTransporters] = React.useState(transporters0);
  const [cities, setCities] = React.useState(cities0);

  const [tripNo, setTripNo] = React.useState(initial?.tripNo ?? nextTripNo);
  const [tripDateText, setTripDateText] = React.useState(
    initial?.tripDate ? textFromIso(initial.tripDate) : todayText()
  );
  const [returnDateText, setReturnDateText] = React.useState(textFromIso(initial?.returnDate));
  const [vehicleId, setVehicleId] = React.useState<string | null>(initial?.vehicleId ?? null);
  const [vehicleType, setVehicleType] = React.useState(initial?.vehicleType ?? "");

  // going leg
  const [goingPartyId, setGoingPartyId] = React.useState<string | null>(
    initial?.goingPartyId ?? null
  );
  const [goingSourceCityId, setGoingSourceCityId] = React.useState<string | null>(
    initial?.goingSourceCityId ?? null
  );
  const [goingDestCityId, setGoingDestCityId] = React.useState<string | null>(
    initial?.goingDestCityId ?? null
  );
  const [gFreight, setGFreight] = React.useState(initial?.gFreight ?? 0);
  const [gHamali, setGHamali] = React.useState(initial?.gHamali ?? 0);
  const [gOthers, setGOthers] = React.useState(initial?.gOthers ?? 0);
  const [gDiesel, setGDiesel] = React.useState(initial?.gDiesel ?? 0);
  const [gDriverAdvance, setGDriverAdvance] = React.useState(initial?.gDriverAdvance ?? 0);
  const [gPartyAdvance, setGPartyAdvance] = React.useState(initial?.gPartyAdvance ?? 0);
  const [gOther, setGOther] = React.useState(initial?.gOther ?? 0);
  const [gBankName, setGBankName] = React.useState(initial?.gBankName ?? "");
  const [gRemarks, setGRemarks] = React.useState(initial?.gRemarks ?? "");

  // return leg
  const [returnPartyId, setReturnPartyId] = React.useState<string | null>(
    initial?.returnPartyId ?? null
  );
  const [returnSourceCityId, setReturnSourceCityId] = React.useState<string | null>(
    initial?.returnSourceCityId ?? null
  );
  const [returnDestCityId, setReturnDestCityId] = React.useState<string | null>(
    initial?.returnDestCityId ?? null
  );
  const [rFreight, setRFreight] = React.useState(initial?.rFreight ?? 0);
  const [rHamali, setRHamali] = React.useState(initial?.rHamali ?? 0);
  const [rOthers, setROthers] = React.useState(initial?.rOthers ?? 0);
  const [rDiesel, setRDiesel] = React.useState(initial?.rDiesel ?? 0);
  const [rDriverAdvance, setRDriverAdvance] = React.useState(initial?.rDriverAdvance ?? 0);
  const [rPartyAdvance, setRPartyAdvance] = React.useState(initial?.rPartyAdvance ?? 0);
  const [rDetention, setRDetention] = React.useState(initial?.rDetention ?? 0);
  const [rBankName, setRBankName] = React.useState(initial?.rBankName ?? "");
  const [rRemarks, setRRemarks] = React.useState(initial?.rRemarks ?? "");

  const [expenses, setExpenses] = React.useState<TripExpenseRow[]>(
    initial?.expenses.map((e) => ({
      category: e.category,
      amount: e.amount,
      remarks: e.remarks,
      dateText: textFromIso(e.date),
    })) ?? []
  );

  // auto-fetch sources
  const [sources, setSources] = React.useState<TripSource[]>([]);
  const tripDateIso = isoFromText(tripDateText);
  React.useEffect(() => {
    if (!vehicleId || !tripDateIso) {
      setSources([]);
      return;
    }
    let cancelled = false;
    findTripSources(vehicleId, tripDateIso)
      .then((r) => {
        if (!cancelled) setSources(r);
      })
      .catch(() => setSources([]));
    return () => {
      cancelled = true;
    };
  }, [vehicleId, tripDateIso]);

  const applySource = (s: TripSource) => {
    if (s.partyId) setGoingPartyId(s.partyId);
    if (s.sourceCityId) setGoingSourceCityId(s.sourceCityId);
    if (s.destCityId) setGoingDestCityId(s.destCityId);
    setGFreight(s.freight);
    if (s.advance) setGPartyAdvance(s.advance);
  };

  const gTotalFreight = tripLegTotal(gFreight, gHamali, gOthers);
  const gBalance = tripLegBalance(gTotalFreight, gDiesel, gDriverAdvance, gPartyAdvance, gOther);
  const rTotalFreight = tripLegTotal(rFreight, rHamali, rOthers);
  const rBalance = tripLegBalance(rTotalFreight, rDiesel, rDriverAdvance, rPartyAdvance, rDetention);
  const expenseTotal = expenses.reduce((s, e) => s + e.amount, 0);
  const income = gTotalFreight + rTotalFreight;
  const profit = tripProfit(
    income,
    expenses.map((e) => e.amount)
  );

  const submit = async () => {
    if (!tripNo.trim()) return toast({ variant: "destructive", title: "Trip number is required" });
    if (!tripDateIso) return toast({ variant: "destructive", title: "Valid trip date is required" });
    if (!vehicleId) return toast({ variant: "destructive", title: "Vehicle is required" });
    setBusy(true);
    try {
      const res = await saveTrip({
        id: initial?.id ?? null,
        tripNo,
        tripDate: tripDateIso,
        returnDate: isoFromText(returnDateText),
        vehicleId,
        vehicleType: vehicleType || null,
        goingPartyId,
        goingSourceCityId,
        goingDestCityId,
        gFreight,
        gHamali,
        gOthers,
        gDiesel,
        gDriverAdvance,
        gPartyAdvance,
        gOther,
        gBankName: gBankName || null,
        gRemarks: gRemarks || null,
        returnPartyId,
        returnSourceCityId,
        returnDestCityId,
        rFreight,
        rHamali,
        rOthers,
        rDiesel,
        rDriverAdvance,
        rPartyAdvance,
        rDetention,
        rBankName: rBankName || null,
        rRemarks: rRemarks || null,
        expenses: expenses.map((e) => ({
          category: e.category,
          amount: e.amount,
          remarks: e.remarks || null,
          date: isoFromText(e.dateText),
        })),
      });
      if (res.ok) {
        toast({ title: initial?.id ? "Trip updated" : "Trip saved" });
        router.push("/trips/register");
      } else {
        toast({ variant: "destructive", title: res.error });
      }
    } finally {
      setBusy(false);
    }
  };

  const partyCombobox = (
    opts: MasterOption[],
    setOpts: React.Dispatch<React.SetStateAction<MasterOption[]>>,
    value: string | null,
    onChange: (v: string | null) => void,
    placeholder: string,
    defaultGroup?: "CONSIGNEE_CONSIGNOR" | "OWNER_BROKER"
  ) => (
    <MasterCombobox
      options={opts}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      renderCreateDialog={(closeAndSelect) => (
        <PartyCreateDialog
          open
          onOpenChange={() => closeAndSelect("")}
          defaultGroup={defaultGroup}
          onCreated={(o) => {
            setOpts((prev) => [...prev, o]);
            closeAndSelect(o.value);
          }}
        />
      )}
    />
  );

  const cityCombobox = (
    value: string | null,
    onChange: (v: string | null) => void,
    placeholder: string
  ) => (
    <MasterCombobox
      options={cities}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      renderCreateDialog={(closeAndSelect) => (
        <CityCreateDialog
          open
          onOpenChange={() => closeAndSelect("")}
          onCreated={(o) => {
            setCities((prev) => [...prev, o]);
            closeAndSelect(o.value);
          }}
        />
      )}
    />
  );

  const leg = (
    kind: "G" | "R",
    v: {
      freight: number;
      hamali: number;
      others: number;
      totalFreight: number;
      diesel: number;
      driverAdvance: number;
      partyAdvance: number;
      last: number;
      bankName: string;
      remarks: string;
      balance: number;
    },
    set: {
      freight: (n: number) => void;
      hamali: (n: number) => void;
      others: (n: number) => void;
      diesel: (n: number) => void;
      driverAdvance: (n: number) => void;
      partyAdvance: (n: number) => void;
      last: (n: number) => void;
      bankName: (s: string) => void;
      remarks: (s: string) => void;
    }
  ) => (
    <div className="grid gap-3 sm:grid-cols-4">
      <Field label="Freight">
        <NumInput value={v.freight} onChange={set.freight} />
      </Field>
      <Field label="Hamali">
        <NumInput value={v.hamali} onChange={set.hamali} />
      </Field>
      <Field label="Others">
        <NumInput value={v.others} onChange={set.others} />
      </Field>
      <Field label="Total Freight">
        <Input value={formatMoney(v.totalFreight)} readOnly className="bg-muted text-right font-medium" />
      </Field>
      <Field label="Diesel">
        <NumInput value={v.diesel} onChange={set.diesel} />
      </Field>
      <Field label="Driver Advance">
        <NumInput value={v.driverAdvance} onChange={set.driverAdvance} />
      </Field>
      <Field label="Party Advance">
        <NumInput value={v.partyAdvance} onChange={set.partyAdvance} />
      </Field>
      <Field label={kind === "G" ? "Other Deduction" : "Detention"}>
        <NumInput value={v.last} onChange={set.last} />
      </Field>
      <Field label="Bank Name">
        <Input value={v.bankName} onChange={(e) => set.bankName(e.target.value)} />
      </Field>
      <Field label="Balance">
        <Input value={formatMoney(v.balance)} readOnly className="bg-muted text-right font-medium" />
      </Field>
      <Field label="Remarks" className="sm:col-span-2">
        <Input value={v.remarks} onChange={(e) => set.remarks(e.target.value)} />
      </Field>
    </div>
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Trip Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-5">
          <Field label="Trip No *">
            <Input value={tripNo} onChange={(e) => setTripNo(e.target.value)} />
          </Field>
          <Field label="Vehicle *">
            <MasterCombobox
              options={vehicles}
              value={vehicleId}
              onChange={(v) => {
                setVehicleId(v);
                const veh = vehicles.find((x) => x.value === v);
                if (veh?.vehicleType) setVehicleType(veh.vehicleType);
              }}
              placeholder="Select vehicle..."
              renderCreateDialog={(closeAndSelect) => (
                <VehicleCreateDialog
                  open
                  onOpenChange={() => closeAndSelect("")}
                  onCreated={(o) => {
                    setVehicles((prev) => [...prev, o]);
                    closeAndSelect(o.value);
                  }}
                />
              )}
            />
          </Field>
          <Field label="Vehicle Type">
            <Input value={vehicleType} onChange={(e) => setVehicleType(e.target.value)} />
          </Field>
          <Field label="Trip Date *">
            <DateInput value={tripDateText} onChange={(t) => setTripDateText(t)} />
          </Field>
          <Field label="Return Date">
            <DateInput value={returnDateText} onChange={(t) => setReturnDateText(t)} />
          </Field>
        </CardContent>
      </Card>

      {sources.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Matching LRs / Broker Slips ({sources.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {sources.map((s) => (
              <div
                key={`${s.kind}-${s.id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm"
              >
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="font-medium">
                    {s.kind === "LR" ? "LR" : "Broker Slip"} {s.docNo}
                  </span>
                  <span>{s.partyName ?? "-"}</span>
                  <span className="text-muted-foreground">
                    {s.sourceCity ?? "?"} → {s.destCity ?? "?"}
                  </span>
                  <span className="tabular-nums">Wt: {formatMoney(s.weight)}</span>
                  <span className="tabular-nums">Freight: {formatMoney(s.freight)}</span>
                  <span className="tabular-nums">Adv: {formatMoney(s.advance)}</span>
                </div>
                <Button size="sm" variant="secondary" onClick={() => applySource(s)}>
                  Use
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Going Leg</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Party">
                {partyCombobox(
                  parties,
                  setParties,
                  goingPartyId,
                  setGoingPartyId,
                  "Select party...",
                  "CONSIGNEE_CONSIGNOR"
                )}
              </Field>
              <Field label="Source">{cityCombobox(goingSourceCityId, setGoingSourceCityId, "Source city...")}</Field>
              <Field label="Destination">{cityCombobox(goingDestCityId, setGoingDestCityId, "Dest city...")}</Field>
            </div>
            {leg(
              "G",
              {
                freight: gFreight,
                hamali: gHamali,
                others: gOthers,
                totalFreight: gTotalFreight,
                diesel: gDiesel,
                driverAdvance: gDriverAdvance,
                partyAdvance: gPartyAdvance,
                last: gOther,
                bankName: gBankName,
                remarks: gRemarks,
                balance: gBalance,
              },
              {
                freight: setGFreight,
                hamali: setGHamali,
                others: setGOthers,
                diesel: setGDiesel,
                driverAdvance: setGDriverAdvance,
                partyAdvance: setGPartyAdvance,
                last: setGOther,
                bankName: setGBankName,
                remarks: setGRemarks,
              }
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Return Leg</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Transporter / Party">
                {partyCombobox(
                  transporters,
                  setTransporters,
                  returnPartyId,
                  setReturnPartyId,
                  "Select transporter...",
                  "OWNER_BROKER"
                )}
              </Field>
              <Field label="Source">{cityCombobox(returnSourceCityId, setReturnSourceCityId, "Source city...")}</Field>
              <Field label="Destination">{cityCombobox(returnDestCityId, setReturnDestCityId, "Dest city...")}</Field>
            </div>
            {leg(
              "R",
              {
                freight: rFreight,
                hamali: rHamali,
                others: rOthers,
                totalFreight: rTotalFreight,
                diesel: rDiesel,
                driverAdvance: rDriverAdvance,
                partyAdvance: rPartyAdvance,
                last: rDetention,
                bankName: rBankName,
                remarks: rRemarks,
                balance: rBalance,
              },
              {
                freight: setRFreight,
                hamali: setRHamali,
                others: setROthers,
                diesel: setRDiesel,
                driverAdvance: setRDriverAdvance,
                partyAdvance: setRPartyAdvance,
                last: setRDetention,
                bankName: setRBankName,
                remarks: setRRemarks,
              }
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-base">Trip Expenses</CardTitle>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setExpenses((prev) => [
                  ...prev,
                  { category: "DIESEL", amount: 0, remarks: "", dateText: tripDateText },
                ])
              }
            >
              + Add Expense
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {expenses.length === 0 && (
              <p className="text-sm text-muted-foreground">No expenses added.</p>
            )}
            {expenses.map((e, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_110px_1fr_130px_36px] items-center gap-2">
                <Select
                  value={e.category}
                  onValueChange={(v) =>
                    setExpenses((prev) => prev.map((x, i) => (i === idx ? { ...x, category: v } : x)))
                  }
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TRIP_EXPENSE_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {categoryLabel(c)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <NumInput
                  value={e.amount}
                  onChange={(n) =>
                    setExpenses((prev) => prev.map((x, i) => (i === idx ? { ...x, amount: n } : x)))
                  }
                  className="h-9"
                />
                <Input
                  value={e.remarks}
                  placeholder="Remarks"
                  className="h-9"
                  onChange={(ev) =>
                    setExpenses((prev) =>
                      prev.map((x, i) => (i === idx ? { ...x, remarks: ev.target.value } : x))
                    )
                  }
                />
                <DateInput
                  value={e.dateText}
                  className="h-9"
                  onChange={(t) =>
                    setExpenses((prev) => prev.map((x, i) => (i === idx ? { ...x, dateText: t } : x)))
                  }
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9 text-destructive"
                  onClick={() => setExpenses((prev) => prev.filter((_, i) => i !== idx))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Trip P&L</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Going Freight</span>
              <span className="tabular-nums">{formatMoney(gTotalFreight)}</span>
            </div>
            <div className="flex justify-between">
              <span>Return Freight</span>
              <span className="tabular-nums">{formatMoney(rTotalFreight)}</span>
            </div>
            <div className="flex justify-between font-medium">
              <span>Trip Income</span>
              <span className="tabular-nums">{formatMoney(income)}</span>
            </div>
            <div className="flex justify-between">
              <span>Trip Expenses</span>
              <span className="tabular-nums">- {formatMoney(expenseTotal)}</span>
            </div>
            <div
              className={`flex justify-between border-t pt-2 text-base font-semibold ${
                profit >= 0 ? "text-green-600" : "text-destructive"
              }`}
            >
              <span>{profit >= 0 ? "Profit" : "Loss"}</span>
              <span className="tabular-nums">{formatMoney(profit)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.push("/trips/register")} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={busy}>
          {busy ? "Saving..." : initial?.id ? "Update Trip" : "Save Trip"}
        </Button>
      </div>
    </div>
  );
}
