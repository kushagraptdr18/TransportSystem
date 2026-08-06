import { getTdsMonitor } from "../tds-actions";
import { TdsMonitorClient } from "./tds-monitor-client";

export const dynamic = "force-dynamic";

/** Dashboard drill-down: supplier-wise TDS threshold monitor. */
export default async function TdsMonitorPage() {
  const res = await getTdsMonitor();
  return (
    <TdsMonitorClient
      data={res.ok ? res.data : { rows: [], crossedCount: 0, nearCount: 0, toDeductTotal: 0 }}
      error={res.ok ? null : res.error}
    />
  );
}
