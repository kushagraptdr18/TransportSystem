"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Trash2, Wand2 } from "lucide-react";
import { TYPE_META, type VType } from "./voucher-types";
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
import { DateInput } from "@/components/data/date-input";
import { MasterCombobox, type MasterOption } from "@/components/data/master-combobox";
import {
  deleteVoucher,
  getAllocationCandidates,
  getOpenAdvances,
  getOpenCancelAdvances,
  getPartyAdvanceInfo,
  saveVoucher,
  type AllocationCandidate,
  type OpenCancelAdvance,
} from "@/app/(app)/accounts/vouchers/actions";
import type { OpenAdvance } from "@/lib/party-advance";

/**
 * Voucher Entry — rebuilt from scratch.
 * Contract with the server: header `amount` is the GROSS settled value
 * (money moved + TDS + deductions); the bank/cash leg posts the net (money
 * actually moved). Unallocated money automatically becomes a party advance.
 */

export type { VType };

/** marks a journal ledger option as an account head rather than a party */
const HEAD_PREFIX = "head:";

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

export function VoucherEntry({
  peekNumbers,
  partyOptions,
  bankOptions,
  headOptions,
  vehicleOptions,
  recent,
  type,
}: {
  peekNumbers: Record<VType, string>;
  partyOptions: MasterOption[];
  bankOptions: MasterOption[];
  /** income / expense ledger heads — journal may debit or credit any of them */
  headOptions: MasterOption[];
  vehicleOptions: MasterOption[];
  recent: Record<VType, RecentVoucher[]>;
  /** the voucher type being entered — the page owns the tabs */
  type: VType;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [saving, setSaving] = React.useState(false);
  const [loadingRefs, setLoadingRefs] = React.useState(false);

  // ---- header state ----
  const [voucherNo, setVoucherNo] = React.useState(peekNumbers[type] ?? "1");
  const [dateText, setDateText] = React.useState(formatDate(new Date()));
  const [mode, setMode] = React.useState<"CASH" | "BANK" | "CARD">("CASH");
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

  // A journal adjusts ANY two ledgers, so both dropdowns offer every master
  // ledger (party / customer / supplier / broker / owner / driver / staff),
  // every bank and cash account and every income / expense head. Heads are
  // tagged so the id can be told apart from a party id on save.
  const journalLedgers = React.useMemo(
    () => [
      ...partyOptions,
      ...bankOptions,
      ...headOptions.map((h) => ({ ...h, value: `${HEAD_PREFIX}${h.value}` })),
    ],
    [partyOptions, bankOptions, headOptions]
  );
  const isHead = (v: string | null) => !!v && v.startsWith(HEAD_PREFIX);
  const headId = (v: string | null) => (isHead(v) ? v!.slice(HEAD_PREFIX.length) : null);
  const partyIdOf = (v: string | null) => (isHead(v) ? null : v);
  const isBankAccount = React.useCallback(
    (v: string | null) => !!v && bankOptions.some((b) => b.value === v),
    [bankOptions]
  );

  // A journal against a real party (not a bank/cash account or a head) can
  // settle that party's pending references, exactly like a receipt/payment:
  // party on the CREDIT side reduces receivables (write-off / credit note),
  // party on the DEBIT side reduces payables (debit note). When both sides
  // are parties the target is ambiguous, so the grid stays hidden.
  const jDebitParty =
    type === "JOURNAL" && !isBankAccount(partyIdOf(partyId)) ? partyIdOf(partyId) : null;
  const jCreditParty =
    type === "JOURNAL" && !isBankAccount(partyIdOf(creditLedgerId))
      ? partyIdOf(creditLedgerId)
      : null;
  const journalRefParty = jCreditParty && !jDebitParty ? jCreditParty : jDebitParty && !jCreditParty ? jDebitParty : null;
  const journalRefDir: "RECEIPT" | "PAYMENT" | null =
    jCreditParty && !jDebitParty ? "RECEIPT" : jDebitParty && !jCreditParty ? "PAYMENT" : null;

  const [rows, setRows] = React.useState<SettleRow[]>([]);
  const [advInfo, setAdvInfo] = React.useState<{ received: number; paid: number } | null>(null);
  // open advances of the selected party, same direction as the voucher type —
  // each may be adjusted (fully or partly) against the pending references
  const [advRows, setAdvRows] = React.useState<(OpenAdvance & { use: number })[]>([]);
  // open chalan-cancel advances of the target party: recovered on a receipt,
  // written off (bad debt) on a journal whose credit side is that party
  const [cancelRows, setCancelRows] = React.useState<(OpenCancelAdvance & { use: number })[]>([]);

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
      setAdvRows([]);
      setCancelRows([]);
    },
    [peekNumbers]
  );


  // ---- pending references for the settlement grid ----
  const loadRefs = React.useCallback(
    async (pid: string | null) => {
      if (!pid || (type !== "RECEIPT" && type !== "PAYMENT")) {
        setRows([]);
        return;
      }
      setLoadingRefs(true);
      try {
        const candidates = await getAllocationCandidates({
          moduleLink: "ALL",
          partyId: pid,
          voucherType: type,
        });
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

  // journal grid: reload pending references whenever the party side changes
  React.useEffect(() => {
    if (type !== "JOURNAL") return;
    if (!journalRefParty || !journalRefDir) {
      setRows([]);
      return;
    }
    let cancelled = false;
    setLoadingRefs(true);
    getAllocationCandidates({
      moduleLink: "ALL",
      partyId: journalRefParty,
      voucherType: journalRefDir,
    })
      .then((candidates) => {
        if (cancelled) return;
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
      })
      .catch(() => {
        if (!cancelled) toast({ variant: "destructive", title: "Failed to load pending references" });
      })
      .finally(() => {
        if (!cancelled) setLoadingRefs(false);
      });
    return () => {
      cancelled = true;
    };
  }, [type, journalRefParty, journalRefDir, toast]);

  const onParty = (pid: string | null) => {
    setPartyId(pid);
    void loadRefs(pid);
    setAdvRows([]);
    setCancelRows([]);
    if (pid) {
      getPartyAdvanceInfo(pid).then(setAdvInfo).catch(() => setAdvInfo(null));
      if (type === "RECEIPT" || type === "PAYMENT")
        getOpenAdvances({ partyId: pid, type })
          .then((list) => setAdvRows(list.map((a) => ({ ...a, use: 0 }))))
          .catch(() => setAdvRows([]));
      if (type === "RECEIPT")
        getOpenCancelAdvances(pid)
          .then((list) => setCancelRows(list.map((a) => ({ ...a, use: 0 }))))
          .catch(() => setCancelRows([]));
    } else setAdvInfo(null);
  };

  // journal write-off: cancel advances of the CREDIT-side party
  React.useEffect(() => {
    if (type !== "JOURNAL") return;
    const pid = jCreditParty;
    if (!pid) {
      setCancelRows([]);
      return;
    }
    let alive = true;
    getOpenCancelAdvances(pid)
      .then((list) => {
        if (alive) setCancelRows(list.map((a) => ({ ...a, use: 0 })));
      })
      .catch(() => {
        if (alive) setCancelRows([]);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, jCreditParty]);

  const setAdvRow = (i: number, use: number) =>
    setAdvRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, use } : r)));

  const setCancelRow = (i: number, use: number) =>
    setCancelRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, use } : r)));
  const cancelUseTotal = round2(cancelRows.reduce((s, r) => s + r.use, 0));
  const cancelRowError = (r: OpenCancelAdvance & { use: number }): string | null => {
    if (r.use < 0) return "negative value";
    if (r.use > r.available + 0.01) return `exceeds balance ${formatMoney(r.available)}`;
    return null;
  };
  const hasCancelErrors = cancelRows.some((r) => cancelRowError(r) !== null);

  const setRow = (i: number, patch: Partial<SettleRow>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  // ---- live totals ----
  const selected = rows.filter((r) => r.selected);
  const tdsTotal = round2(selected.reduce((s, r) => s + r.tds, 0));
  // round-off is NOT part of the header deduction or the gross amount: the
  // server posts it on its own (party leg + Round Off head) from the
  // allocation rows, so carrying it here too would settle the party twice
  // and misfile it under the Shortage ledger
  const dedTotal = round2(selected.reduce((s, r) => s + r.shortage + r.other, 0));
  const roundOffTotal = round2(selected.reduce((s, r) => s + r.roundOff, 0));
  const allocated = round2(selected.reduce((s, r) => s + r.receive, 0));
  // previously received/paid advances adjusted against today's references —
  // they fund allocations alongside the money actually moved
  const advUsed = round2(advRows.reduce((s, r) => s + r.use, 0));
  const funds = round2(money + advUsed);
  const advanceRemainder = round2(funds - allocated);
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
  const overAllocated = allocated > funds + 0.01;
  const advRowError = (r: OpenAdvance & { use: number }): string | null => {
    if (r.use < 0) return "negative value";
    if (r.use > r.available + 0.01)
      return `exceeds balance ${formatMoney(r.available)}`;
    return null;
  };
  const hasAdvErrors = advRows.some((r) => advRowError(r) !== null);
  // an adjusted advance exists to settle references — it cannot become new money
  const advUnderApplied = advUsed > allocated + 0.01;

  // distributes ONLY across the rows the user ticked, oldest first —
  // an unticked reference is never touched
  const autoAllocate = () => {
    if (!rows.some((r) => r.selected)) {
      toast({
        variant: "destructive",
        title: "Select references first — Auto Allocate fills only the ticked rows",
      });
      return;
    }
    let remaining = funds;
    setRows((prev) =>
      prev.map((r) => {
        if (!r.selected) return r;
        const avail = Math.max(
          0,
          round2(r.outstanding - r.tds - r.shortage - r.other - r.roundOff)
        );
        const pay = round2(Math.min(avail, Math.max(0, remaining)));
        remaining = round2(remaining - pay);
        return { ...r, receive: pay };
      })
    );
  };

  const allSelected = rows.length > 0 && rows.every((r) => r.selected);
  const toggleSelectAll = (checked: boolean) =>
    setRows((prev) =>
      prev.map((r) => ({
        ...r,
        selected: checked,
        ...(checked ? {} : { receive: 0, tds: 0, shortage: 0, other: 0, roundOff: 0 }),
      }))
    );

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
        // journal: either side may be a party/bank/cash ledger or a head
        partyId: type === "JOURNAL" ? partyIdOf(partyId) : partyId, // contra: FROM account
        vehicleId,
        accountHeadId: type === "JOURNAL" ? headId(partyId) : null,
        ledgerPosting: "PARTY",
        bankPartyId: type === "JOURNAL" ? partyIdOf(creditLedgerId) : bankPartyId ?? null,
        creditHeadId: type === "JOURNAL" ? headId(creditLedgerId) : null,
        chequeNo: chequeNo || null,
        chequeDate: chequeDateText ? toIso(chequeDateText) : null,
        // gross = money moved + TDS + deductions, WITHOUT round-off — the
        // server settles the party for the round-off through its own pair of
        // ledger legs derived from the allocation rows
        amount: isMoney ? gross : money,
        tdsAmt: isMoney ? tdsTotal : 0,
        deduction: isMoney ? dedTotal : 0,
        otherAmt: 0,
        remarks:
          type === "JOURNAL" && refNo ? `Ref: ${refNo}${remarks ? " — " + remarks : ""}` : remarks || null,
        adjustments: [],
        advanceAdjustments: isMoney
          ? advRows
              .filter((r) => r.use > 0)
              .map((r) => ({ advanceId: r.id, amount: r.use }))
          : [],
        cancelAdvanceUses:
          type === "RECEIPT" || type === "JOURNAL"
            ? cancelRows
                .filter((r) => r.use > 0)
                .map((r) => ({ advanceId: r.id, amount: r.use }))
            : [],
        allocations: isMoney || type === "JOURNAL"
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
          description: [
            advUsed > 0.009 && isMoney
              ? `${formatMoney(advUsed)} adjusted from open advances.`
              : null,
            advanceRemainder > 0.009 && isMoney
              ? `${formatMoney(advanceRemainder)} stored as party advance (${type === "RECEIPT" ? "received" : "paid"}).`
              : null,
          ]
            .filter(Boolean)
            .join(" ") || "Ledgers, outstanding, TDS and advance registers updated.",
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
    (type === "CONTRA"
      ? money > 0 && !!partyId && !!bankPartyId && partyId !== bankPartyId
      : type === "JOURNAL"
        ? money > 0 &&
          !!partyId &&
          !!creditLedgerId &&
          partyId !== creditLedgerId &&
          !hasRowErrors &&
          !overAllocated &&
          !hasCancelErrors
        : // a receipt/payment may move no money at all when it purely adjusts
          // an open advance against pending references
          (money > 0 || advUsed > 0) &&
          !!partyId &&
          !!bankPartyId &&
          !hasRowErrors &&
          !hasAdvErrors &&
          !hasCancelErrors &&
          !overAllocated &&
          !advUnderApplied);

  return (
    <div className="space-y-4">

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
                <Select value={mode} onValueChange={(v) => { setMode(v as "CASH" | "BANK" | "CARD"); setBankPartyId(null); }}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CASH">Cash</SelectItem>
                    <SelectItem value="BANK">Bank</SelectItem>
                    <SelectItem value="CARD">Card</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">
                  {mode === "CASH" ? "Cash Account *" : mode === "CARD" ? "Card Account *" : "Bank Account *"}
                </Label>
                <MasterCombobox
                  options={modeAccounts}
                  value={bankPartyId}
                  onChange={setBankPartyId}
                  placeholder={
                    modeAccounts.length
                      ? `Select ${mode.toLowerCase()} account...`
                      : `No ${mode.toLowerCase()} head in master`
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
                  options={journalLedgers}
                  value={partyId}
                  onChange={setPartyId}
                  placeholder="party, bank, cash or income/expense head..."
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Credit Ledger * (balance reduces / gives value)</Label>
                <MasterCombobox
                  options={journalLedgers}
                  value={creditLedgerId}
                  onChange={setCreditLedgerId}
                  placeholder="party, bank, cash or income/expense head..."
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
          When one side is a party, their pending references appear below — adjust them so the
          Outstanding Register settles along with the ledger (e.g. Bad Debts Dr / party Cr
          against the unpaid bill).
        </p>
      )}

      {/* ---------- advance adjustment ---------- */}
      {isMoneyType && partyId && advRows.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Adjust Advance {type === "RECEIPT" ? "(Received)" : "(Paid)"}
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                open advance vouchers of this party — enter the amount to adjust
                against the pending references below
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Advance Voucher</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Original Amount</TableHead>
                    <TableHead className="text-right">Already Adjusted</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead className="w-32 text-right">Amount to Adjust</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {advRows.map((r, i) => {
                    const err = advRowError(r);
                    return (
                      <TableRow key={r.id} className={err ? "bg-destructive/5" : undefined}>
                        <TableCell className="font-medium">{r.voucherNo}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{formatDate(r.date)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMoney(r.amount)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMoney(r.consumed)}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {formatMoney(r.available)}
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            className="h-8 text-right"
                            value={r.use ? String(r.use) : ""}
                            placeholder="0"
                            onChange={(e) => setAdvRow(i, Number(e.target.value) || 0)}
                          />
                          {err && <div className="mt-0.5 text-[11px] text-destructive">{err}</div>}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            {advUnderApplied && (
              <p className="mt-2 text-xs font-medium text-destructive">
                Advance adjusted ({formatMoney(advUsed)}) exceeds the amount allocated to
                references ({formatMoney(allocated)}) — allocate the adjusted amount against
                pending references below.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ---------- chalan-cancel advance recovery / write-off ---------- */}
      {((type === "RECEIPT" && partyId) || (type === "JOURNAL" && jCreditParty)) &&
        cancelRows.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {type === "RECEIPT" ? "Recover Cancel Advances" : "Write Off Cancel Advances"}
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {type === "RECEIPT"
                    ? "open advances from cancelled chalans — the amount received closes them"
                    : "debit Bad Debts and allocate here — the advance closes as written off"}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cancelled Chalan</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead className="text-right">Advance</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                      <TableHead className="w-32 text-right">
                        {type === "RECEIPT" ? "Recover" : "Write Off"}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cancelRows.map((r, i) => {
                      const err = cancelRowError(r);
                      return (
                        <TableRow key={r.id} className={err ? "bg-destructive/5" : undefined}>
                          <TableCell className="font-medium">{r.chalanNo || "—"}</TableCell>
                          <TableCell className="whitespace-nowrap text-xs">
                            {formatDate(r.date)}
                          </TableCell>
                          <TableCell className="max-w-[16rem] text-xs text-muted-foreground">
                            {r.remarks ?? ""}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatMoney(r.amount)}
                          </TableCell>
                          <TableCell className="text-right font-medium tabular-nums">
                            {formatMoney(r.available)}
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              className="h-8 text-right"
                              value={r.use ? String(r.use) : ""}
                              placeholder="0"
                              onChange={(e) => setCancelRow(i, Number(e.target.value) || 0)}
                            />
                            {err && (
                              <div className="mt-0.5 text-[11px] text-destructive">{err}</div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              {cancelUseTotal > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {type === "RECEIPT"
                    ? `${formatMoney(cancelUseTotal)} of the money received will close these advances (it will not become a new advance).`
                    : `${formatMoney(cancelUseTotal)} will be marked written off against this journal.`}
                </p>
              )}
            </CardContent>
          </Card>
        )}

      {/* ---------- settlement grid ---------- */}
      {((isMoneyType && partyId) || (type === "JOURNAL" && journalRefParty)) && (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base">
              {type === "JOURNAL" ? "Adjust Pending References (optional)" : "Settle Pending References"}{" "}
              {loadingRefs && <span className="text-xs font-normal">loading...</span>}
              {advInfo && (type === "RECEIPT" ? advInfo.received : advInfo.paid) > 0 && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {type === "RECEIPT"
                    ? `Adv received open: ${formatMoney(advInfo.received)}`
                    : `Adv paid open: ${formatMoney(advInfo.paid)}`}
                </span>
              )}
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              {rows.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {selected.length} of {rows.length} selected
                </span>
              )}
              <Button type="button" variant="outline" size="sm" onClick={autoAllocate} disabled={funds <= 0}>
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
                    <TableHead className="w-8">
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={(c) => toggleSelectAll(!!c)}
                        aria-label="Select all references"
                      />
                    </TableHead>
                    <TableHead>Ref No</TableHead>
                    <TableHead>Module</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Bill Amt</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                    {isMoneyType && (
                      <>
                        <TableHead className="w-24 text-right">TDS</TableHead>
                        <TableHead className="w-24 text-right">Shortage</TableHead>
                        <TableHead className="w-24 text-right">Other Ded.</TableHead>
                        <TableHead className="w-24 text-right">Round Off</TableHead>
                      </>
                    )}
                    <TableHead className="w-28 text-right">
                      {type === "RECEIPT" ? "Receive" : type === "PAYMENT" ? "Pay" : "Adjust"}
                    </TableHead>
                    <TableHead className="w-40">Remarks</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={12} className="h-16 text-center text-muted-foreground">
                        {type === "JOURNAL"
                          ? "No pending references for this party — the journal will only adjust the two ledgers."
                          : `No pending references — the full amount will be saved as a party advance (${
                              type === "RECEIPT" ? "received" : "paid"
                            }).`}
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
                            (isMoneyType
                              ? [
                                  ["tds", r.tds],
                                  ["shortage", r.shortage],
                                  ["other", r.other],
                                  ["roundOff", r.roundOff],
                                  ["receive", r.receive],
                                ]
                              : [["receive", r.receive]]) as [
                              "tds" | "shortage" | "other" | "roundOff" | "receive",
                              number,
                            ][]
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
            {type === "JOURNAL" && (
              <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                {(
                  [
                    ["Journal Amount", money, ""],
                    ["Adjusted to references", allocated, overAllocated ? "text-destructive" : ""],
                    ["Unadjusted (ledger only)", round2(money - allocated), ""],
                  ] as [string, number, string][]
                ).map(([l, v, cls]) => (
                  <div key={l} className="rounded-md border p-2">
                    <div className="text-[11px] text-muted-foreground">{l}</div>
                    <div className={`font-semibold tabular-nums ${cls}`}>{formatMoney(v)}</div>
                  </div>
                ))}
              </div>
            )}
            {isMoneyType && (
            <div className="mt-3 grid gap-2 text-sm sm:grid-cols-6">
              {(
                [
                  [`${type === "RECEIPT" ? "Received" : "Paid"} (Bank/Cash)`, money, ""],
                  ["Advance Adjusted", advUsed, advUsed > 0.009 ? "text-primary" : ""],
                  ["Allocated to references", allocated, overAllocated ? "text-destructive" : ""],
                  ["TDS", tdsTotal, ""],
                  ["Shortage + Other Ded.", dedTotal, ""],
                  ["Round Off", roundOffTotal, ""],
                  [
                    advanceRemainder > 0.009
                      ? `→ Party Advance (${type === "RECEIPT" ? "received" : "paid"})`
                      : "Gross Settled",
                    advanceRemainder > 0.009 ? advanceRemainder : round2(gross + roundOffTotal),
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
            )}
            {overAllocated && (
              <p className="mt-1 text-xs font-medium text-destructive">
                Allocated exceeds the {type === "JOURNAL" ? "journal amount" : `amount ${type === "RECEIPT" ? "received" : "paid"}`}
                {advUsed > 0.009 ? " plus the advance adjusted" : ""} — reduce the allocation
                or increase the amount.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap justify-end gap-2">
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
