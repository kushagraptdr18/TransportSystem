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
  type AllocationCandidate,
} from "@/app/(app)/accounts/vouchers/actions";

const MODULE_LINKS = [
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
  peekNumbers: Record<"RECEIPT" | "PAYMENT" | "CONTRA", string>;
  partyOptions: MasterOption[];
  bankOptions: MasterOption[];
  vehicleOptions: MasterOption[];
  accountHeadOptions: MasterOption[];
  recent: Record<"RECEIPT" | "PAYMENT" | "CONTRA", RecentVoucher[]>;
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
  const [type, setType] = React.useState<"RECEIPT" | "PAYMENT" | "CONTRA">("RECEIPT");
  const [saving, setSaving] = React.useState(false);
  const [loadingAllocs, setLoadingAllocs] = React.useState(false);

  const defaults = React.useCallback(
    (t: "RECEIPT" | "PAYMENT" | "CONTRA"): FormValues => ({
      voucherNo: peekNumbers[t] ?? "1",
      voucherDate: formatDate(new Date()),
      entryType: t === "CONTRA" ? "CONTRA" : "CASH",
      moduleLink: "OTHERS",
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
    }),
    [peekNumbers]
  );

  const form = useForm<FormValues>({
    // z.coerce makes the schema input type `unknown`; the form always holds numbers
    resolver: zodResolver(formSchema) as unknown as Resolver<FormValues>,
    defaultValues: defaults("RECEIPT"),
  });
  const { fields, replace, update } = useFieldArray({ control: form.control, name: "allocations" });

  const watched = form.watch();
  const netAmount = round2(
    (watched.amount || 0) - (watched.tdsAmt || 0) - (watched.deduction || 0) + (watched.otherAmt || 0)
  );
  const allocTotal = round2(
    (watched.allocations ?? []).reduce((s, a) => s + (Number(a.amount) || 0), 0)
  );
  const allocMismatch =
    (watched.allocations?.length ?? 0) > 0 && Math.abs(allocTotal - (watched.amount || 0)) > 0.01;

  const switchTab = (t: string) => {
    const vt = t as "RECEIPT" | "PAYMENT" | "CONTRA";
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
        moduleLink: moduleLink as (typeof MODULE_LINKS)[number],
        partyId,
      });
      replace(
        candidates.map((c) => ({
          refId: c.refId,
          refNo: c.refNo,
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
        moduleLink: values.moduleLink,
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
        allocations: values.allocations
          .filter((a) => (Number(a.amount) || 0) > 0)
          .map((a) => ({
            refId: a.refId,
            refNo: a.refNo,
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
  const recentRows = recent[type] ?? [];

  return (
    <Tabs value={type} onValueChange={switchTab}>
      <TabsList>
        <TabsTrigger value="RECEIPT">Receipt</TabsTrigger>
        <TabsTrigger value="PAYMENT">Payment</TabsTrigger>
        <TabsTrigger value="CONTRA">Contra</TabsTrigger>
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
              <Label>{isContra ? "From Bank/Cash" : "Party"}</Label>
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
              <Label>{isContra ? "To Bank/Cash" : "Bank / Cash A/c"}</Label>
              <Controller
                control={form.control}
                name="bankPartyId"
                render={({ field }) => (
                  <MasterCombobox
                    options={bankOptions}
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

        {!isContra && ALLOCATABLE.includes(watched.moduleLink) && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                Allocation {loadingAllocs && <span className="text-xs font-normal">loading...</span>}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ref No</TableHead>
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
                        <TableCell colSpan={8} className="h-16 text-center text-muted-foreground">
                          No open documents.
                        </TableCell>
                      </TableRow>
                    ) : (
                      fields.map((f, i) => (
                        <TableRow key={f.id}>
                          <TableCell>{f.refNo}</TableCell>
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
