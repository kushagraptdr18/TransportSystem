"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeftRight,
  BookOpen,
  Download,
  Trash2,
  Upload,
  Wand2,
} from "lucide-react";
import { formatDate, formatMoney, parseDdMmYyyy } from "@/lib/utils";
import { round2 } from "@/lib/calc/tds";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/components/ui/use-toast";
import { PageHeader } from "@/components/app/page-header";
import { TabNav } from "@/components/app/tab-nav";
import { DateInput } from "@/components/data/date-input";
import { MasterCombobox, type MasterOption } from "@/components/data/master-combobox";
import {
  deleteVoucher,
  getAllocationCandidates,
  getPartyAdvanceInfo,
  saveVoucher,
  type AllocationCandidate,
} from "@/app/(app)/accounts/vouchers/actions";

/**
 * Voucher Entry — rebuilt from scratch.
 * Contract with the server: header `amount` is the GROSS settled value
 * (money moved + TDS + deductions); the bank/cash leg posts the net (money
 * actually moved). Unallocated money automatically becomes a party advance.
 */

export type VType = "RECEIPT" | "PAYMENT" | "JOURNAL" | "CONTRA";

export interface RecentVoucher {
  id: string;
  voucherNo: string;
  voucherDate: string;
  partyName: string | null;
  bankName: string | null;
  moduleLink: string;
  amount: number;
  netAmount: number;
  /** present when this voucher created a party advance */
  advance: {
    amount: number;
    consumed: number;
    balance: number;
    uses: { refNo: string; amount: number; date: string }[];
  } | null;
}

interface SettleRow extends AllocationCandidate {
  selected: boolean;
  tds: number;
  shortage: number;
  other: number;
  /** may be negative — a little extra paid rather than knocked off */
  roundOff: number;
  receive: number;
  remarks: string;
}

function toIso(text: string): string {
  const d = parseDdMmYyyy(text);
  if (!d) return "";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

const TYPE_META: Record<VType, { title: string; hint: string; icon: React.ReactNode }> = {
  RECEIPT: {
    title: "Receipt",
    hint: "Money IN — from any ledger (party, broker, owner, driver, staff...)",
    icon: <Download className="h-4 w-4" />,
  },
  PAYMENT: {
    title: "Payment",
    hint: "Money OUT — to any ledger (owner, supplier, broker, driver, staff...)",
    icon: <Upload className="h-4 w-4" />,
  },
  JOURNAL: {
    title: "Journal",
    hint: "Ledger ↔ ledger — debit/credit notes, transfers, write-offs (no cash/bank)",
    icon: <BookOpen className="h-4 w-4" />,
  },
  CONTRA: {
    title: "Contra",
    hint: "Bank ↔ Cash / Bank ↔ Bank internal transfer",
    icon: <ArrowLeftRight className="h-4 w-4" />,
  },
};

export function VoucherEntry({
  peekNumbers,
  partyOptions,
  bankOptions,
  vehicleOptions,
  recent,
}: {
  peekNumbers: Record<VType, string>;
  partyOptions: MasterOption[];
  bankOptions: MasterOption[];
  vehicleOptions: MasterOption[];
  recent: Record<VType, RecentVoucher[]>;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [type, setType] = React.useState<VType>("RECEIPT");
  const [saving, setSaving] = React.useState(false);
  const [loadingRefs, setLoadingRefs] = React.useState(false);

  // ---- header state ----
  const [voucherNo, setVoucherNo] = React.useState(peekNumbers.RECEIPT ?? "1");
  const [dateText, setDateText] = React.useState(formatDate(new Date()));
  const [mode, setMode] = React.useState<"CASH" | "BANK">("CASH");
  const [bankPartyId, setBankPartyId] = React.useState<string | null>(null);
  // Bank & Cash master, narrowed to the selected mode (meta = ledger group)
  const modeAccounts = React.useMemo(
    () => bankOptions.filter((b) => b.meta === mode),
    [bankOptions, mode]
  );
  const [chequeNo, setChequeNo] = React.useState("");
  const [chequeDateText, setChequeDateText] = React.useState("");
  const [partyId, setPartyId] = React.useState<string | null>(null);
  const [vehicleId, setVehicleId] = React.useState<string | null>(null);
  const [money, setMoney] = React.useState(0); // money actually moved
  const [remarks, setRemarks] = React.useState("");
  // journal / contra specifics
  const [creditLedgerId, setCreditLedgerId] = React.useState<string | null>(null);
  const [refNo, setRefNo] = React.useState("");

  const [rows, setRows] = React.useState<SettleRow[]>([]);
  const [advInfo, setAdvInfo] = React.useState<{ received: number; paid: number } | null>(null);

  const resetAll = React.useCallback(
    (t: VType) => {
      setVoucherNo(peekNumbers[t] ?? "1");
      setDateText(formatDate(new Date()));
      setMode("CASH");
      setBankPartyId(null);
      setChequeNo("");
      setChequeDateText("");
      setPartyId(null);
      setVehicleId(null);
      setMoney(0);
      setRemarks("");
      setCreditLedgerId(null);
      setRefNo("");
      setRows([]);
      setAdvInfo(null);
    },
    [peekNumbers]
  );

  const pickType = (t: VType) => {
    setType(t);
    resetAll(t);
  };

  // ---- pending references for the settlement grid ----
  const loadRefs = React.useCallback(
    async (pid: string | null) => {
      if (!pid || (type !== "RECEIPT" && type !== "PAYMENT")) {
        setRows([]);
        return;
      }
      setLoadingRefs(true);
      try {
        const candidates = await getAllocationCandidates({ moduleLink: "ALL", partyId: pid });
        setRows(
          candidates.map((c) => ({
            ...c,
            selected: false,
            tds: 0,
            shortage: 0,
            other: 0,
            roundOff: 0,
            receive: 0,
            remarks: "",
          }))
        );
      } catch {
        toast({ variant: "destructive", title: "Failed to load pending references" });
      } finally {
        setLoadingRefs(false);
      }
    },
    [type, toast]
  );

  const onParty = (pid: string | null) => {
    setPartyId(pid);
    void loadRefs(pid);
    if (pid) getPartyAdvanceInfo(pid).then(setAdvInfo).catch(() => setAdvInfo(null));
    else setAdvInfo(null);
  };

  const setRow = (i: number, patch: Partial<SettleRow>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  // ---- live totals ----
  const selected = rows.filter((r) => r.selected);
  const tdsTotal = round2(selected.reduce((s, r) => s + r.tds, 0));
  // round-off settles the reference exactly like a deduction, so the party is
  // still settled gross and the ledger stays balanced
  const dedTotal = round2(selected.reduce((s, r) => s + r.shortage + r.other + r.roundOff, 0));
  const roundOffTotal = round2(selected.reduce((s, r) => s + r.roundOff, 0));
  const allocated = round2(selected.reduce((s, r) => s + r.receive, 0));
  const advanceRemainder = round2(money - allocated);
  const gross = round2(money + tdsTotal + dedTotal);

  const rowError = (r: SettleRow): string | null => {
    if (!r.selected) return null;
    const settle = round2(r.receive + r.tds + r.shortage + r.other + r.roundOff);
    if (settle > r.outstanding + 0.01)
      return `settles ${formatMoney(settle)} > outstanding ${formatMoney(r.outstanding)}`;
    if (r.receive < 0 || r.tds < 0 || r.shortage < 0 || r.other < 0) return "negative value";
    return null;
  };
  const hasRowErrors = selected.some((r) => rowError(r) !== null);
  const overAllocated = allocated > money + 0.01;

  const autoAllocate = () => {
    let remaining = money;
    setRows((prev) =>
      prev.map((r) => {
        const avail = Math.max(
          0,
          round2(r.outstanding - r.tds - r.shortage - r.other - r.roundOff)
        );
        const pay = round2(Math.min(avail, Math.max(0, remaining)));
        remaining = round2(remaining - pay);
        return pay > 0 || r.selected ? { ...r, selected: pay > 0 || r.selected, receive: pay } : r;
      })
    );
  };

  // ---- save ----
  const save = async () => {
    if (!toIso(dateText)) return toast({ variant: "destructive", title: "Valid date required" });
    setSaving(true);
    try {
      const isMoney = type === "RECEIPT" || type === "PAYMENT";
      const res = await saveVoucher({
        type,
        voucherNo,
        voucherDate: toIso(dateText),
        entryType: type === "CONTRA" ? "CONTRA" : mode,
        moduleLink: "OTHERS",
        partyId: type === "CONTRA" ? partyId : partyId, // contra: FROM account
        vehicleId,
        accountHeadId: null,
        ledgerPosting: "PARTY",
        bankPartyId: type === "JOURNAL" ? creditLedgerId ?? "" : bankPartyId ?? "",
        chequeNo: chequeNo || null,
        chequeDate: chequeDateText ? toIso(chequeDateText) : null,
        // gross = money moved + TDS + deductions (party settles gross)
        amount: isMoney ? gross : money,
        tdsAmt: isMoney ? tdsTotal : 0,
        deduction: isMoney ? dedTotal : 0,
        otherAmt: 0,
        remarks:
          type === "JOURNAL" && refNo ? `Ref: ${refNo}${remarks ? " — " + remarks : ""}` : remarks || null,
        adjustments: [],
        allocations: isMoney
          ? selected
              .filter((r) => Math.abs(r.receive + r.tds + r.shortage + r.other + r.roundOff) > 0)
              .map((r) => ({
                refId: r.refId,
                refNo: r.refNo,
                refType: r.module as never,
                billAmt: r.billAmt,
                tdsPct: r.tdsPct,
                tdsAmt: r.tds,
                // kept apart so the source document can show shortage and
                // other deduction as the distinct figures they are
                deduction: r.shortage,
                otherAmt: r.other,
                roundOff: r.roundOff,
                amount: r.receive,
                remarks: r.remarks || null,
              }))
          : [],
      });
      if (res.ok) {
        toast({
          title: `${TYPE_META[type].title} voucher ${voucherNo} saved`,
          description:
            advanceRemainder > 0.009 && (type === "RECEIPT" || type === "PAYMENT")
              ? `${formatMoney(advanceRemainder)} stored as party advance (${type === "RECEIPT" ? "received" : "paid"}).`
              : "Ledgers, outstanding, TDS and advance registers updated.",
        });
        resetAll(type);
        router.refresh();
      } else toast({ variant: "destructive", title: "Save failed", description: res.error });
    } finally {
      setSaving(false);
    }
  };

  const isMoneyType = type === "RECEIPT" || type === "PAYMENT";
  const canSave =
    !saving &&
    money > 0 &&
    (type === "CONTRA"
      ? !!partyId && !!bankPartyId && partyId !== bankPartyId
      : type === "JOURNAL"
        ? !!partyId && !!creditLedgerId && partyId !== creditLedgerId
        : !!partyId && !!bankPartyId && !hasRowErrors && !overAllocated);

  return (
    <div className="space-y-4">
      {/* ---------- type selector ----------
          client-state tabs, not links: switching type swaps a live form, and a
          URL change would remount it and lose whatever was typed */}
      <PageHeader title="Voucher Entry" subtitle={TYPE_META[type].hint} />
      <TabNav
        tabs={(Object.keys(TYPE_META) as VType[]).map((t) => ({
          value: t,
          label: `${TYPE_META[t].title} Voucher`,
          icon: TYPE_META[t].icon,
        }))}
        active={type}
        onSelect={(v) => pickType(v as VType)}
      />

      {/* ---------- header ---------- */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{TYPE_META[type].title} Voucher Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-4">
          <div className="space-y-1">
            <Label className="text-xs">Voucher No (auto)</Label>
            <Input className="h-9" value={voucherNo} onChange={(e) => setVoucherNo(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Voucher Date *</Label>
            <DateInput className="h-9" value={dateText} onChange={setDateText} />
          </div>

          {isMoneyType && (
            <>
              <div className="space-y-1">
                <Label className="text-xs">Party / Ledger *</Label>
                <MasterCombobox
                  options={partyOptions}
                  value={partyId}
                  onChange={onParty}
                  placeholder="Any ledger — party, broker, owner, driver, staff..."
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Vehicle (when applicable)</Label>
                <MasterCombobox
                  options={vehicleOptions}
                  value={vehicleId}
                  onChange={setVehicleId}
                  placeholder="Optional..."
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Mode</Label>
                <Select value={mode} onValueChange={(v) => { setMode(v as "CASH" | "BANK"); setBankPartyId(null); }}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CASH">Cash</SelectItem>
                    <SelectItem value="BANK">Bank</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{mode === "CASH" ? "Cash Account *" : "Bank Account *"}</Label>
                <MasterCombobox
                  options={modeAccounts}
                  value={bankPartyId}
                  onChange={setBankPartyId}
                  placeholder={
                    modeAccounts.length
                      ? `Select ${mode === "CASH" ? "cash" : "bank"} account...`
                      : `No ${mode === "CASH" ? "cash" : "bank"} head in master`
                  }
                />
              </div>
              {mode === "BANK" && (
                <>
                  <div className="space-y-1">
                    <Label className="text-xs">Cheque / UTR No</Label>
                    <Input className="h-9" value={chequeNo} onChange={(e) => setChequeNo(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Instrument Date</Label>
                    <DateInput className="h-9" value={chequeDateText} onChange={setChequeDateText} />
                  </div>
                </>
              )}
              <div className="space-y-1">
                <Label className="text-xs">
                  Amount {type === "RECEIPT" ? "Received" : "Paid"} (Bank/Cash) *
                </Label>
                <Input
                  type="number"
                  className="h-9 text-right font-semibold"
                  value={money ? String(money) : ""}
                  onChange={(e) => setMoney(Number(e.target.value) || 0)}
                />
              </div>
            </>
          )}

          {type === "JOURNAL" && (
            <>
              <div className="space-y-1">
                <Label className="text-xs">Debit Ledger * (owes more / receives value)</Label>
                <MasterCombobox
                  options={partyOptions}
                  value={partyId}
                  onChange={setPartyId}
                  placeholder="e.g. party for a DEBIT note..."
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Credit Ledger * (balance reduces / gives value)</Label>
                <MasterCombobox
                  options={[...partyOptions, ...bankOptions]}
                  value={creditLedgerId}
                  onChange={setCreditLedgerId}
                  placeholder="e.g. party for a CREDIT note..."
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Amount *</Label>
                <Input
                  type="number"
                  className="h-9 text-right font-semibold"
                  value={money ? String(money) : ""}
                  onChange={(e) => setMoney(Number(e.target.value) || 0)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Reference No</Label>
                <Input className="h-9" value={refNo} onChange={(e) => setRefNo(e.target.value)} />
              </div>
            </>
          )}

          {type === "CONTRA" && (
            <>
              <div className="space-y-1">
                <Label className="text-xs">From Bank/Cash *</Label>
                <MasterCombobox
                  options={bankOptions}
                  value={partyId}
                  onChange={setPartyId}
                  placeholder="Source account..."
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">To Bank/Cash *</Label>
                <MasterCombobox
                  options={bankOptions}
                  value={bankPartyId}
                  onChange={setBankPartyId}
                  placeholder="Destination account..."
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Amount *</Label>
                <Input
                  type="number"
                  className="h-9 text-right font-semibold"
                  value={money ? String(money) : ""}
                  onChange={(e) => setMoney(Number(e.target.value) || 0)}
                />
              </div>
            </>
          )}

          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs">Narration / Remarks</Label>
            <Input className="h-9" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {type === "JOURNAL" && (
        <p className="rounded-md border bg-muted/40 p-2 text-xs text-muted-foreground">
          No cash or bank moves in a journal. <b>Debit</b> the ledger that should owe more or
          receives the value (debit note on a party, expense moved TO a head). <b>Credit</b> the
          ledger whose balance reduces (credit note to a party, write-off, amount moved FROM).
        </p>
      )}

      {/* ---------- settlement grid ---------- */}
      {isMoneyType && partyId && (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base">
              Settle Pending References{" "}
              {loadingRefs && <span className="text-xs font-normal">loading...</span>}
              {advInfo && (advInfo.received > 0 || advInfo.paid > 0) && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {advInfo.received > 0 && `Adv received open: ${formatMoney(advInfo.received)}`}
                  {advInfo.received > 0 && advInfo.paid > 0 && " · "}
                  {advInfo.paid > 0 && `Adv paid open: ${formatMoney(advInfo.paid)}`}
                </span>
              )}
            </CardTitle>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={autoAllocate} disabled={money <= 0}>
                <Wand2 className="h-3.5 w-3.5" /> Auto Allocate
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  setRows((prev) =>
                    prev.map((r) => ({ ...r, selected: false, receive: 0, tds: 0, shortage: 0, other: 0 }))
                  )
                }
              >
                Clear
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>Ref No</TableHead>
                    <TableHead>Module</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Bill Amt</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                    <TableHead className="w-24 text-right">TDS</TableHead>
                    <TableHead className="w-24 text-right">Shortage</TableHead>
                    <TableHead className="w-24 text-right">Other Ded.</TableHead>
                    <TableHead className="w-24 text-right">Round Off</TableHead>
                    <TableHead className="w-28 text-right">
                      {type === "RECEIPT" ? "Receive" : "Pay"}
                    </TableHead>
                    <TableHead className="w-40">Remarks</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={12} className="h-16 text-center text-muted-foreground">
                        No pending references — the full amount will be saved as a party{" "}
                        {type === "RECEIPT" ? "advance (received)" : "advance (paid)"}.
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((r, i) => {
                      const err = rowError(r);
                      return (
                        <TableRow key={`${r.module}:${r.refId}`} className={err ? "bg-destructive/5" : undefined}>
                          <TableCell>
                            <Checkbox
                              checked={r.selected}
                              onCheckedChange={(c) =>
                                setRow(i, {
                                  selected: !!c,
                                  ...(c
                                    ? {}
                                    : { receive: 0, tds: 0, shortage: 0, other: 0, roundOff: 0 }),
                                })
                              }
                            />
                          </TableCell>
                          <TableCell className="font-medium">{r.refNo}</TableCell>
                          <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                            {r.module.replace(/_/g, " ")}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-xs">{formatDate(r.date)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatMoney(r.billAmt)}</TableCell>
                          <TableCell className="text-right font-medium tabular-nums">
                            {formatMoney(r.outstanding)}
                          </TableCell>
                          {(
                            [
                              ["tds", r.tds],
                              ["shortage", r.shortage],
                              ["other", r.other],
                              ["roundOff", r.roundOff],
                              ["receive", r.receive],
                            ] as const
                          ).map(([key, val]) => (
                            <TableCell key={key}>
                              <Input
                                type="number"
                                disabled={!r.selected}
                                className="h-8 text-right"
                                value={val ? String(val) : ""}
                                placeholder="0"
                                onChange={(e) => setRow(i, { [key]: Number(e.target.value) || 0 })}
                              />
                            </TableCell>
                          ))}
                          <TableCell>
                            <Input
                              disabled={!r.selected}
                              className="h-8"
                              placeholder="e.g. shortage against old invoice"
                              value={r.remarks}
                              onChange={(e) => setRow(i, { remarks: e.target.value })}
                            />
                            {err && <div className="mt-0.5 text-[11px] text-destructive">{err}</div>}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            {/* live totals */}
            <div className="mt-3 grid gap-2 text-sm sm:grid-cols-6">
              {(
                [
                  [`${type === "RECEIPT" ? "Received" : "Paid"} (Bank/Cash)`, money, ""],
                  ["Allocated to references", allocated, overAllocated ? "text-destructive" : ""],
                  ["TDS", tdsTotal, ""],
                  ["Shortage + Other Ded.", round2(dedTotal - roundOffTotal), ""],
                  ["Round Off", roundOffTotal, ""],
                  [
                    advanceRemainder > 0.009
                      ? `→ Party Advance (${type === "RECEIPT" ? "received" : "paid"})`
                      : "Gross Settled",
                    advanceRemainder > 0.009 ? advanceRemainder : gross,
                    advanceRemainder > 0.009 ? "text-primary" : "",
                  ],
                ] as [string, number, string][]
              ).map(([l, v, cls]) => (
                <div key={l} className="rounded-md border p-2">
                  <div className="text-[11px] text-muted-foreground">{l}</div>
                  <div className={`font-semibold tabular-nums ${cls}`}>{formatMoney(v)}</div>
                </div>
              ))}
            </div>
            {overAllocated && (
              <p className="mt-1 text-xs font-medium text-destructive">
                Allocated exceeds the amount {type === "RECEIPT" ? "received" : "paid"} — reduce
                the allocation or increase the amount.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => resetAll(type)} disabled={saving}>
          Reset
        </Button>
        <Button onClick={save} disabled={!canSave}>
          {saving ? "Saving..." : `Save ${TYPE_META[type].title} Voucher`}
        </Button>
      </div>

      {/* ---------- recent ---------- */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Recent {TYPE_META[type].title} Vouchers</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Voucher No</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Party</TableHead>
                  <TableHead>Bank / Cash</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                  <TableHead>Advance Adjusted</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent[type].length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-14 text-center text-muted-foreground">
                      No vouchers yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  recent[type].map((v) => (
                    <TableRow key={v.id}>
                      <TableCell className="font-medium">{v.voucherNo}</TableCell>
                      <TableCell>{formatDate(v.voucherDate)}</TableCell>
                      <TableCell>{v.partyName ?? ""}</TableCell>
                      <TableCell>{v.bankName ?? ""}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(v.amount)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(v.netAmount)}</TableCell>
                      {/* adjustment history: every document this voucher's
                          advance was consumed by, with the running balance */}
                      <TableCell className="text-xs">
                        {!v.advance ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <div className="space-y-0.5">
                            {v.advance.uses.length === 0 ? (
                              <span className="text-muted-foreground">Unused advance</span>
                            ) : (
                              v.advance.uses.map((u, i) => (
                                <div key={i} className="tabular-nums">
                                  {u.refNo} — {formatMoney(u.amount)}
                                </div>
                              ))
                            )}
                            <div className="text-muted-foreground tabular-nums">
                              Adjusted {formatMoney(v.advance.consumed)} · Balance{" "}
                              {formatMoney(v.advance.balance)}
                            </div>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          title="Delete voucher (reverses ledger + advances)"
                          onClick={async () => {
                            if (!confirm(`Delete voucher ${v.voucherNo}? Ledger entries will be reversed.`))
                              return;
                            const res = await deleteVoucher(v.id);
                            if (res.ok) {
                              toast({ title: `${v.voucherNo} deleted` });
                              router.refresh();
                            } else
                              toast({ variant: "destructive", title: "Delete failed", description: res.error });
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
