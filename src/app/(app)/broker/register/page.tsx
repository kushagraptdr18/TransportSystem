import Link from "next/link";
import { requireSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { round2 } from "@/lib/calc/tds";
import { payableSettlement } from "@/lib/settlement";
import { Button } from "@/components/ui/button";
import { FilterBar, type FilterDef } from "@/components/data/filter-bar";
import { BrokerRegisterTable, type BrokerRegisterRow } from "@/components/broker/register-table";

export const dynamic = "force-dynamic";

interface SearchParams {
  date_from?: string;
  date_to?: string;
  q?: string; // slip no search
  vehicle?: string;
  party?: string;
  side?: string; // PARTY | OWNER
  pod?: string; // yes | no
  pstatus?: string; // received | pending
  vstatus?: string; // paid | pending
}

export default async function BrokerRegisterPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = requireSession();

  const { rows, vPos, vehicles, brokers, cityById, partyById, vehicleById, userById } = await withTenant(
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
      if (searchParams.q)
        where.slipNo = { contains: searchParams.q, mode: "insensitive" };
      if (searchParams.vehicle) where.vehicleId = searchParams.vehicle;
      if (searchParams.pod) where.podAttached = searchParams.pod === "yes";
      if (searchParams.pstatus)
        where.pPaymentStatus = searchParams.pstatus === "received" ? "RECEIVED" : "PENDING";
      // vstatus filters on the LIVE settled position (below), not the stored
      // column — a slip settled by a payment voucher is genuinely paid
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

      const [slips, vehicleRows, partyRows, cityRows, userRows] = await Promise.all([
        tx.brokerSlip.findMany({ where, orderBy: [{ slipDate: "desc" }, { slipNo: "desc" }] }),
        tx.vehicle.findMany({ where: { isActive: true }, orderBy: { number: "asc" } }),
        tx.party.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
        tx.city.findMany(),
        tx.user.findMany({ select: { id: true, name: true } }),
      ]);

      // LIVE owner-side settlement — the stored vBalance/vPaymentStatus never
      // move when a Payment Voucher settles the slip; this register must show
      // the same figures the Outstanding Payables register does
      const vPos = await payableSettlement(tx, {
        firmId: session.firmId,
        fyId: session.fyId,
        refType: "BROKER_ENTRY",
        docs: slips.map((s) => ({
          id: s.id,
          balance: round2(Number(s.vNetAmt) - Number(s.vAdvance)),
          ownPaid: Number(s.vPaidAmount),
          ownShortage: Number(s.vShortage),
          ownRoundOff: Number(s.vRoundOff),
        })),
      });

      return {
        rows: slips,
        vPos,
        vehicles: vehicleRows,
        brokers: partyRows.filter((p) => p.ledgerGroup === "OWNER_BROKER" || p.ledgerGroup === "RELATIVE"),
        cityById: new Map(cityRows.map((c) => [c.id, c.name])),
        partyById: new Map(partyRows.map((p) => [p.id, p.name])),
        vehicleById: new Map(vehicleRows.map((v) => [v.id, v.number])),
        userById: new Map(userRows.map((u) => [u.id, u.name])),
      };
    }
  );

  const allRows: BrokerRegisterRow[] = rows.map((s) => ({
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
    // live outstanding (own payments + voucher allocations), never stored
    vBalance: vPos.get(s.id)?.outstanding ?? Number(s.vBalance),
    pAdvance: Number(s.pAdvance),
    pNetAmt: Number(s.pNetAmt),
    podAttached: s.podAttached,
    podFilePath: s.podFilePath,
    podFileName: s.podFileName,
    podUploadDate: s.podUploadDate ? s.podUploadDate.toISOString() : null,
    pPaymentStatus: s.pPaymentStatus,
    pPaidAmount: Number(s.pPaidAmount),
    pRoundOff: Number(s.pRoundOff),
    pShortage: Number(s.pShortage),
    pPaymentDate: s.pPaymentDate ? s.pPaymentDate.toISOString() : null,
    vPaymentStatus:
      (vPos.get(s.id)?.outstanding ?? Number(s.vBalance)) <= 0.009 ? "PAID" : "PENDING",
    vPaidAmount: Number(s.vPaidAmount),
    vRoundOff: Number(s.vRoundOff),
    vShortage: Number(s.vShortage),
    vPaymentDate: s.vPaymentDate ? s.vPaymentDate.toISOString() : null,
    unloadDate: s.unloadDate ? s.unloadDate.toISOString() : null,
    createdAt: s.createdAt.toISOString(),
    createdBy: (s.createdById && userById.get(s.createdById)) || "",
  }));
  // owner-balance filter runs on the LIVE position computed above
  const data = searchParams.vstatus
    ? allRows.filter((r) =>
        searchParams.vstatus === "paid" ? r.vBalance <= 0.009 : r.vBalance > 0.009
      )
    : allRows;

  const filters: FilterDef[] = [
    { type: "text", key: "q", label: "Slip No..." },
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
    {
      type: "select",
      key: "pstatus",
      label: "Broker Balance",
      options: [
        { value: "received", label: "Received" },
        { value: "pending", label: "Pending" },
      ],
    },
    {
      type: "select",
      key: "vstatus",
      label: "Owner Balance",
      options: [
        { value: "paid", label: "Paid" },
        { value: "pending", label: "Pending" },
      ],
    },
    {
      type: "select",
      key: "pod",
      label: "POD Attached",
      options: [
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" },
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
      {/* balance receipt / payment moved into the slip itself */}
      <BrokerRegisterTable data={data} canDelete={canDelete} />
    </div>
  );
}
