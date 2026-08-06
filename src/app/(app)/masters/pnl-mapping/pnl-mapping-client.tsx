"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { InfoHint } from "@/components/ui/info-hint";
import { setPnlScope, type PnlScope } from "./actions";

interface HeadRow {
  id: string;
  name: string;
  kind: string;
  pnlScope: PnlScope;
}

const SCOPE_OPTIONS: { value: PnlScope; label: string }[] = [
  { value: "AUTO", label: "Auto (module-wise)" },
  { value: "COMPANY", label: "Company P&L" },
  { value: "VEHICLE", label: "Vehicle P&L" },
  { value: "EXCLUDE", label: "Exclude from both" },
];

export function PnlMappingClient({ heads }: { heads: HeadRow[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [q, setQ] = React.useState("");
  const [kind, setKind] = React.useState<"ALL" | "INCOME" | "EXPENSE">("ALL");
  const [local, setLocal] = React.useState<Record<string, PnlScope>>({});
  const [savingId, setSavingId] = React.useState<string | null>(null);

  const scopeOf = (h: HeadRow) => local[h.id] ?? h.pnlScope;

  const change = async (h: HeadRow, scope: PnlScope) => {
    setLocal((p) => ({ ...p, [h.id]: scope }));
    setSavingId(h.id);
    const res = await setPnlScope(h.id, scope);
    setSavingId(null);
    if (res.ok) {
      toast({ title: `${h.name} → ${SCOPE_OPTIONS.find((s) => s.value === scope)?.label}` });
      router.refresh();
    } else {
      setLocal((p) => ({ ...p, [h.id]: h.pnlScope }));
      toast({ variant: "destructive", title: res.error });
    }
  };

  const list = heads.filter((h) => {
    if (kind !== "ALL" && h.kind !== kind) return false;
    if (q && !h.name.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  const mappedCount = heads.filter((h) => scopeOf(h) !== "AUTO").length;
  const cell = "border px-2 py-1 text-xs";

  return (
    <div className="space-y-3 p-4">
      <h1 className="page-title flex items-center gap-2">
        P&amp;L Head Mapping
        <InfoHint>
          Decide which operational P&amp;L each ledger head reports in. Auto (default) keeps
          today&apos;s behaviour — the posting module decides. Company / Vehicle moves ALL of the
          head&apos;s entries to that P&amp;L; Exclude drops it from both. An entry is never
          counted in both reports. Changes save instantly.
        </InfoHint>
      </h1>

      <div className="flex flex-wrap items-center gap-2 rounded-md border p-2">
        <Input
          className="h-8 w-[220px] text-xs"
          placeholder="Search head..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          value={kind}
          onChange={(e) => setKind(e.target.value as typeof kind)}
        >
          <option value="ALL">All Kinds</option>
          <option value="INCOME">Income</option>
          <option value="EXPENSE">Expense</option>
        </select>
        <span className="ml-auto text-xs text-muted-foreground">
          {mappedCount} of {heads.length} heads mapped manually
        </span>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full border-collapse text-xs">
          <thead className="bg-muted/60">
            <tr>
              {["Head", "Kind", "P&L Scope"].map((h) => (
                <th key={h} className={`${cell} whitespace-nowrap text-left font-semibold`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.map((h) => (
              <tr key={h.id} className="odd:bg-muted/20">
                <td className={`${cell} font-medium`}>{h.name}</td>
                <td className={cell}>
                  <Badge variant={h.kind === "INCOME" ? "default" : "secondary"}>{h.kind}</Badge>
                </td>
                <td className={cell}>
                  <select
                    className={`h-8 w-full max-w-[240px] rounded-md border border-input bg-background px-2 text-xs ${
                      scopeOf(h) !== "AUTO" ? "font-semibold" : ""
                    }`}
                    value={scopeOf(h)}
                    disabled={savingId === h.id}
                    onChange={(e) => change(h, e.target.value as PnlScope)}
                  >
                    {SCOPE_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr>
                <td colSpan={3} className={`${cell} py-6 text-center text-muted-foreground`}>
                  No heads match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
