"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Trash2 } from "lucide-react";
import { formatDate, formatMoney, parseDdMmYyyy } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { DataTable, type DataTableColumnMeta } from "@/components/data/data-table";
import { DateInput } from "@/components/data/date-input";
import { ExportButton } from "@/components/data/export-button";
import { MasterCombobox, type MasterOption } from "@/components/data/master-combobox";
import {
  deleteBrokerSlip,
  saveBrokerBalancePayment,
  setBrokerSlipPodAttached,
} from "@/app/(app)/broker/actions";

export interface BrokerRegisterRow {
  id: string;
  slipNo: string;
  slipDate: string;
  vehicle: string;
  transporter: string;
  owner: string;
  loadStation: string;
  destination: string;
  qty: number;
  actualWt: number;
  pFreight: number;
  pBalance: number;
  vFreight: number;
  vNetAmt: number;
  vAdvance: number;
  vBalance: number;
  /** informational only — POD handed over / shared */
  podAttached: boolean;
  pPaymentStatus: string; // PENDING | RECEIVED
  pPaidAmount: number;
  vPaymentStatus: string; // PENDING | PAID
  vPaidAmount: number;
}

const money = (
  key: keyof Pick<BrokerRegisterRow, "pFreight" | "pBalance" | "vFreight" | "vBalance">,
  header: string
): ColumnDef<BrokerRegisterRow> => ({
  accessorKey: key,
  header,
  cell: ({ row }) => formatMoney(row.original[key]),
  meta: {
    numeric: true,
    total: (rows) => formatMoney(rows.reduce((s, r) => s + r[key], 0)),
  } satisfies DataTableColumnMeta<BrokerRegisterRow>,
});

interface PayState {
  row: BrokerRegisterRow;
  /** P = broker side (balance received), V = owner side (balance paid) */
  side: "P" | "V";
}

export function BrokerRegisterTable({
  data,
  canDelete,
  bankOptions,
}: {
  data: BrokerRegisterRow[];
  canDelete: boolean;
  bankOptions: MasterOption[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [toDelete, setToDelete] = React.useState<BrokerRegisterRow | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  // balance received / paid dialog
  const [pay, setPay] = React.useState<PayState | null>(null);
  const [payRoundOff, setPayRoundOff] = React.useState(0);
  const [payShortage, setPayShortage] = React.useState(0);
  const [payDateText, setPayDateText] = React.useState(formatDate(new Date()));
  const [payHeadId, setPayHeadId] = React.useState<string | null>(null);
  const [payMode, setPayMode] = React.useState("BANK");
  const [payRemarks, setPayRemarks] = React.useState("");
  const [paySaving, setPaySaving] = React.useState(false);

  const openPay = (row: BrokerRegisterRow, side: "P" | "V") => {
    setPay({ row, side });
    setPayRoundOff(0);
    setPayShortage(0);
    setPayDateText(formatDate(new Date()));
    setPayHeadId(null);
    setPayMode("BANK");
    setPayRemarks("");
  };

  const payBalance = pay ? (pay.side === "P" ? pay.row.pBalance : pay.row.vBalance) : 0;
  const payPreview = Math.round((payBalance - payRoundOff - payShortage) * 100) / 100;

  const submitPay = async () => {
    if (!pay) return;
    const d = parseDdMmYyyy(payDateText);
    if (!d) {
      toast({ variant: "destructive", title: "Valid payment date is required" });
      return;
    }
    if (!payHeadId) {
      toast({ variant: "destructive", title: "Select the bank/cash payment head" });
      return;
    }
    setPaySaving(true);
    try {
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      const res = await saveBrokerBalancePayment({
        slipId: pay.row.id,
        side: pay.side,
        roundOff: payRoundOff,
        shortage: payShortage,
        paymentDate: `${d.getFullYear()}-${mm}-${dd}`,
        paymentHeadId: payHeadId,
        paymentMode: payMode as "CASH" | "BANK" | "UPI" | "CHEQUE" | "NEFT_RTGS",
        remarks: payRemarks,
      });
      if (res.ok) {
        toast({
          title:
            pay.side === "P"
              ? `Balance received — ${formatMoney(res.paidAmount)}`
              : `Balance paid — ${formatMoney(res.paidAmount)}`,
          description: "Posted to the bank/cash book and party ledger.",
        });
        setPay(null);
        router.refresh();
      } else {
        toast({ variant: "destructive", title: "Payment failed", description: res.error });
      }
    } finally {
      setPaySaving(false);
    }
  };

  const togglePod = async (row: BrokerRegisterRow, attached: boolean) => {
    const res = await setBrokerSlipPodAttached(row.id, attached);
    if (res.ok) {
      toast({
        title: attached
          ? `POD marked attached for slip ${row.slipNo}`
          : `POD attached flag cleared for slip ${row.slipNo}`,
        description: "Record-keeping only — no effect on payments or billing.",
      });
      router.refresh();
    } else {
      toast({ variant: "destructive", title: "Update failed", description: res.error });
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      const res = await deleteBrokerSlip(toDelete.id);
      if (res.ok) {
        toast({ title: `Broker slip ${toDelete.slipNo} deleted` });
        setToDelete(null);
        router.refresh();
      } else {
        toast({ variant: "destructive", title: "Delete failed", description: res.error });
      }
    } finally {
      setDeleting(false);
    }
  };

  const columns: ColumnDef<BrokerRegisterRow>[] = [
    { accessorKey: "slipNo", header: "Slip No" },
    {
      accessorKey: "slipDate",
      header: "Slip Date",
      cell: ({ row }) => formatDate(row.original.slipDate),
    },
    { accessorKey: "vehicle", header: "Vehicle No" },
    { accessorKey: "transporter", header: "Transporter / Broker" },
    { accessorKey: "owner", header: "Owner" },
    { accessorKey: "loadStation", header: "From" },
    { accessorKey: "destination", header: "To" },
    {
      accessorKey: "qty",
      header: "Qty",
      cell: ({ row }) => row.original.qty.toLocaleString("en-IN", { maximumFractionDigits: 3 }),
      meta: {
        numeric: true,
        total: (rows) =>
          rows.reduce((s, r) => s + r.qty, 0).toLocaleString("en-IN", { maximumFractionDigits: 3 }),
      } satisfies DataTableColumnMeta<BrokerRegisterRow>,
    },
    money("pFreight", "Broker Freight"),
    money("pBalance", "Broker Balance"),
    {
      accessorKey: "pPaymentStatus",
      header: "Broker Balance Status",
      cell: ({ row }) => (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {row.original.pPaymentStatus === "RECEIVED" ? (
            <Badge>Received {formatMoney(row.original.pPaidAmount)}</Badge>
          ) : (
            <>
              <Badge variant="destructive">Pending</Badge>
              <Button
                variant="secondary"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => openPay(row.original, "P")}
              >
                Receive
              </Button>
            </>
          )}
        </div>
      ),
    },
    money("vFreight", "Owner Freight"),
    money("vBalance", "Owner Balance"),
    {
      accessorKey: "vPaymentStatus",
      header: "Owner Balance Status",
      cell: ({ row }) => (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {row.original.vPaymentStatus === "PAID" ? (
            <Badge>Paid {formatMoney(row.original.vPaidAmount)}</Badge>
          ) : (
            <>
              <Badge variant="destructive">Pending</Badge>
              <Button
                variant="secondary"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => openPay(row.original, "V")}
              >
                Pay
              </Button>
            </>
          )}
        </div>
      ),
    },
    {
      accessorKey: "podAttached",
      header: "POD Attached",
      cell: ({ row }) => (
        <div
          className="flex items-center gap-1.5"
          onClick={(e) => e.stopPropagation()}
          title="Record-keeping only — POD handed over / shared. No effect on payments."
        >
          <Switch
            checked={row.original.podAttached}
            onCheckedChange={(c) => void togglePod(row.original, c)}
          />
          <span className="text-xs text-muted-foreground">
            {row.original.podAttached ? "Yes" : "No"}
          </span>
        </div>
      ),
    },
    ...(canDelete
      ? [
          {
            id: "actions",
            header: "",
            cell: ({ row }) => (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  setToDelete(row.original);
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            ),
          } satisfies ColumnDef<BrokerRegisterRow>,
        ]
      : []),
  ];

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <ExportButton
          rows={data}
          fileName="broker-register"
          sheetName="Broker Register"
          columns={[
            { header: "Slip No", key: "slipNo" },
            { header: "Slip Date", accessor: (r) => formatDate(r.slipDate) },
            { header: "Vehicle No", key: "vehicle" },
            { header: "Transporter / Broker", key: "transporter" },
            { header: "Owner", key: "owner" },
            { header: "From", key: "loadStation" },
            { header: "To", key: "destination" },
            { header: "Qty", key: "qty", numeric: true },
            { header: "Broker Freight", key: "pFreight", numeric: true },
            { header: "Broker Balance", key: "pBalance", numeric: true },
            {
              header: "Broker Balance Status",
              accessor: (r) => (r.pPaymentStatus === "RECEIVED" ? "RECEIVED" : "PENDING"),
            },
            { header: "Owner Freight", key: "vFreight", numeric: true },
            { header: "Owner Net", key: "vNetAmt", numeric: true },
            { header: "Advance", key: "vAdvance", numeric: true },
            { header: "Owner Balance", key: "vBalance", numeric: true },
            {
              header: "Owner Balance Status",
              accessor: (r) => (r.vPaymentStatus === "PAID" ? "PAID" : "PENDING"),
            },
            { header: "POD Attached", accessor: (r) => (r.podAttached ? "YES" : "NO") },
          ]}
        />
      </div>
      <DataTable
        columns={columns}
        data={data}
        emptyMessage="No broker slips found."
        onRowClick={(row) => router.push(`/broker/slip?id=${row.id}`)}
      />

      {/* balance received / paid — same behaviour as the chalan balance payment,
          but with NO dependency on POD status or the POD-attached flag */}
      <Dialog open={!!pay} onOpenChange={(o) => !o && setPay(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {pay?.side === "P"
                ? `Balance Received — slip ${pay?.row.slipNo} (${pay?.row.transporter || "broker"})`
                : `Balance Paid — slip ${pay?.row.slipNo} (${pay?.row.owner || "owner"})`}
            </DialogTitle>
            <DialogDescription>
              Posts to the bank/cash book and the party ledger, exactly like the chalan balance
              payment. POD status does not matter here.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Balance Amount</Label>
              <Input className="h-8 text-right tabular-nums" value={formatMoney(payBalance)} readOnly />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Round Off (−)</Label>
              <Input
                type="number"
                step="any"
                className="h-8 text-right tabular-nums"
                value={payRoundOff}
                onChange={(e) => setPayRoundOff(Number(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Shortage (−)</Label>
              <Input
                type="number"
                step="any"
                className="h-8 text-right tabular-nums"
                value={payShortage}
                onChange={(e) => setPayShortage(Number(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{pay?.side === "P" ? "Final Received Amount" : "Final Paid Amount"}</Label>
              <Input className="h-8 text-right tabular-nums" value={formatMoney(payPreview)} readOnly />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Payment Date</Label>
              <DateInput className="h-8" value={payDateText} onChange={setPayDateText} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Payment Head (Bank / Cash)</Label>
              <MasterCombobox
                options={bankOptions}
                value={payHeadId}
                onChange={setPayHeadId}
                placeholder="Select head..."
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Payment Mode</Label>
              <select
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                value={payMode}
                onChange={(e) => setPayMode(e.target.value)}
              >
                <option value="BANK">Bank Transfer</option>
                <option value="CASH">Cash</option>
                <option value="UPI">UPI</option>
                <option value="CHEQUE">Cheque</option>
                <option value="NEFT_RTGS">NEFT / RTGS</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Remarks</Label>
              <Input className="h-8" value={payRemarks} onChange={(e) => setPayRemarks(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPay(null)} disabled={paySaving}>
              Cancel
            </Button>
            <Button onClick={submitPay} disabled={paySaving}>
              {paySaving
                ? "Saving..."
                : pay?.side === "P"
                  ? "Save Balance Received"
                  : "Save Balance Paid"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete broker slip {toDelete?.slipNo}?</DialogTitle>
            <DialogDescription>
              The slip will be soft-deleted and removed from registers. This cannot be undone here.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setToDelete(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
