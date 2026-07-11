import { requireSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { peekDocNumber } from "@/lib/sequences";
import { getVehicleOptions } from "@/lib/lookups";
import { PodForm } from "@/components/pod/pod-form";

export const dynamic = "force-dynamic";

export default async function PodPage() {
  const session = requireSession();
  const [docNo, vehicleOptions] = await Promise.all([
    withTenant(session.tenantId, (tx) =>
      peekDocNumber(tx, { firmId: session.firmId, fyId: session.fyId, docType: "POD" })
    ),
    getVehicleOptions(),
  ]);

  return (
    <div className="p-4">
      <PodForm defaultDocNo={docNo ?? "1"} vehicleOptions={vehicleOptions} />
    </div>
  );
}
