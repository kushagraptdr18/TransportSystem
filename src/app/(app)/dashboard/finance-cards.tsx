"use client";

import * as React from "react";
import { IndianRupee } from "lucide-react";
import { formatMoney } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { InfoHint } from "@/components/ui/info-hint";
import { getFinanceCards, type FinanceCards } from "./actions";

/**
 * Income & Margin summary — its date filter refreshes ONLY these five cards;
 * the rest of the dashboard never re-renders from it.
 */
export function FinanceCardsSection({ defaultFrom, defaultTo }: { defaultFrom: string; defaultTo: string }) {
  const [from, setFrom] = React.useState(defaultFrom);
  const [to, setTo] = React.useState(defaultTo);
  const [data, setData] = React.useState<FinanceCards | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!from || !to) return;
    let alive = true;
    setLoading(true);
    getFinanceCards({ from, to }).then((res) => {
      if (!alive) return;
      setLoading(false);
      if (res.ok) {
        setData(res.data);
        setError(null);
      } else {
        setError(res.error);
      }
    });
    return () => {
      alive = false;
    };
  }, [from, to]);

  const money = (n: number) => (
    <span className={`text-xl font-bold tabular-nums ${n < 0 ? "text-red-600" : ""}`}>
      {n < 0 ? `-${formatMoney(Math.abs(n))}` : formatMoney(n)}
    </span>
  );

  const cards: { label: string; value: number; hint: React.ReactNode }[] = data
    ? [
        {
          label: "Booking Margin",
          value: data.booking.margin,
          hint: (
            <>
              LR Freight − Market Chalan − Own/Relative Chalan
              <br />
              {formatMoney(data.booking.lrFreight)} − {formatMoney(data.booking.marketFreight)} −{" "}
              {formatMoney(data.booking.ownFreight)}
              <br />
              (cancelled chalan excluded)
            </>
          ),
        },
        {
          label: "Broker Margin",
          value: data.broker.margin,
          hint: (
            <>
              Party Amount − Owner Amount (broker slips)
              <br />
              {formatMoney(data.broker.partyAmt)} − {formatMoney(data.broker.ownerAmt)}
            </>
          ),
        },
        {
          label: "Commission",
          value: data.commission,
          hint: "Commission ledger ka net balance is period me",
        },
        {
          label: "Mamul",
          value: data.mamool,
          hint: "Mamool ledger ka net balance is period me",
        },
      ]
    : [];

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-lg font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <IndianRupee className="h-4 w-4" />
            </span>
            Margin Summary
          </span>
          <span className="flex items-center gap-1.5 text-xs">
            <Input
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
              className="h-8 w-[140px] text-xs"
            />
            <span className="text-muted-foreground">se</span>
            <Input
              type="date"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
              className="h-8 w-[140px] text-xs"
            />
          </span>
        </div>

        {error ? (
          <p className="text-sm text-muted-foreground">{error}</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {(data ? cards : Array.from({ length: 4 }, () => null)).map((c, i) => (
              <div key={c?.label ?? i} className={`rounded-md border p-3 ${loading ? "opacity-60" : ""}`}>
                {c ? (
                  <>
                    <div className="flex items-center gap-1 text-[11px] font-medium uppercase text-muted-foreground">
                      {c.label}
                      <InfoHint>{c.hint}</InfoHint>
                    </div>
                    {money(c.value)}
                  </>
                ) : (
                  <div className="h-12 animate-pulse rounded bg-muted" />
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
