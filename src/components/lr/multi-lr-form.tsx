"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { formatDate, formatMoney } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/components/ui/use-toast";
import { LrForm, type LrFormProps } from "@/components/lr/lr-form";
import { saveLrBatch } from "@/app/(app)/lr/actions";

type Payload = Record<string, unknown>;

/**
 * Multiple LR entry: the complete LR Entry form runs in batch mode — every
 * "Add Another LR" captures a full LR payload and keeps all values for the
 * next entry (vehicle + date stay the same; edit only what differs). "Save
 * All LRs" writes the whole batch in one database transaction.
 */
export function MultiLrBatch(props: Omit<LrFormProps, "mode" | "isDummy">) {
  const router = useRouter();
  const { toast } = useToast();
  const [batch, setBatch] = React.useState<Payload[]>([]);
  const [saving, setSaving] = React.useState(false);

  const label = React.useCallback(
    (options: { value: string; label: string }[], v: unknown) =>
      options.find((o) => o.value === v)?.label ?? "",
    []
  );

  const onBatchAdd = (payload: Payload) => {
    setBatch((b) => [...b, payload]);
    toast({
      title: `LR ${payload.lrNo} added to the batch`,
      description: "All details carried over — change only what differs for the next LR.",
    });
  };

  const saveAll = async () => {
    if (batch.length === 0) {
      toast({
        variant: "destructive",
        title: "Batch is empty",
        description: 'Fill the form and click "Add Another LR" first.',
      });
      return;
    }
    setSaving(true);
    try {
      const res = await saveLrBatch({ entries: batch });
      if (res.ok) {
        toast({
          title: `${res.lrNos.length} LRs created in one transaction`,
          description: `LR Nos ${res.lrNos[0]} – ${res.lrNos[res.lrNos.length - 1]}`,
        });
        router.push("/lr/register");
      } else {
        toast({ variant: "destructive", title: "Save failed", description: res.error });
      }
    } finally {
      setSaving(false);
    }
  };

  const freightOf = (p: Payload) => Number(p.freight ?? 0);

  return (
    <div className="space-y-4">
      {/* batch tray */}
      <Card className="border-primary/40">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="flex items-center justify-between text-sm">
            <span>
              LRs in this batch <Badge variant="secondary">{batch.length}</Badge>
              <span className="ml-2 font-normal text-muted-foreground">
                — vehicle &amp; date stay the same for every LR; numbers are sequential
              </span>
            </span>
            <Button onClick={saveAll} disabled={saving || batch.length === 0}>
              {saving ? "Saving..." : `Save All LRs (${batch.length})`}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-1">
          {batch.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Fill the LR form below and click <b>Add Another LR</b> — each added LR appears
              here until you save the whole batch.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">LR No</TableHead>
                  <TableHead className="text-xs">Date</TableHead>
                  <TableHead className="text-xs">Consignor</TableHead>
                  <TableHead className="text-xs">Consignee</TableHead>
                  <TableHead className="text-xs">Route</TableHead>
                  <TableHead className="text-xs">Vehicle</TableHead>
                  <TableHead className="text-right text-xs">Freight</TableHead>
                  <TableHead className="text-xs">Type</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {batch.map((e, i) => (
                  <TableRow key={i}>
                    <TableCell>{String(e.lrNo)}</TableCell>
                    <TableCell>{formatDate(String(e.lrDate))}</TableCell>
                    <TableCell>{label(props.partyOptions, e.consignorId)}</TableCell>
                    <TableCell>{label(props.partyOptions, e.consigneeId)}</TableCell>
                    <TableCell>
                      {label(props.cityOptions, e.sourceCityId)} →{" "}
                      {label(props.cityOptions, e.destCityId)}
                    </TableCell>
                    <TableCell>{label(props.vehicleOptions, e.vehicleId)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(freightOf(e))}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{String(e.lrType).replace("_", " ")}</Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        title="Remove from batch"
                        onClick={() => setBatch((b) => b.filter((_, idx) => idx !== i))}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={6}>Total ({batch.length} LRs)</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(batch.reduce((s, e) => s + freightOf(e), 0))}
                  </TableCell>
                  <TableCell colSpan={2} />
                </TableRow>
              </TableFooter>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* the complete LR form, in batch mode */}
      <LrForm {...props} mode="create" isDummy={false} batchMode onBatchAdd={onBatchAdd} />
    </div>
  );
}
