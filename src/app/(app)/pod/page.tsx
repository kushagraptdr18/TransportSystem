import { requireSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { peekDocNumber } from "@/lib/sequences";
import { getVehicleOptions } from "@/lib/lookups";
import { PodForm } from "@/components/pod/pod-form";

export const dynamic = "force-dynamic";

export default async function PodPage({
  searchParams,
}: {
  searchParams: { vehicle?: string };
}) {
  const session = requireSession();
  const [docNo, vehicleOptions] = await Promise.all([
    withTenant(session.tenantId, (tx) =>
      peekDocNumber(tx, { firmId: session.firmId, fyId: session.fyId, docType: "POD" })
    ),
    getVehicleOptions(),
  ]);

  // ?vehicle= may be a vehicle id OR number (from the chalan register link)
  const initial = searchParams.vehicle?.trim();
  const match = initial
    ? vehicleOptions.find((v) => v.value === initial || v.label === initial)
    : undefined;

  return (
    <div className="p-4">
      <PodForm
        defaultDocNo={docNo ?? "1"}
        vehicleOptions={vehicleOptions}
        initialVehicleId={match?.value ?? null}
      />
    </div>
  );
}
