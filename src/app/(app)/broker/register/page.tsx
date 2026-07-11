import Link from "next/link";
import { requireSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { FilterBar, type FilterDef } from "@/components/data/filter-bar";
import { BrokerRegisterTable, type BrokerRegisterRow } from "@/components/broker/register-table";

export const dynamic = "force-dynamic";

interface SearchParams {
  date_from?: string;
  date_to?: string;
  vehicle?: string;
  party?: string;
  side?: string; // PARTY | OWNER
}

export default async function BrokerRegisterPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = requireSession();

  const { rows, vehicles, brokers, cityById, partyById, vehicleById } = await withTenant(
    session.tenantId,
    async (tx) => {
      const where: Record<string, unknown> = {
        firmId: session.firmId,
        fyId: session.fyId,
        deletedAt: null,
      };
      if (searchParams.date_from || searchParams.date_to) {
        where.slipDate = {
          ...(searchParams.date_from ? { gte: new Date(searchParams.date_from + "T00:00:00") } : {}),
          ...(searchParams.date_to ? { lte: new Date(searchParams.date_to + "T23:59:59") } : {}),
        };
      }
      if (searchParams.vehicle) where.vehicleId = searchParams.vehicle;
      if (searchParams.party) {
        if (searchParams.side === "PARTY") where.partyId = searchParams.party;
        else if (searchParams.side === "OWNER") {
          where.OR = [{ ownerId: searchParams.party }, { transporterId: searchParams.party }];
        } else {
          where.OR = [
            { partyId: searchParams.party },
            { ownerId: searchParams.party },
            { transporterId: searchParams.party },
          ];
        }
      }

      const [slips, vehicleRows, partyRows, cityRows] = await Promise.all([
        tx.brokerSlip.findMany({ where, orderBy: [{ slipDate: "desc" }, { slipNo: "desc" }] }),
        tx.vehicle.findMany({ where: { isActive: true }, orderBy: { number: "asc" } }),
        tx.party.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
        tx.city.findMany(),
      ]);

      return {
        rows: slips,
        vehicles: vehicleRows,
        brokers: partyRows.filter((p) => p.ledgerGroup === "OWNER_BROKER"),
        cityById: new Map(cityRows.map((c) => [c.id, c.name])),
        partyById: new Map(partyRows.map((p) => [p.id, p.name])),
        vehicleById: new Map(vehicleRows.map((v) => [v.id, v.number])),
      };
    }
  );

  const data: BrokerRegisterRow[] = rows.map((s) => ({
    id: s.id,
    slipNo: s.slipNo,
    slipDate: s.slipDate.toISOString(),
    vehicle: (s.vehicleId && vehicleById.get(s.vehicleId)) || "",
    transporter: (s.transporterId && partyById.get(s.transporterId)) || "",
    owner: (s.ownerId && partyById.get(s.ownerId)) || s.ownerName || "",
    loadStation: (s.loadStationId && cityById.get(s.loadStationId)) || "",
    destination: (s.destCityId && cityById.get(s.destCityId)) || "",
    qty: Number(s.qty),
    actualWt: Number(s.actualWt),
    pFreight: Number(s.pFreight),
    pBalance: Number(s.pBalance),
    vFreight: Number(s.vFreight),
    vNetAmt: Number(s.vNetAmt),
    vAdvance: Number(s.vAdvance),
    vBalance: Number(s.vBalance),
  }));

  const filters: FilterDef[] = [
    { type: "daterange", key: "date", label: "Slip Date" },
    {
      type: "combobox",
      key: "vehicle",
      label: "Vehicle",
      options: vehicles.map((v) => ({ value: v.id, label: v.number })),
    },
    {
      type: "combobox",
      key: "party",
      label: "Transporter / Owner",
      options: brokers.map((p) => ({ value: p.id, label: p.name })),
    },
    {
      type: "select",
      key: "side",
      label: "Side",
      options: [
        { value: "PARTY", label: "Party" },
        { value: "OWNER", label: "Owner" },
      ],
    },
  ];

  const canDelete = session.role === "ADMIN" || session.role === "OWNER";

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Broker Entry Register</h1>
        <Button asChild size="sm">
          <Link href="/broker/slip">New Broker Slip</Link>
        </Button>
      </div>
      <FilterBar filters={filters} />
      <BrokerRegisterTable data={data} canDelete={canDelete} />
    </div>
  );
}
