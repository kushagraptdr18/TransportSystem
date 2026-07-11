"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import type { InvoiceKind } from "@prisma/client";
import { formatDate, formatMoney, parseDdMmYyyy, toNum } from "@/lib/utils";
import { computeInvoice } from "@/lib/calc/invoice";
import { gstSplit } from "@/lib/calc/gst";
import { round2 } from "@/lib/calc/tds";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { DateInput } from "@/components/data/date-input";
import { MasterCombobox, type MasterOption } from "@/components/data/master-combobox";
import { PartyCreateDialog } from "@/components/masters/inline-dialogs";
import {
  getPartyStateCode,
  getPendingLrsForParty,
  resolveBulkLrs,
  saveInvoice,
  type BillingDefaults,
  type BillingPendingLr,
  type InvoiceEditPayload,
} from "@/app/(app)/billing/actions";

// ---------------------------------------------------------------- helpers

function isoToText(iso: string | null): string {
  if (!iso) return "";
  return formatDate(new Date(iso));
}

function textToIso(text: string): string {
  const d = parseDdMmYyyy(text);
  if (!d) return "";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function Num({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange?: (n: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1">
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

interface ChargeRow {
  chargeType: string;
  description: string;
  amount: number;
  relatedLrs: string;
  remarks: string;
}

interface LineRow {
  productName: string;
  description: string;
  uom: string;
  hsnCode: string;
  qty: number;
  rate: number;
  discountPct: number;
  gstPct: number;
}

const KIND_TITLES: Record<InvoiceKind, string> = {
  PART_TRUCK: "Part Truck Bill",
  FULL_TRUCK: "Full Truck Bill",
  MANUAL: "Manual Bill",
  GST: "GST Bill",
};

interface InvoiceFormProps {
  kind: InvoiceKind;
  initial: InvoiceEditPayload | null;
  suggestedInvoiceNo?: string;
  partyOptions: MasterOption[];
  bankOptions: MasterOption[];
  defaults: BillingDefaults;
}

export function InvoiceForm({
  kind,
  initial,
  suggestedInvoiceNo,
  partyOptions: partyOptions0,
  bankOptions,
  defaults,
}: InvoiceFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const withLrs = kind === "PART_TRUCK" || kind === "FULL_TRUCK";
  const withLines = kind === "MANUAL" || kind === "GST";

  const [saving, setSaving] = React.useState(false);
  const [partyOptions, setPartyOptions] = React.useState(partyOptions0);

  // header
  const [invoiceNo, setInvoiceNo] = React.useState(initial?.invoiceNo ?? suggestedInvoiceNo ?? "");
  const [invoiceDateText, setInvoiceDateText] = React.useState(
    initial ? isoToText(initial.invoiceDate) : formatDate(new Date())
  );
  const [dueDateText, setDueDateText] = React.useState(isoToText(initial?.dueDate ?? null));
  const [partyId, setPartyId] = React.useState<string | null>(initial?.partyId ?? null);
  const [bankPartyId, setBankPartyId] = React.useState<string | null>(
    initial?.bankPartyId ?? defaults.defaultBankPartyId
  );
  const [setBankDefault, setSetBankDefault] = React.useState(false);
  const [tdsPct, setTdsPct] = React.useState(initial?.tdsPct ?? defaults.defaultTdsPct);
  const [remarks, setRemarks] = React.useState(initial?.remarks ?? "");
  const [subject, setSubject] = React.useState(initial?.subject ?? "");
  const [vehicleText, setVehicleText] = React.useState(initial?.vehicleText ?? "");
  const [advance, setAdvance] = React.useState(initial?.advance ?? 0);
  const [gstApplicable, setGstApplicable] = React.useState(
    kind === "GST" ? true : initial?.gstApplicable ?? false
  );
  const [gstPct, setGstPct] = React.useState(
    initial?.gstPct ?? (kind === "GST" ? 0 : defaults.firmGstPct)
  );

  // GST extras
  const [placeOfSupply, setPlaceOfSupply] = React.useState(initial?.placeOfSupply ?? "");
  const [supplyDateText, setSupplyDateText] = React.useState(isoToText(initial?.supplyDate ?? null));
  const [transportMode, setTransportMode] = React.useState(initial?.transportMode ?? "");
  const [reverseCharge, setReverseCharge] = React.useState(initial?.reverseCharge ?? false);
  const [tcsPct, setTcsPct] = React.useState(initial?.tcsPct ?? 0);
  const [freightExtra, setFreightExtra] = React.useState(initial?.freightExtra ?? 0);
  const [othersExtra, setOthersExtra] = React.useState(initial?.othersExtra ?? 0);
  const [narration, setNarration] = React.useState(initial?.narration ?? "");

  // LR selection
  const [pendingLrs, setPendingLrs] = React.useState<BillingPendingLr[]>(initial?.lrs ?? []);
  const [selectedLrIds, setSelectedLrIds] = React.useState<Set<string>>(
    new Set(initial?.lrs.map((l) => l.id) ?? [])
  );
  const [loadingLrs, setLoadingLrs] = React.useState(false);
  const [bulkText, setBulkText] = React.useState("");
  const [bulkBusy, setBulkBusy] = React.useState(false);

  // charges / lines
  const [charges, setCharges] = React.useState<ChargeRow[]>(
    initial?.charges.map((c) => ({ ...c })) ?? []
  );
  const [lines, setLines] = React.useState<LineRow[]>(initial?.lines.map((l) => ({ ...l })) ?? []);

  const [partyStateCode, setPartyStateCode] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!partyId) {
      setPartyStateCode(null);
      return;
    }
    getPartyStateCode(partyId).then(setPartyStateCode).catch(() => setPartyStateCode(null));
  }, [partyId]);

  const loadPending = React.useCallback(
    async (pid: string, keep: BillingPendingLr[]) => {
      setLoadingLrs(true);
      try {
        const rows = await getPendingLrsForParty(pid, kind);
        const keepIds = new Set(keep.map((l) => l.id));
        setPendingLrs([...keep, ...rows.filter((r) => !keepIds.has(r.id))]);
      } catch {
        toast({ variant: "destructive", title: "Failed to load pending LRs" });
      } finally {
        setLoadingLrs(false);
      }
    },
    [kind, toast]
  );

  const onPartyChange = (v: string | null) => {
    setPartyId(v);
    if (!withLrs) return;
    // keep LRs already on the invoice being edited (same party), drop the rest
    const keep = initial && v === initial.partyId ? initial.lrs : [];
    setSelectedLrIds(new Set(keep.map((l) => l.id)));
    if (v) void loadPending(v, keep);
    else setPendingLrs([]);
  };

  // initial pending load for edit mode
  React.useEffect(() => {
    if (withLrs && initial?.partyId) void loadPending(initial.partyId, initial.lrs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleLr = (id: string, checked: boolean) => {
    setSelectedLrIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleAll = (checked: boolean) => {
    setSelectedLrIds(checked ? new Set(pendingLrs.map((l) => l.id)) : new Set());
  };

  const addBulk = async () => {
    if (!partyId) {
      toast({ variant: "destructive", title: "Select a party first" });
      return;
    }
    if (!bulkText.trim()) return;
    setBulkBusy(true);
    try {
      const { added, errors } = await resolveBulkLrs(partyId, bulkText, kind);
      if (added.length) {
        setPendingLrs((prev) => {
          const have = new Set(prev.map((l) => l.id));
          return [...prev, ...added.filter((a) => !have.has(a.id))];
        });
        setSelectedLrIds((prev) => {
          const next = new Set(prev);
          added.forEach((a) => next.add(a.id));
          return next;
        });
        setBulkText("");
      }
      for (const err of errors.slice(0, 5)) {
        toast({ variant: "destructive", title: err.reason });
      }
      if (errors.length > 5) {
        toast({ variant: "destructive", title: `...and ${errors.length - 5} more LR errors` });
      }
    } finally {
      setBulkBusy(false);
    }
  };

  // charges
  const addCharge = () =>
    setCharges((c) => [...c, { chargeType: "", description: "", amount: 0, relatedLrs: "", remarks: "" }]);
  const updateCharge = (idx: number, patch: Partial<ChargeRow>) =>
    setCharges((c) => c.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  const removeCharge = (idx: number) => setCharges((c) => c.filter((_, i) => i !== idx));

  // lines
  const addLine = () =>
    setLines((l) => [
      ...l,
      { productName: "", description: "", uom: "", hsnCode: "", qty: 1, rate: 0, discountPct: 0, gstPct: 0 },
    ]);
  const updateLine = (idx: number, patch: Partial<LineRow>) =>
    setLines((l) => l.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  const removeLine = (idx: number) => setLines((l) => l.filter((_, i) => i !== idx));

  // ---------------------------------------------------------------- totals (mirror of server calc)
  const selectedLrs = pendingLrs.filter((l) => selectedLrIds.has(l.id));

  let totals: {
    total: number;
    grandTotal: number;
    cgstAmt: number;
    sgstAmt: number;
    igstAmt: number;
    tdsAmt: number;
    netTotal: number;
    balance: number;
  };
  let tcsAmt = 0;

  if (kind === "GST") {
    const computed = lines.map((l) => {
      const total = round2(l.qty * l.rate);
      const taxableValue = round2(total * (1 - l.discountPct / 100));
      const gst = gstSplit({
        taxableValue,
        gstPct: l.gstPct,
        supplierStateCode: defaults.firmStateCode,
        recipientStateCode: partyStateCode,
      });
      return { total, taxableValue, ...gst };
    });
    const totTaxable = round2(computed.reduce((s, l) => s + l.taxableValue, 0));
    const cgstAmt = round2(computed.reduce((s, l) => s + l.cgst, 0));
    const sgstAmt = round2(computed.reduce((s, l) => s + l.sgst, 0));
    const igstAmt = round2(computed.reduce((s, l) => s + l.igst, 0));
    const preTcs = round2(totTaxable + cgstAmt + sgstAmt + igstAmt + freightExtra + othersExtra);
    tcsAmt = round2((preTcs * tcsPct) / 100);
    const grandTotal = round2(preTcs + tcsAmt);
    totals = {
      total: round2(computed.reduce((s, l) => s + l.total, 0)),
      grandTotal,
      cgstAmt,
      sgstAmt,
      igstAmt,
      tdsAmt: 0,
      netTotal: grandTotal,
      balance: round2(grandTotal - advance),
    };
  } else {
    totals = computeInvoice({
      lrAmounts:
        kind === "MANUAL" ? lines.map((l) => round2(l.qty * l.rate)) : selectedLrs.map((l) => l.amount),
      extraCharges: charges.map((c) => c.amount),
      gstApplicable,
      gstPct,
      supplierStateCode: defaults.firmStateCode,
      recipientStateCode: partyStateCode,
      tdsPct,
      advance,
    });
  }

  // ---------------------------------------------------------------- save
  const handleSave = async () => {
    const invoiceDateIso = textToIso(invoiceDateText);
    if (!invoiceNo.trim()) {
      toast({ variant: "destructive", title: "Invoice number is required" });
      return;
    }
    if (!invoiceDateIso) {
      toast({ variant: "destructive", title: "Valid invoice date is required" });
      return;
    }
    if (!partyId) {
      toast({ variant: "destructive", title: "Party is required" });
      return;
    }
    setSaving(true);
    try {
      const res = await saveInvoice({
        id: initial?.id,
        kind,
        invoiceNo: invoiceNo.trim(),
        invoiceDate: invoiceDateIso,
        dueDate: textToIso(dueDateText) || null,
        partyId,
        bankPartyId,
        setBankDefault,
        tdsPct: kind === "GST" ? 0 : tdsPct,
        remarks,
        subject,
        gstApplicable,
        gstPct,
        lrIds: withLrs ? Array.from(selectedLrIds) : [],
        charges: withLrs
          ? charges
              .filter((c) => c.chargeType.trim() || c.amount !== 0)
              .map((c) => ({ ...c, chargeType: c.chargeType.trim() || "OTHER" }))
          : [],
        lines: withLines ? lines.filter((l) => l.productName.trim()) : [],
        advance,
        vehicleText,
        placeOfSupply,
        supplyDate: textToIso(supplyDateText) || null,
        transportMode,
        reverseCharge,
        tcsPct,
        freightExtra,
        othersExtra,
        narration,
      });
      if (res.ok) {
        toast({ title: `Invoice ${invoiceNo} saved` });
        router.push(`/billing/register?kind=${kind}`);
      } else {
        toast({ variant: "destructive", title: "Save failed", description: res.error });
      }
    } finally {
      setSaving(false);
    }
  };

  const interstate =
    !!defaults.firmStateCode && !!partyStateCode && defaults.firmStateCode !== partyStateCode;

  return (
    <div className="space-y-4">
      {/* header */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{KIND_TITLES[kind]} Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="space-y-1">
            <Label className="text-xs">Invoice No * (auto-generated, editable)</Label>
            <Input className="h-8" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Invoice Date *</Label>
            <DateInput className="h-8" value={invoiceDateText} onChange={setInvoiceDateText} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Due Date</Label>
            <DateInput className="h-8" value={dueDateText} onChange={setDueDateText} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Party *</Label>
            <MasterCombobox
              options={partyOptions}
              value={partyId}
              onChange={onPartyChange}
              placeholder="Select party..."
              renderCreateDialog={(closeAndSelect) => (
                <PartyCreateDialog
                  open
                  onOpenChange={(o) => {
                    if (!o) closeAndSelect("");
                  }}
                  defaultGroup="CONSIGNEE_CONSIGNOR"
                  onCreated={(opt) => {
                    setPartyOptions((prev) => [...prev, opt]);
                    closeAndSelect(opt.value);
                  }}
                />
              )}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Bank Account (printed on bill)</Label>
            <MasterCombobox
              options={bankOptions}
              value={bankPartyId}
              onChange={setBankPartyId}
              placeholder="Select bank..."
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Set as default bank</Label>
            <div className="flex h-8 items-center">
              <Switch checked={setBankDefault} onCheckedChange={setSetBankDefault} />
            </div>
          </div>
          {kind !== "GST" && <Num label="TDS %" value={tdsPct} onChange={setTdsPct} />}
          <Num label="Advance" value={advance} onChange={setAdvance} />
          <div className="space-y-1">
            <Label className="text-xs">Vehicle (text)</Label>
            <Input className="h-8" value={vehicleText} onChange={(e) => setVehicleText(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Subject</Label>
            <Input className="h-8" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label className="text-xs">Remarks</Label>
            <Input className="h-8" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </div>
          {kind !== "GST" && (
            <>
              <div className="space-y-1">
                <Label className="text-xs">GST Applicable</Label>
                <div className="flex h-8 items-center">
                  <Switch checked={gstApplicable} onCheckedChange={setGstApplicable} />
                </div>
              </div>
              {gstApplicable && <Num label="GST %" value={gstPct} onChange={setGstPct} />}
            </>
          )}
        </CardContent>
      </Card>

      {/* GST extras */}
      {kind === "GST" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">GST Details</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="space-y-1">
              <Label className="text-xs">Place of Supply</Label>
              <Input
                className="h-8"
                value={placeOfSupply}
                onChange={(e) => setPlaceOfSupply(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Supply Date</Label>
              <DateInput className="h-8" value={supplyDateText} onChange={setSupplyDateText} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Transport Mode</Label>
              <Input
                className="h-8"
                value={transportMode}
                onChange={(e) => setTransportMode(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Reverse Charge</Label>
              <div className="flex h-8 items-center">
                <Switch checked={reverseCharge} onCheckedChange={setReverseCharge} />
              </div>
            </div>
            <Num label="TCS %" value={tcsPct} onChange={setTcsPct} />
            <Num label="Freight (extra)" value={freightExtra} onChange={setFreightExtra} />
            <Num label="Others (extra)" value={othersExtra} onChange={setOthersExtra} />
            <div className="space-y-1">
              <Label className="text-xs">Narration</Label>
              <Input className="h-8" value={narration} onChange={(e) => setNarration(e.target.value)} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* LR selection */}
      {withLrs && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-base">
              <span>
                Pending LRs {kind === "PART_TRUCK" ? "(TBB only)" : ""}
                {loadingLrs ? " — loading..." : ""}
              </span>
              <span className="text-sm font-normal text-muted-foreground">
                {selectedLrIds.size} of {pendingLrs.length} selected
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Textarea
                placeholder="Bulk add: paste LR numbers separated by space / comma / new line"
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                className="min-h-[38px] flex-1"
                rows={1}
              />
              <Button type="button" variant="outline" onClick={addBulk} disabled={bulkBusy}>
                {bulkBusy ? "Adding..." : "Add LRs"}
              </Button>
            </div>
            <div className="max-h-96 overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">
                      <Checkbox
                        checked={pendingLrs.length > 0 && selectedLrIds.size === pendingLrs.length}
                        onCheckedChange={(c) => toggleAll(c === true)}
                      />
                    </TableHead>
                    <TableHead>LR No</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>From</TableHead>
                    <TableHead>To</TableHead>
                    <TableHead>Vehicle</TableHead>
                    <TableHead>PO No</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Charge Wt</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingLrs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center text-muted-foreground">
                        {partyId ? "No pending LRs for this party." : "Select a party to load LRs."}
                      </TableCell>
                    </TableRow>
                  )}
                  {pendingLrs.map((lr) => (
                    <TableRow key={lr.id} className="cursor-pointer" onClick={() => toggleLr(lr.id, !selectedLrIds.has(lr.id))}>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedLrIds.has(lr.id)}
                          onCheckedChange={(c) => toggleLr(lr.id, c === true)}
                        />
                      </TableCell>
                      <TableCell>{lr.lrNo}</TableCell>
                      <TableCell>{formatDate(lr.lrDate)}</TableCell>
                      <TableCell>{lr.source}</TableCell>
                      <TableCell>{lr.dest}</TableCell>
                      <TableCell>{lr.vehicle}</TableCell>
                      <TableCell>{lr.poNumber}</TableCell>
                      <TableCell className="text-right tabular-nums">{lr.qty}</TableCell>
                      <TableCell className="text-right tabular-nums">{lr.chargeWt}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(lr.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                {selectedLrs.length > 0 && (
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={7}>Selected total</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {selectedLrs.reduce((s, l) => s + l.qty, 0)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {round2(selectedLrs.reduce((s, l) => s + l.chargeWt, 0))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(selectedLrs.reduce((s, l) => s + l.amount, 0))}
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                )}
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* extra charges (LR bills) */}
      {withLrs && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-base">
              <span>Additional Charges</span>
              <Button type="button" variant="outline" size="sm" onClick={addCharge}>
                <Plus className="h-3.5 w-3.5" /> Add charge
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {charges.length === 0 && (
              <p className="text-sm text-muted-foreground">No additional charges.</p>
            )}
            {charges.map((c, idx) => (
              <div key={idx} className="grid grid-cols-2 items-end gap-2 md:grid-cols-6">
                <div className="space-y-1">
                  <Label className="text-xs">Charge Type</Label>
                  <Input
                    className="h-8"
                    value={c.chargeType}
                    placeholder="e.g. DETENTION"
                    onChange={(e) => updateCharge(idx, { chargeType: e.target.value.toUpperCase() })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Description</Label>
                  <Input
                    className="h-8"
                    value={c.description}
                    onChange={(e) => updateCharge(idx, { description: e.target.value })}
                  />
                </div>
                <Num label="Amount" value={c.amount} onChange={(n) => updateCharge(idx, { amount: n })} />
                <div className="space-y-1">
                  <Label className="text-xs">Related LRs</Label>
                  <Input
                    className="h-8"
                    value={c.relatedLrs}
                    onChange={(e) => updateCharge(idx, { relatedLrs: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Remarks</Label>
                  <Input
                    className="h-8"
                    value={c.remarks}
                    onChange={(e) => updateCharge(idx, { remarks: e.target.value })}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive"
                  onClick={() => removeCharge(idx)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* lines (manual / GST bills) */}
      {withLines && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-base">
              <span>Bill Lines</span>
              <Button type="button" variant="outline" size="sm" onClick={addLine}>
                <Plus className="h-3.5 w-3.5" /> Add line
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {lines.length === 0 && <p className="text-sm text-muted-foreground">No lines added.</p>}
            {lines.map((l, idx) => {
              const lineTotal = round2(l.qty * l.rate);
              const taxable = round2(lineTotal * (1 - l.discountPct / 100));
              return (
                <div key={idx} className="grid grid-cols-2 items-end gap-2 md:grid-cols-9">
                  <div className="space-y-1 md:col-span-2">
                    <Label className="text-xs">Particulars *</Label>
                    <Input
                      className="h-8"
                      value={l.productName}
                      onChange={(e) => updateLine(idx, { productName: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">UOM</Label>
                    <Input
                      className="h-8"
                      value={l.uom}
                      onChange={(e) => updateLine(idx, { uom: e.target.value })}
                    />
                  </div>
                  {kind === "GST" && (
                    <div className="space-y-1">
                      <Label className="text-xs">HSN / SAC</Label>
                      <Input
                        className="h-8"
                        value={l.hsnCode}
                        onChange={(e) => updateLine(idx, { hsnCode: e.target.value })}
                      />
                    </div>
                  )}
                  <Num label="Qty" value={l.qty} onChange={(n) => updateLine(idx, { qty: n })} />
                  <Num label="Rate" value={l.rate} onChange={(n) => updateLine(idx, { rate: n })} />
                  {kind === "GST" && (
                    <>
                      <Num
                        label="Disc %"
                        value={l.discountPct}
                        onChange={(n) => updateLine(idx, { discountPct: n })}
                      />
                      <Num
                        label="GST %"
                        value={l.gstPct}
                        onChange={(n) => updateLine(idx, { gstPct: n })}
                      />
                    </>
                  )}
                  <div className="flex items-end gap-1">
                    <Num label={kind === "GST" ? "Taxable" : "Amount"} value={taxable} disabled />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() => removeLine(idx)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* totals */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Totals</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm tabular-nums md:grid-cols-2">
          <div className="space-y-1">
            {(
              [
                [withLrs ? "LR Freight Total" : "Lines Total", totals.total],
                ["Grand Total (before tax)", totals.grandTotal],
              ] as const
            ).map(([label, val]) => (
              <div key={label} className="flex justify-between">
                <span className="text-muted-foreground">{label}</span>
                <span>{formatMoney(val)}</span>
              </div>
            ))}
            {(gstApplicable || kind === "GST") && (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    CGST {interstate ? "" : `(intra-state)`}
                  </span>
                  <span>{formatMoney(totals.cgstAmt)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">SGST</span>
                  <span>{formatMoney(totals.sgstAmt)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">IGST {interstate ? "(inter-state)" : ""}</span>
                  <span>{formatMoney(totals.igstAmt)}</span>
                </div>
              </>
            )}
            {kind === "GST" && tcsPct > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">TCS @ {tcsPct}%</span>
                <span>{formatMoney(tcsAmt)}</span>
              </div>
            )}
          </div>
          <div className="space-y-1">
            {kind !== "GST" && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">TDS @ {tdsPct}% (info)</span>
                <span>{formatMoney(totals.tdsAmt)}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold">
              <span>Net Total</span>
              <span>{formatMoney(totals.netTotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Less: Advance</span>
              <span>{formatMoney(advance)}</span>
            </div>
            <div className="flex justify-between border-t pt-1 font-semibold">
              <span>Balance</span>
              <span>{formatMoney(totals.balance)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.push(`/billing/register?kind=${kind}`)}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : initial ? "Update Bill" : "Save Bill"}
        </Button>
      </div>
    </div>
  );
}
