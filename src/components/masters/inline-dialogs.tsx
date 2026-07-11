"use client";

/**
 * Thin inline-create dialogs for use as `renderCreateDialog` targets of
 * MasterCombobox across modules (LR, chalan, billing, ...).
 *
 * Shared prop signature: { open, onOpenChange, onCreated(option) }.
 */

import * as React from "react";
import { LedgerGroup } from "@prisma/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { MasterCombobox, type MasterOption } from "@/components/data/master-combobox";
import {
  createCityInline,
  createPartyInline,
  createProductInline,
  createVehicleInline,
  getPartyOptions,
  getStateOptions,
  type Option,
} from "@/lib/lookups";

export interface InlineCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (option: Option) => void;
}

const LEDGER_GROUPS: LedgerGroup[] = [
  "BANK",
  "CASH",
  "CONSIGNEE_CONSIGNOR",
  "DRIVER",
  "EXPENSE",
  "INCOME",
  "OFFICE",
  "OWNER_BROKER",
  "STAFF",
  "SUPPLIERS",
];

function groupLabel(g: string): string {
  return g
    .split("_")
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" / ");
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

export function CityCreateDialog({ open, onOpenChange, onCreated }: InlineCreateDialogProps) {
  const { toast } = useToast();
  const [busy, setBusy] = React.useState(false);
  const [states, setStates] = React.useState<MasterOption[]>([]);
  const [name, setName] = React.useState("");
  const [stateId, setStateId] = React.useState<string | null>(null);
  const [district, setDistrict] = React.useState("");
  const [pincode, setPincode] = React.useState("");

  React.useEffect(() => {
    if (open) getStateOptions().then(setStates).catch(() => setStates([]));
  }, [open]);

  const submit = async () => {
    if (!name.trim() || !stateId) {
      toast({ variant: "destructive", title: "City name and state are required" });
      return;
    }
    setBusy(true);
    try {
      const opt = await createCityInline({
        name,
        stateId,
        district: district || undefined,
        pincode: pincode || undefined,
      });
      onCreated(opt);
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Could not create city",
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New City</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="City Name *">
            <Input value={name} onChange={(e) => setName(e.target.value.toUpperCase())} autoFocus />
          </Field>
          <Field label="State *">
            <MasterCombobox options={states} value={stateId} onChange={setStateId} placeholder="Select state..." />
          </Field>
          <Field label="District">
            <Input value={district} onChange={(e) => setDistrict(e.target.value)} />
          </Field>
          <Field label="Pincode">
            <Input value={pincode} onChange={(e) => setPincode(e.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PartyCreateDialog({
  open,
  onOpenChange,
  onCreated,
  defaultGroup,
}: InlineCreateDialogProps & { defaultGroup?: LedgerGroup }) {
  const { toast } = useToast();
  const [busy, setBusy] = React.useState(false);
  const [name, setName] = React.useState("");
  const [group, setGroup] = React.useState<LedgerGroup>(defaultGroup ?? "CONSIGNEE_CONSIGNOR");
  const [address1, setAddress1] = React.useState("");
  const [gstin, setGstin] = React.useState("");
  const [pan, setPan] = React.useState("");
  const [mobile, setMobile] = React.useState("");
  const [tdsMode, setTdsMode] = React.useState<"TDS_APPLICABLE" | "DECLARATION">("TDS_APPLICABLE");

  const submit = async () => {
    if (!name.trim()) {
      toast({ variant: "destructive", title: "Party name is required" });
      return;
    }
    setBusy(true);
    try {
      const opt = await createPartyInline({
        name,
        ledgerGroup: group,
        address1: address1 || undefined,
        gstin: gstin || undefined,
        pan: pan || undefined,
        mobile: mobile || undefined,
        tdsMode: group === "OWNER_BROKER" ? tdsMode : undefined,
      });
      onCreated(opt);
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Could not create party",
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Party</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name *">
            <Input value={name} onChange={(e) => setName(e.target.value.toUpperCase())} autoFocus />
          </Field>
          <Field label="Ledger Group *">
            <Select value={group} onValueChange={(v) => setGroup(v as LedgerGroup)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LEDGER_GROUPS.map((g) => (
                  <SelectItem key={g} value={g}>
                    {groupLabel(g)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Address">
            <Input value={address1} onChange={(e) => setAddress1(e.target.value)} />
          </Field>
          <Field label="GSTIN">
            <Input value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase())} />
          </Field>
          <Field label="PAN">
            <Input value={pan} onChange={(e) => setPan(e.target.value.toUpperCase())} />
          </Field>
          <Field label="Mobile">
            <Input value={mobile} onChange={(e) => setMobile(e.target.value)} />
          </Field>
          {group === "OWNER_BROKER" && (
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">TDS Handling</Label>
              <div className="flex gap-4">
                {(
                  [
                    ["TDS_APPLICABLE", "TDS Applicable"],
                    ["DECLARATION", "Declaration (No TDS)"],
                  ] as const
                ).map(([v, l]) => (
                  <label key={v} className="flex cursor-pointer items-center gap-1.5 text-sm">
                    <input
                      type="radio"
                      checked={tdsMode === v}
                      onChange={() => setTdsMode(v)}
                      className="h-4 w-4 accent-primary"
                    />
                    {l}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function VehicleCreateDialog({ open, onOpenChange, onCreated }: InlineCreateDialogProps) {
  const { toast } = useToast();
  const [busy, setBusy] = React.useState(false);
  const [number, setNumber] = React.useState("");
  const [isOwn, setIsOwn] = React.useState(false);
  const [ownerId, setOwnerId] = React.useState<string | null>(null);
  const [vehicleType, setVehicleType] = React.useState("");
  const [owners, setOwners] = React.useState<MasterOption[]>([]);

  React.useEffect(() => {
    if (open) getPartyOptions(["OWNER_BROKER"]).then(setOwners).catch(() => setOwners([]));
  }, [open]);

  const submit = async () => {
    if (!number.trim()) {
      toast({ variant: "destructive", title: "Vehicle number is required" });
      return;
    }
    if (!isOwn && !ownerId) {
      toast({ variant: "destructive", title: "Owner is required for market vehicles" });
      return;
    }
    setBusy(true);
    try {
      const opt = await createVehicleInline({
        number,
        isOwn,
        ownerId: isOwn ? undefined : ownerId ?? undefined,
        vehicleType: vehicleType || undefined,
      });
      onCreated(opt);
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Could not create vehicle",
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Vehicle</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Vehicle Number *">
            <Input value={number} onChange={(e) => setNumber(e.target.value.toUpperCase())} autoFocus />
          </Field>
          <Field label="Vehicle Type">
            <Input value={vehicleType} onChange={(e) => setVehicleType(e.target.value)} />
          </Field>
          <Field label="Own Vehicle">
            <div className="flex h-10 items-center">
              <Switch checked={isOwn} onCheckedChange={setIsOwn} />
            </div>
          </Field>
          {!isOwn && (
            <Field label="Owner / Broker *">
              <MasterCombobox
                options={owners}
                value={ownerId}
                onChange={setOwnerId}
                placeholder="Select owner..."
              />
            </Field>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ProductCreateDialog({ open, onOpenChange, onCreated }: InlineCreateDialogProps) {
  const { toast } = useToast();
  const [busy, setBusy] = React.useState(false);
  const [name, setName] = React.useState("");
  const [unit, setUnit] = React.useState("MT");
  const [hsnCode, setHsnCode] = React.useState("");
  const [gstPct, setGstPct] = React.useState("");

  const submit = async () => {
    if (!name.trim()) {
      toast({ variant: "destructive", title: "Product name is required" });
      return;
    }
    setBusy(true);
    try {
      const opt = await createProductInline({
        name,
        unit: unit || undefined,
        hsnCode: hsnCode || undefined,
        gstPct: gstPct === "" ? undefined : Number(gstPct),
      });
      onCreated(opt);
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Could not create product",
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Product</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Product Name *">
            <Input value={name} onChange={(e) => setName(e.target.value.toUpperCase())} autoFocus />
          </Field>
          <Field label="Unit">
            <Input value={unit} onChange={(e) => setUnit(e.target.value)} />
          </Field>
          <Field label="HSN Code">
            <Input value={hsnCode} onChange={(e) => setHsnCode(e.target.value)} />
          </Field>
          <Field label="GST %">
            <Input
              type="number"
              inputMode="decimal"
              value={gstPct}
              onChange={(e) => setGstPct(e.target.value)}
              className="text-right"
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
