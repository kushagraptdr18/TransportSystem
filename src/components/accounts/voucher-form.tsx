"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray, Controller, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { formatDate, formatMoney, parseDdMmYyyy } from "@/lib/utils";
import { round2 } from "@/lib/calc/tds";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { MasterCombobox, MasterOption } from "@/components/data/master-combobox";
import {
  saveVoucher,
  getAllocationCandidates,
  getPartyAdvanceInfo,
  type AllocationCandidate,
} from "@/app/(app)/accounts/vouchers/actions";
import {
  ADJUSTMENT_TYPES,
  REFERENCE_TYPES,
  adjustmentLabel,
} from "@/lib/adjust-engine";

const MODULE_LINKS = [
  "ALL",
  "BILLING",
  "LORRY_HIRE",
  "BROKER_ENTRY",
  "FREIGHT_CHALLAN",
  "CASH_MEMO",
  "GST_BILLING",
  "LR_ENTRY",
  "OTHERS",
] as const;

const ALLOCATABLE: string[] = [
  "ALL",
  "BILLING",
  "GST_BILLING",
  "FREIGHT_CHALLAN",
  "BROKER_ENTRY",
  "LORRY_HIRE",
  "CASH_MEMO",
];

const allocationSchema = z.object({
  refId: z.string(),
  refNo: z.string(),
  module: z.string().default("BILLING"),
  billAmt: z.coerce.number().min(0).default(0),
  outstanding: z.coerce.number().min(0).default(0),
  tdsPct: z.coerce.number().min(0).default(0),
  tdsAmt: z.coerce.number().min(0).default(0),
  deduction: z.coerce.number().min(0).default(0),
  otherAmt: z.coerce.number().min(0).default(0),
  amount: z.coerce.number().min(0).default(0),
});

const formSchema = z.object({
  voucherNo: z.string().trim().min(1, "Voucher number is required"),
  voucherDate: z.string().min(1, "Date is required"), // dd/mm/yyyy
  entryType: z.enum(["CASH", "BANK", "CONTRA"]),
  moduleLink: z.enum(MODULE_LINKS),
  partyId: z.string().nullable(),
  vehicleId: z.string().nullable(),
  accountHeadId: z.string().nullable(),
  ledgerPosting: z.enum(["PARTY", "VEHICLE", "BOTH"]),
  bankPartyId: z.string().min(1, "Bank/Cash account is required"),
  chequeNo: z.string(),
  chequeDate: z.string(),
  amount: z.coerce.number().min(0).default(0),
  tdsAmt: z.coerce.number().min(0).default(0),
  deduction: z.coerce.number().min(0).default(0),
  otherAmt: z.coerce.number().min(0).default(0),
  remarks: z.string(),
  allocations: z.array(allocationSchema),
  adjustments: z.array(
    z.object({
      adjustmentType: z.string(),
      referenceType: z.string(),
      referenceNo: z.string(),
      referenceDate: z.string(),
      amount: z.coerce.number().min(0).default(0),
      remarks: z.string(),
    })
  ),
});

type FormValues = z.infer<typeof formSchema>;

export interface RecentVoucher {
  id: string;
  voucherNo: string;
  voucherDate: string;
  partyName: string | null;
  bankName: string | null;
  moduleLink: string;
  amount: number;
  netAmount: number;
}

interface VoucherFormProps {
  peekNumbers: Record<"RECEIPT" | "PAYMENT" | "CONTRA" | "JOURNAL", string>;
  partyOptions: MasterOption[];
  bankOptions: MasterOption[];
  vehicleOptions: MasterOption[];
  accountHeadOptions: MasterOption[];
  recent: Record<"RECEIPT" | "PAYMENT" | "CONTRA" | "JOURNAL", RecentVoucher[]>;
}

function toIso(text: string): string {
  const d = parseDdMmYyyy(text);
  if (!d) return "";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function VoucherForm({
  peekNumbers,
  partyOptions,
  bankOptions,
  vehicleOptions,
  accountHeadOptions,
  recent,
}: VoucherFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [type, setType] = React.useState<"RECEIPT" | "PAYMENT" | "CONTRA" | "JOURNAL">("RECEIPT");
  const [saving, setSaving] = React.useState(false);
  const [loadingAllocs, setLoadingAllocs] = React.useState(false);
  const [advInfo, setAdvInfo] = React.useState<{ received: number; paid: number } | null>(null);

  const defaults = React.useCallback(
    (t: "RECEIPT" | "PAYMENT" | "CONTRA" | "JOURNAL"): FormValues => ({
      voucherNo: peekNumbers[t] ?? "1",
      voucherDate: formatDate(new Date()),
      entryType: t === "CONTRA" ? "CONTRA" : "CASH",
      // default = All: the grid fetches pending documents across every module
      moduleLink: t === "RECEIPT" || t === "PAYMENT" ? "ALL" : "OTHERS",
      partyId: null,
      vehicleId: null,
      accountHeadId: null,
      ledgerPosting: "PARTY",
      bankPartyId: "",
      chequeNo: "",
      chequeDate: "",
      amount: 0,
      tdsAmt: 0,
      deduction: 0,
      otherAmt: 0,
      remarks: "",
      allocations: [],
      adjustments: [],
    }),
    [peekNumbers]
  );

  const form = useForm<FormValues>({
    // z.coerce makes the schema input type `unknown`; the form always holds numbers
    resolver: zodResolver(formSchema) as unknown as Resolver<FormValues>,
    defaultValues: defaults("RECEIPT"),
  });
  const { fields, replace, update } = useFieldArray({ control: form.control, name: "allocations" });
  const adjArray = useFieldArray({ control: form.control, name: "adjustments" });

  const watched = form.watch();
  const adjTotal = round2(
    (watched.adjustments ?? []).reduce((s, a) => s + (Number(a.amount) || 0), 0)
  );
  const netAmount = round2(
    (watched.amount || 0) -
      (watched.tdsAmt || 0) -
      (watched.deduction || 0) +
      (watched.otherAmt || 0) -
      adjTotal
  );
  const allocTotal = round2(
    (watched.allocations ?? []).reduce((s, a) => s + (Number(a.amount) || 0), 0)
  );
  const allocMismatch =
    (watched.allocations?.length ?? 0) > 0 && Math.abs(allocTotal - (watched.amount || 0)) > 0.01;

  const switchTab = (t: string) => {
    const vt = t as "RECEIPT" | "PAYMENT" | "CONTRA" | "JOURNAL";
    setType(vt);
    form.reset(defaults(vt));
  };

  const loadAllocations = async (moduleLink: string, partyId: string | null) => {
    if (!ALLOCATABLE.includes(moduleLink)) {
      replace([]);
      return;
    }
    setLoadingAllocs(true);
    try {
      const candidates: AllocationCandidate[] = await getAllocationCandidates({
        moduleLink: moduleLink as never,
        partyId,
      });
      replace(
        candidates.map((c) => ({
          refId: c.refId,
          refNo: c.refNo,
          module: c.module,
          billAmt: c.billAmt,
          outstanding: c.outstanding,
          tdsPct: c.tdsPct,
          tdsAmt: 0,
          deduction: 0,
          otherAmt: 0,
          amount: 0,
        }))
      );
    } catch {
      toast({ variant: "destructive", title: "Failed to load open documents" });
    } finally {
      setLoadingAllocs(false);
    }
  };

  const onSubmit = async (values: FormValues) => {
    if (allocMismatch) {
      toast({
        title: "Allocation mismatch",
        description: `Allocated ${formatMoney(allocTotal)} but voucher amount is ${formatMoney(values.amount)}.`,
      });
    }
    setSaving(true);
    try {
      const res = await saveVoucher({
        type,
        voucherNo: values.voucherNo,
        voucherDate: toIso(values.voucherDate),
        entryType: values.entryType,
        moduleLink: values.moduleLink === "ALL" ? "OTHERS" : values.moduleLink,
        partyId: values.partyId,
        vehicleId: values.vehicleId,
        accountHeadId: values.accountHeadId,
        ledgerPosting: values.ledgerPosting,
        bankPartyId: values.bankPartyId,
        chequeNo: values.chequeNo || null,
        chequeDate: values.chequeDate ? toIso(values.chequeDate) : null,
        amount: values.amount,
        tdsAmt: values.tdsAmt,
        deduction: values.deduction,
        otherAmt: values.otherAmt,
        remarks: values.remarks || null,
        adjustments: values.adjustments
          .filter((a) => (Number(a.amount) || 0) > 0 && a.referenceNo.trim())
          .map((a) => ({
            adjustmentType: a.adjustmentType,
            referenceType: a.referenceType,
            referenceNo: a.referenceNo.trim(),
            referenceDate: a.referenceDate ? toIso(a.referenceDate) || null : null,
            amount: a.amount,
            remarks: a.remarks || null,
          })),
        allocations: values.allocations
          .filter((a) => (Number(a.amount) || 0) > 0)
          .map((a) => ({
            refId: a.refId,
            refNo: a.refNo,
            refType: a.module as never,
            billAmt: a.billAmt,
            tdsPct: a.tdsPct,
            tdsAmt: a.tdsAmt,
            deduction: a.deduction,
            otherAmt: a.otherAmt,
            amount: a.amount,
          })),
      });
      if (res.ok) {
        toast({ title: `${type} voucher saved` });
        form.reset(defaults(type));
        router.refresh();
      } else {
        toast({ variant: "destructive", title: "Save failed", description: res.error });
      }
    } finally {
      setSaving(false);
    }
  };

  const isContra = type === "CONTRA";
  const isJournal = type === "JOURNAL";
  // custom adjustment heads added in the Account Head master extend the list
  const adjustmentTypeOptions = React.useMemo(() => {
    const custom = accountHeadOptions
      .filter((h) => h.meta === "ADJUSTMENT")
      .map((h) => h.label.toUpperCase().replace(/ /g, "_"));
    return Array.from(new Set([...ADJUSTMENT_TYPES, ...custom]));
  }, [accountHeadOptions]);
  const recentRows = recent[type] ?? [];

  return (
    <Tabs value={type} onValueChange={switchTab}>
      <TabsList>
        <TabsTrigger value="RECEIPT">Receipt</TabsTrigger>
        <TabsTrigger value="PAYMENT">Payment</TabsTrigger>
        <TabsTrigger value="CONTRA">Contra</TabsTrigger>
        <TabsTrigger value="JOURNAL">Journal</TabsTrigger>
      </TabsList>

      <form onSubmit={form.handleSubmit(onSubmit)} className="mt-4 space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{type} Voucher</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="space-y-1">
              <Label>Voucher No</Label>
              <Input {...form.register("voucherNo")} />
            </div>
            <div className="space-y-1">
              <Label>Date</Label>
              <Controller
                control={form.control}
                name="voucherDate"
                render={({ field }) => (
                  <DateInput value={field.value} onChange={(text) => field.onChange(text)} />
                )}
              />
            </div>
            <div className="space-y-1">
              <Label>Entry Type</Label>
              <Controller
                control={form.control}
                name="entryType"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CASH">Cash</SelectItem>
                      <SelectItem value="BANK">Bank</SelectItem>
                      <SelectItem value="CONTRA">Contra</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-1">
              <Label>Module</Label>
              <Controller
                control={form.control}
                name="moduleLink"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={(v) => {
                      field.onChange(v);
                      void loadAllocations(v, form.getValues("partyId"));
                    }}
                    disabled={isContra}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MODULE_LINKS.map((m) => (
                        <SelectItem key={m} value={m}>
                          {m.replace(/_/g, " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-1">
              <Label>{isContra ? "From Bank/Cash" : isJournal ? "Debit Party" : "Party"}</Label>
              <Controller
                control={form.control}
                name="partyId"
                render={({ field }) => (
                  <MasterCombobox
                    options={isContra ? bankOptions : partyOptions}
                    value={field.value}
                    onChange={(v) => {
                      field.onChange(v);
                      if (!isContra) void loadAllocations(form.getValues("moduleLink"), v);
                      if (v) {
                        getPartyAdvanceInfo(v).then(setAdvInfo).catch(() => setAdvInfo(null));
                      } else setAdvInfo(null);
                    }}
                    placeholder={isContra ? "Select account..." : "Select party..."}
                  />
                )}
              />
            </div>
            {!isContra && (
              <>
                <div className="space-y-1">
                  <Label>Vehicle</Label>
                  <Controller
                    control={form.control}
                    name="vehicleId"
                    render={({ field }) => (
                      <MasterCombobox
                        options={vehicleOptions}
                        value={field.value}
                        onChange={field.onChange}
                        placeholder="Select vehicle..."
                      />
                    )}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Account Head</Label>
                  <Controller
                    control={form.control}
                    name="accountHeadId"
                    render={({ field }) => (
                      <MasterCombobox
                        options={accountHeadOptions}
                        value={field.value}
                        onChange={field.onChange}
                        placeholder="For OTHERS..."
                      />
                    )}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Ledger Posting</Label>
                  <Controller
                    control={form.control}
                    name="ledgerPosting"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="PARTY">Party</SelectItem>
                          <SelectItem value="VEHICLE">Vehicle</SelectItem>
                          <SelectItem value="BOTH">Both</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
              </>
            )}

            <div className="space-y-1">
              <Label>
                {isContra ? "To Bank/Cash" : isJournal ? "Credit Party / Account" : "Bank / Cash A/c"}
              </Label>
              <Controller
                control={form.control}
                name="bankPartyId"
                render={({ field }) => (
                  <MasterCombobox
                    options={isJournal ? partyOptions : bankOptions}
                    value={field.value || null}
                    onChange={(v) => field.onChange(v ?? "")}
                    placeholder="Select account..."
                  />
                )}
              />
              {form.formState.errors.bankPartyId && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.bankPartyId.message}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label>Cheque No</Label>
              <Input {...form.register("chequeNo")} />
            </div>
            <div className="space-y-1">
              <Label>Cheque Date</Label>
              <Controller
                control={form.control}
                name="chequeDate"
                render={({ field }) => (
                  <DateInput value={field.value} onChange={(text) => field.onChange(text)} />
                )}
              />
            </div>

            <div className="space-y-1">
              <Label>Amount</Label>
              <Input
                type="number"
                step="0.01"
                {...form.register("amount", { valueAsNumber: true })}
              />
            </div>
            <div className="space-y-1">
              <Label>TDS Amt</Label>
              <Input
                type="number"
                step="0.01"
                {...form.register("tdsAmt", { valueAsNumber: true })}
              />
            </div>
            <div className="space-y-1">
              <Label>Deduction</Label>
              <Input
                type="number"
                step="0.01"
                {...form.register("deduction", { valueAsNumber: true })}
              />
            </div>
            <div className="space-y-1">
              <Label>Other Amt</Label>
              <Input
                type="number"
                step="0.01"
                {...form.register("otherAmt", { valueAsNumber: true })}
              />
            </div>

            <div className="col-span-2 space-y-1 md:col-span-3">
              <Label>Remarks</Label>
              <Textarea rows={1} {...form.register("remarks")} />
            </div>
            <div className="space-y-1">
              <Label>Net Amount</Label>
              <div className="flex h-10 items-center rounded-md border bg-muted px-3 text-right font-semibold tabular-nums">
                {formatMoney(netAmount)}
              </div>
            </div>
          </CardContent>
        </Card>

        {isJournal && (
          <p className="rounded-md border bg-muted/40 p-2 text-xs text-muted-foreground">
            <b>Journal voucher — no cash or bank moves.</b> The <b>Debit Party</b> is the ledger
            that ends up owing more / receiving the value (e.g. the party you are raising a{" "}
            <b>debit note</b> on, or the head an expense moves TO). The credit account is the
            ledger whose balance reduces (e.g. the party getting a <b>credit note</b>, a write-off
            head, or the head an amount moves FROM). Use it for debit/credit notes, ledger
            transfers, write-offs, reclassifications and rectification entries — use the
            Adjustments section below for reference-linked notes.
          </p>
        )}
        {!isContra && ALLOCATABLE.includes(watched.moduleLink) && (
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-base">
                Allocation {loadingAllocs && <span className="text-xs font-normal">loading...</span>}
                {advInfo && (advInfo.received > 0 || advInfo.paid > 0) && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {advInfo.received > 0 && `Advance received available: ${formatMoney(advInfo.received)}`}
                    {advInfo.received > 0 && advInfo.paid > 0 && " · "}
                    {advInfo.paid > 0 && `Advance paid outstanding: ${formatMoney(advInfo.paid)}`}
                  </span>
                )}
              </CardTitle>
              <Button
                type="button"
                variant="outline"
                size="sm"
                title="Distribute the voucher amount across pending references, oldest first"
                onClick={() => {
                  let remaining = Number(form.getValues("amount")) || 0;
                  fields.forEach((_, i) => {
                    const row = form.getValues(`allocations.${i}`);
                    const avail = Math.max(
                      0,
                      round2(row.outstanding - (row.tdsAmt || 0) - (row.deduction || 0))
                    );
                    const pay = round2(Math.min(avail, Math.max(0, remaining)));
                    remaining = round2(remaining - pay);
                    update(i, { ...row, amount: pay });
                  });
                }}
              >
                Auto Allocate
              </Button>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ref No</TableHead>
                      <TableHead>Module</TableHead>
                      <TableHead className="text-right">Bill Amt</TableHead>
                      <TableHead className="text-right">Outstanding</TableHead>
                      <TableHead className="w-20 text-right">TDS %</TableHead>
                      <TableHead className="w-24 text-right">TDS Amt</TableHead>
                      <TableHead className="w-24 text-right">Deduction</TableHead>
                      <TableHead className="w-24 text-right">Other</TableHead>
                      <TableHead className="w-28 text-right">
                        {type === "RECEIPT" ? "Received" : "Paid"}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fields.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="h-16 text-center text-muted-foreground">
                          No open documents — a party receipt saved without allocations is stored
                          automatically as an Advance for the party.
                        </TableCell>
                      </TableRow>
                    ) : (
                      fields.map((f, i) => (
                        <TableRow key={f.id}>
                          <TableCell>{f.refNo}</TableCell>
                          <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                            {f.module.replace(/_/g, " ")}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatMoney(f.billAmt)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatMoney(f.outstanding)}
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              step="0.01"
                              className="h-8 text-right"
                              {...form.register(`allocations.${i}.tdsPct`, {
                                valueAsNumber: true,
                                onChange: (e) => {
                                  const pct = Number(e.target.value) || 0;
                                  const row = form.getValues(`allocations.${i}`);
                                  update(i, {
                                    ...row,
                                    tdsPct: pct,
                                    tdsAmt: round2((row.outstanding * pct) / 100),
                                  });
                                },
                              })}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              step="0.01"
                              className="h-8 text-right"
                              {...form.register(`allocations.${i}.tdsAmt`, { valueAsNumber: true })}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              step="0.01"
                              className="h-8 text-right"
                              {...form.register(`allocations.${i}.deduction`, {
                                valueAsNumber: true,
                              })}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              step="0.01"
                              className="h-8 text-right"
                              {...form.register(`allocations.${i}.otherAmt`, {
                                valueAsNumber: true,
                              })}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              step="0.01"
                              className="h-8 text-right"
                              {...form.register(`allocations.${i}.amount`, { valueAsNumber: true })}
                            />
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                  {fields.length > 0 && (
                    <TableFooter>
                      <TableRow>
                        <TableCell colSpan={7}>Allocated total</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatMoney(allocTotal)}
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  )}
                </Table>
              </div>
              {allocMismatch && (
                <p className="mt-2 text-sm text-amber-600">
                  Warning: allocated {formatMoney(allocTotal)} does not equal voucher amount{" "}
                  {formatMoney(watched.amount || 0)}.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {!isContra && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base">
                Adjustments / Deductions (reference-based)
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  each line posts automatically to its own ledger — nothing stays outstanding
                </span>
              </CardTitle>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  adjArray.append({
                    adjustmentType: "TDS",
                    referenceType: isJournal ? "INVOICE" : "BILL",
                    referenceNo: "",
                    referenceDate: "",
                    amount: 0,
                    remarks: "",
                  })
                }
              >
                + Add adjustment
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {adjArray.fields.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No adjustments. Use for TDS, shortage, damage, claims, advance / loan
                  adjustments, debit &amp; credit notes, etc.
                </p>
              )}
              {adjArray.fields.map((f, i) => (
                <div key={f.id} className="grid grid-cols-2 items-end gap-2 md:grid-cols-7">
                  <div className="space-y-1">
                    <Label className="text-xs">Adjustment Type</Label>
                    <Controller
                      control={form.control}
                      name={`adjustments.${i}.adjustmentType`}
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {adjustmentTypeOptions.map((t) => (
                              <SelectItem key={t} value={t}>
                                {adjustmentLabel(t)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Reference Type</Label>
                    <Controller
                      control={form.control}
                      name={`adjustments.${i}.referenceType`}
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {REFERENCE_TYPES.map((t) => (
                              <SelectItem key={t} value={t}>
                                {adjustmentLabel(t)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Reference No *</Label>
                    <Input
                      className="h-9"
                      placeholder="INV-101 / ADV-0001..."
                      {...form.register(`adjustments.${i}.referenceNo`)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Reference Date</Label>
                    <Controller
                      control={form.control}
                      name={`adjustments.${i}.referenceDate`}
                      render={({ field }) => (
                        <DateInput className="h-9" value={field.value} onChange={field.onChange} />
                      )}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Amount</Label>
                    <Input
                      type="number"
                      step="0.01"
                      className="h-9 text-right"
                      {...form.register(`adjustments.${i}.amount`, { valueAsNumber: true })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Reason / Remarks</Label>
                    <Input className="h-9" {...form.register(`adjustments.${i}.remarks`)} />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => adjArray.remove(i)}
                  >
                    Remove
                  </Button>
                </div>
              ))}
              {adjArray.fields.length > 0 && (
                <div className="flex justify-end border-t pt-2 text-sm font-medium tabular-nums">
                  Adjustments total: {formatMoney(adjTotal)}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => form.reset(defaults(type))}>
            Reset
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving..." : `Save ${type.toLowerCase()}`}
          </Button>
        </div>
      </form>

      <Card className="mt-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Recent {type.toLowerCase()} vouchers</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Voucher No</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Party</TableHead>
                  <TableHead>Bank</TableHead>
                  <TableHead>Module</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-16 text-center text-muted-foreground">
                      No vouchers yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  recentRows.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell>{v.voucherNo}</TableCell>
                      <TableCell>{formatDate(new Date(v.voucherDate))}</TableCell>
                      <TableCell>{v.partyName}</TableCell>
                      <TableCell>{v.bankName}</TableCell>
                      <TableCell>{v.moduleLink.replace(/_/g, " ")}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(v.amount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(v.netAmount)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </Tabs>
  );
}
