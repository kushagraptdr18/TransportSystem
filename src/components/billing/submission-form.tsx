"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { formatDate, parseDdMmYyyy } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { DateInput } from "@/components/data/date-input";
import { MasterCombobox, type MasterOption } from "@/components/data/master-combobox";
import { saveBillSubmission, searchInvoicesByNo } from "@/app/(app)/billing/actions";

function textToIso(text: string): string {
  const d = parseDdMmYyyy(text);
  if (!d) return "";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function BillSubmissionForm({ partyOptions }: { partyOptions: MasterOption[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [saving, setSaving] = React.useState(false);

  const [billNo, setBillNo] = React.useState("");
  const [invoiceId, setInvoiceId] = React.useState<string | null>(null);
  const [billDateText, setBillDateText] = React.useState(formatDate(new Date()));
  const [partyId, setPartyId] = React.useState<string | null>(null);
  const [receivedBy, setReceivedBy] = React.useState("");
  const [deptName, setDeptName] = React.useState("");
  const [submittedBy, setSubmittedBy] = React.useState("");
  const [docketNo, setDocketNo] = React.useState("");
  const [counterName, setCounterName] = React.useState("");
  const [remarks, setRemarks] = React.useState("");
  const [searching, setSearching] = React.useState(false);

  const lookupInvoice = async () => {
    if (!billNo.trim()) return;
    setSearching(true);
    try {
      const results = await searchInvoicesByNo(billNo.trim());
      const exact =
        results.find((r) => r.invoiceNo.toLowerCase() === billNo.trim().toLowerCase()) ??
        results[0];
      if (exact) {
        setInvoiceId(exact.id);
        setBillNo(exact.invoiceNo);
        setPartyId(exact.partyId);
        toast({
          title: `Linked invoice ${exact.invoiceNo}`,
          description: `${exact.partyName} — ${formatDate(exact.invoiceDate)}`,
        });
      } else {
        setInvoiceId(null);
        toast({ title: "No matching invoice; submission will be saved unlinked" });
      }
    } finally {
      setSearching(false);
    }
  };

  const handleSave = async () => {
    const billDateIso = textToIso(billDateText);
    if (!billNo.trim()) {
      toast({ variant: "destructive", title: "Bill number is required" });
      return;
    }
    if (!billDateIso) {
      toast({ variant: "destructive", title: "Valid bill date is required" });
      return;
    }
    setSaving(true);
    try {
      const res = await saveBillSubmission({
        invoiceId,
        billNo: billNo.trim(),
        billDate: billDateIso,
        partyId,
        receivedBy,
        deptName,
        submittedBy,
        docketNo,
        counterName,
        remarks,
      });
      if (res.ok) {
        toast({ title: `Bill submission ${billNo} saved` });
        setBillNo("");
        setInvoiceId(null);
        setReceivedBy("");
        setDeptName("");
        setSubmittedBy("");
        setDocketNo("");
        setCounterName("");
        setRemarks("");
        router.refresh();
      } else {
        toast({ variant: "destructive", title: "Save failed", description: res.error });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Record Bill Submission</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="space-y-1">
          <Label className="text-xs">Bill / Invoice No *</Label>
          <div className="flex gap-1">
            <Input
              className="h-8"
              value={billNo}
              onChange={(e) => {
                setBillNo(e.target.value);
                setInvoiceId(null);
              }}
              onBlur={lookupInvoice}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8"
              onClick={lookupInvoice}
              disabled={searching}
            >
              {searching ? "..." : "Find"}
            </Button>
          </div>
          {invoiceId && <p className="text-xs text-muted-foreground">Linked to invoice ✓</p>}
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Submission Date *</Label>
          <DateInput className="h-8" value={billDateText} onChange={setBillDateText} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Party</Label>
          <MasterCombobox
            options={partyOptions}
            value={partyId}
            onChange={setPartyId}
            placeholder="Select party..."
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Received By</Label>
          <Input className="h-8" value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Department</Label>
          <Input className="h-8" value={deptName} onChange={(e) => setDeptName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Submitted By</Label>
          <Input className="h-8" value={submittedBy} onChange={(e) => setSubmittedBy(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Docket / Courier No</Label>
          <Input className="h-8" value={docketNo} onChange={(e) => setDocketNo(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Counter Name</Label>
          <Input className="h-8" value={counterName} onChange={(e) => setCounterName(e.target.value)} />
        </div>
        <div className="space-y-1 md:col-span-2">
          <Label className="text-xs">Remarks</Label>
          <Input className="h-8" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
        </div>
        <div className="col-span-2 flex items-end justify-end md:col-span-4">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Submission"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
