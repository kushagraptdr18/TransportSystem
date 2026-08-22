import { getOutstandingAgeing, type OutSide } from "../outstanding-actions";
import { OutstandingClient } from "./outstanding-client";

export const dynamic = "force-dynamic";

/** Dashboard drill-down: party-wise receivable/payable ageing. */
export default async function OutstandingPage({
  searchParams,
}: {
  searchParams: { side?: string; fy?: string };
}) {
  const side: OutSide = searchParams.side === "PAY" ? "PAY" : "RECV";
  const res = await getOutstandingAgeing({ side, fyId: searchParams.fy || null });
  return (
    <OutstandingClient
      side={side}
      data={res.ok ? res.data : { rows: [], totals: { b0: 0, b31: 0, b61: 0, b90: 0, total: 0, parties: 0 } }}
      error={res.ok ? null : res.error}
      fys={res.ok ? res.fys : []}
      selectedFy={searchParams.fy || null}
    />
  );
}
