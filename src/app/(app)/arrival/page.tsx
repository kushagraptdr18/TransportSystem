import type { Prisma } from "@prisma/client";
import { requireSession } from "@/lib/session";
import { authorize } from "@/lib/authz";
import { withTenant } from "@/lib/db";
import { formatDate } from "@/lib/utils";
import { DocModule } from "@/components/data/doc-module";
import { saveArrival, deleteArrival } from "./actions";

export const dynamic = "force-dynamic";

export default async function ArrivalPage({
  searchParams,
}: {
  searchParams: { date_from?: string; date_to?: string };
}) {
  const session = requireSession();
  await authorize(session, "loading", "view");

  const rows = await withTenant(session.tenantId, (tx) => {
    const where: Prisma.ArrivalWhereInput = { firmId: session.firmId, fyId: session.fyId };
    if (searchParams.date_from || searchParams.date_to) {
      where.unloadDate = {
        ...(searchParams.date_from ? { gte: new Date(searchParams.date_from + "T00:00:00") } : {}),
        ...(searchParams.date_to ? { lte: new Date(searchParams.date_to + "T23:59:59") } : {}),
      };
    }
    return tx.arrival.findMany({ where, orderBy: [{ unloadDate: "desc" }] });
  });

  return (
    <DocModule
      title="Unloading / Arrival"
      newLabel="New Arrival"
      exportName="arrivals"
      canDelete={session.role === "ADMIN" || session.role === "OWNER"}
      save={saveArrival}
      remove={deleteArrival}
      rows={rows.map((r) => ({
        id: r.id,
        arrivalNo: r.arrivalNo,
        unloadDate: formatDate(r.unloadDate),
        unloadedBy: r.unloadedBy ?? "",
        godownNo: r.godownNo ?? "",
        manifestNo: r.manifestNo ?? "",
      }))}
      columns={[
        { key: "arrivalNo", header: "Arrival No" },
        { key: "unloadDate", header: "Unload Date" },
        { key: "unloadedBy", header: "Unloaded By" },
        { key: "godownNo", header: "Godown No" },
        { key: "manifestNo", header: "Manifest No" },
      ]}
      filters={[{ type: "daterange", key: "date", label: "Unload Date" }]}
      fields={[
        { name: "arrivalNo", label: "Arrival No (blank = auto)", type: "text" },
        { name: "unloadDate", label: "Unload Date *", type: "date" },
        { name: "unloadedBy", label: "Unloaded By", type: "text" },
        { name: "godownNo", label: "Godown No", type: "text" },
        { name: "manifestNo", label: "Manifest No", type: "text" },
      ]}
      defaults={{ arrivalNo: "", unloadDate: formatDate(new Date()) }}
    />
  );
}
