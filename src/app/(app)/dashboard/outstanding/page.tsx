import { getOutstandingAgeing, type OutSide } from "../outstanding-actions";
import { OutstandingClient } from "./outstanding-client";

export const dynamic = "force-dynamic";

/** Dashboard drill-down: party-wise receivable/payable ageing. */
export default async function OutstandingPage({
  searchParams,
}: {
  searchParams: { side?: string; fy?: string; asof?: string };
}) {
  const side: OutSide = searchParams.side === "PAY" ? "PAY" : "RECV";
  const asOf = searchParams.asof && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.asof) ? searchParams.asof : null;
  const res = await getOutstandingAgeing({ side, fyId: searchParams.fy || null, asOf });
  return (
    <OutstandingClient
      side={side}
      data={res.ok ? res.data : { rows: [], totals: { b0: 0, b31: 0, b61: 0, b90: 0, total: 0, parties: 0 } }}
      error={res.ok ? null : res.error}
      fys={res.ok ? res.fys : []}
      selectedFy={searchParams.fy || null}
      asOf={asOf}
    />
  );
}
