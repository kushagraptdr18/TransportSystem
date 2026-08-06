"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { formatMoney } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
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
import { useToast } from "@/components/ui/use-toast";
import { InfoHint } from "@/components/ui/info-hint";
import { deleteTdsSection, saveTdsSection } from "./actions";

interface SectionRow {
  id: string;
  code: string;
  oldCode: string | null;
  name: string;
  annualLimit: number;
  singleBillLimit: number;
  rateIndividual: number;
  rateCompany: number;
  basis: "FULL" | "EXCESS";
  headIds: string[];
  moduleRefs: ("CHALAN" | "BROKER_SLIP" | "HIRE")[];
}

const MODULES: { value: "CHALAN" | "BROKER_SLIP" | "HIRE"; label: string }[] = [
  { value: "CHALAN", label: "Challan (Owner)" },
  { value: "BROKER_SLIP", label: "Broker Slip (Owner)" },
  { value: "HIRE", label: "Hire Slip" },
];

interface HeadOpt {
  id: string;
  name: string;
}

const EMPTY = {
  id: null as string | null,
  code: "",
  oldCode: "",
  name: "",
  annualLimit: 0,
  singleBillLimit: 0,
  rateIndividual: 0,
  rateCompany: 0,
  basis: "FULL" as "FULL" | "EXCESS",
  headIds: [] as string[],
  moduleRefs: [] as ("CHALAN" | "BROKER_SLIP" | "HIRE")[],
};

export function TdsSectionsClient({
  sections,
  heads,
}: {
  sections: SectionRow[];
  heads: HeadOpt[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [form, setForm] = React.useState<typeof EMPTY | null>(null);
  const [headQ, setHeadQ] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const headName = new Map(heads.map((h) => [h.id, h.name]));
  const usedElsewhere = (headId: string) =>
    sections.find((s) => s.id !== form?.id && s.headIds.includes(headId))?.code;

  const openEdit = (s?: SectionRow) => {
    setHeadQ("");
    setForm(
      s
        ? {
            id: s.id,
            code: s.code,
            oldCode: s.oldCode ?? "",
            name: s.name,
            annualLimit: s.annualLimit,
            singleBillLimit: s.singleBillLimit,
            rateIndividual: s.rateIndividual,
            rateCompany: s.rateCompany,
            basis: s.basis,
            headIds: [...s.headIds],
            moduleRefs: [...s.moduleRefs],
          }
        : { ...EMPTY, headIds: [], moduleRefs: [] }
    );
  };

  const save = async () => {
    if (!form) return;
    setSaving(true);
    const res = await saveTdsSection({
      id: form.id,
      code: form.code,
      oldCode: form.oldCode || null,
      name: form.name,
      annualLimit: Number(form.annualLimit) || 0,
      singleBillLimit: Number(form.singleBillLimit) || 0,
      rateIndividual: Number(form.rateIndividual) || 0,
      rateCompany: Number(form.rateCompany) || 0,
      basis: form.basis,
      headIds: form.headIds,
      moduleRefs: form.moduleRefs,
    });
    setSaving(false);
    if (res.ok) {
      toast({ title: "Section saved" });
      setForm(null);
      router.refresh();
    } else {
      toast({ variant: "destructive", title: res.error });
    }
  };

  const remove = async (s: SectionRow) => {
    if (!window.confirm(`Delete section ${s.code}? The monitor stops tracking its heads.`)) return;
    const res = await deleteTdsSection(s.id);
    if (res.ok) {
      toast({ title: "Section deleted" });
      router.refresh();
    } else {
      toast({ variant: "destructive", title: res.error });
    }
  };

  const cell = "border px-2 py-1 text-xs";
  const filteredHeads = heads.filter((h) => h.name.toLowerCase().includes(headQ.toLowerCase()));

  return (
    <div className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="page-title flex items-center gap-2">
          TDS Master
          <InfoHint>
            Each section carries its threshold limits, rates (by PAN 4th letter:
            Individual/HUF vs Company/Firm) and the expense heads connected to it. A head can
            belong to only one section. Old section codes stay visible as hints while the new
            Income Tax Act numbering is adopted.
          </InfoHint>
        </h1>
        <Button size="sm" className="h-8" onClick={() => openEdit()}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Add Section
        </Button>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full border-collapse text-xs">
          <thead className="bg-muted/60">
            <tr>
              {["Section", "Name", "Annual Limit", "Single Bill", "Ind/HUF %", "Company %", "TDS On", "Connected Heads", ""].map(
                (h) => (
                  <th key={h} className={`${cell} whitespace-nowrap text-left font-semibold`}>
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {sections.map((s) => (
              <tr key={s.id} className="odd:bg-muted/20">
                <td className={`${cell} font-medium whitespace-nowrap`}>
                  {s.code}
                  {s.oldCode && <span className="ml-1 text-muted-foreground">(old: {s.oldCode})</span>}
                </td>
                <td className={cell}>{s.name}</td>
                <td className={`${cell} text-right tabular-nums`}>{formatMoney(s.annualLimit)}</td>
                <td className={`${cell} text-right tabular-nums`}>
                  {s.singleBillLimit > 0 ? formatMoney(s.singleBillLimit) : "—"}
                </td>
                <td className={`${cell} text-right tabular-nums`}>{s.rateIndividual}%</td>
                <td className={`${cell} text-right tabular-nums`}>{s.rateCompany}%</td>
                <td className={cell}>
                  <Badge variant={s.basis === "EXCESS" ? "secondary" : "outline"}>
                    {s.basis === "EXCESS" ? "Above limit only" : "Full amount"}
                  </Badge>
                </td>
                <td className={cell}>
                  {s.headIds.length === 0 && s.moduleRefs.length === 0 ? (
                    <span className="text-muted-foreground">none</span>
                  ) : (
                    <span className="flex flex-wrap gap-1">
                      {s.moduleRefs.map((m) => (
                        <Badge key={m} variant="secondary">
                          {MODULES.find((x) => x.value === m)?.label ?? m}
                        </Badge>
                      ))}
                      {s.headIds.map((h) => (
                        <Badge key={h} variant="outline">
                          {headName.get(h) ?? "?"}
                        </Badge>
                      ))}
                    </span>
                  )}
                </td>
                <td className={`${cell} whitespace-nowrap`}>
                  <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => openEdit(s)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-destructive"
                    onClick={() => remove(s)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </td>
              </tr>
            ))}
            {sections.length === 0 && (
              <tr>
                <td colSpan={9} className={`${cell} py-6 text-center text-muted-foreground`}>
                  No sections yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{form?.id ? "Edit Section" : "Add Section"}</DialogTitle>
          </DialogHeader>
          {form && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Section Code</Label>
                  <Input
                    className="h-8 text-xs"
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value })}
                    placeholder="e.g. 194Q or new code"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Old Code (hint)</Label>
                  <Input
                    className="h-8 text-xs"
                    value={form.oldCode}
                    onChange={(e) => setForm({ ...form, oldCode: e.target.value })}
                    placeholder="e.g. 194Q"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Name</Label>
                <Input
                  className="h-8 text-xs"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Purchase of Goods"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Annual Limit (₹)</Label>
                  <Input
                    className="h-8 text-xs"
                    type="number"
                    value={form.annualLimit || ""}
                    onChange={(e) => setForm({ ...form, annualLimit: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Single Bill Limit (₹, 0 = none)</Label>
                  <Input
                    className="h-8 text-xs"
                    type="number"
                    value={form.singleBillLimit || ""}
                    onChange={(e) => setForm({ ...form, singleBillLimit: Number(e.target.value) })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Individual / HUF % (PAN 4th letter P/H)</Label>
                  <Input
                    className="h-8 text-xs"
                    type="number"
                    step="0.01"
                    value={form.rateIndividual || ""}
                    onChange={(e) => setForm({ ...form, rateIndividual: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Company / Firm %</Label>
                  <Input
                    className="h-8 text-xs"
                    type="number"
                    step="0.01"
                    value={form.rateCompany || ""}
                    onChange={(e) => setForm({ ...form, rateCompany: Number(e.target.value) })}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">TDS Applies On</Label>
                <select
                  className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                  value={form.basis}
                  onChange={(e) => setForm({ ...form, basis: e.target.value as "FULL" | "EXCESS" })}
                >
                  <option value="EXCESS">Only the amount ABOVE the annual limit (194Q style)</option>
                  <option value="FULL">The FULL year&apos;s amount once crossed (194C style)</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">
                  Freight Modules (labels chalan / slip TDS in the TDS Payable report only — the
                  monitor never reads these)
                </Label>
                <div className="flex flex-wrap gap-3 rounded-md border p-2">
                  {MODULES.map((m) => {
                    const other = sections.find(
                      (s) => s.id !== form.id && s.moduleRefs.includes(m.value)
                    )?.code;
                    return (
                      <label
                        key={m.value}
                        className={`flex items-center gap-1.5 text-xs ${other ? "opacity-50" : "cursor-pointer"}`}
                      >
                        <input
                          type="checkbox"
                          disabled={!!other}
                          checked={form.moduleRefs.includes(m.value)}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              moduleRefs: e.target.checked
                                ? [...form.moduleRefs, m.value]
                                : form.moduleRefs.filter((x) => x !== m.value),
                            })
                          }
                        />
                        {m.label}
                        {other && <span className="text-muted-foreground">(in {other})</span>}
                      </label>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">
                  Connected Expense Heads ({form.headIds.length} selected)
                </Label>
                <Input
                  className="h-8 text-xs"
                  placeholder="Search heads..."
                  value={headQ}
                  onChange={(e) => setHeadQ(e.target.value)}
                />
                <div className="max-h-48 space-y-0.5 overflow-y-auto rounded-md border p-2">
                  {filteredHeads.map((h) => {
                    const other = usedElsewhere(h.id);
                    const checked = form.headIds.includes(h.id);
                    return (
                      <label
                        key={h.id}
                        className={`flex items-center gap-2 text-xs ${other ? "opacity-50" : "cursor-pointer"}`}
                      >
                        <input
                          type="checkbox"
                          disabled={!!other}
                          checked={checked}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              headIds: e.target.checked
                                ? [...form.headIds, h.id]
                                : form.headIds.filter((x) => x !== h.id),
                            })
                          }
                        />
                        {h.name}
                        {other && <span className="text-muted-foreground">(in {other})</span>}
                      </label>
                    );
                  })}
                  {filteredHeads.length === 0 && (
                    <p className="text-xs text-muted-foreground">No heads match.</p>
                  )}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving..." : "Save Section"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
