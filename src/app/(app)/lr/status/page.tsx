import { requireSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { formatDate, formatMoney } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export const dynamic = "force-dynamic";

function Row({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value || "—"}</span>
    </div>
  );
}

function NotYet({ text }: { text: string }) {
  return <div className="text-sm italic text-muted-foreground">{text}</div>;
}

export default async function BiltyStatusPage({
  searchParams,
}: {
  searchParams: { lrNo?: string };
}) {
  const session = requireSession();
  const lrNo = searchParams.lrNo?.trim();

  const data = lrNo
    ? await withTenant(session.tenantId, async (tx) => {
        const lr = await tx.lr.findFirst({
          where: { firmId: session.firmId, fyId: session.fyId, lrNo, deletedAt: null },
          include: {
            items: true,
            chalanLrs: { include: { chalan: true } },
            pods: true,
            invoiceLrs: { include: { invoice: true } },
          },
        });
        if (!lr) return null;
        const [cities, parties, vehicles] = await Promise.all([
          tx.city.findMany(),
          tx.party.findMany(),
          tx.vehicle.findMany(),
        ]);
        const cityName = (id: string | null) => cities.find((c) => c.id === id)?.name ?? "";
        const partyName = (id: string | null) => parties.find((p) => p.id === id)?.name ?? "";
        const vehicleNo = (id: string | null) => vehicles.find((v) => v.id === id)?.number ?? "";
        return { lr, cityName, partyName, vehicleNo };
      })
    : null;

  return (
    <div className="max-w-4xl space-y-4">
      <h1 className="text-xl font-semibold">Bilty Status</h1>

      <form method="GET" className="flex items-center gap-2">
        <Input
          name="lrNo"
          defaultValue={lrNo ?? ""}
          placeholder="Enter LR No..."
          className="w-56"
        />
        <Button type="submit">Search</Button>
      </form>

      {lrNo && !data && (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            LR No <span className="font-medium">{lrNo}</span> not found in the current firm /
            financial year.
          </CardContent>
        </Card>
      )}

      {data && (
        <div className="grid gap-4 md:grid-cols-2">
          {/* Booking */}
          <Card>
            <CardHeader className="p-4 pb-2">
              <CardTitle className="flex items-center justify-between text-sm">
                Booking
                <Badge variant="secondary">{data.lr.status.replace("_", " ")}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 p-4 pt-0">
              <Row label="LR No" value={data.lr.lrNo} />
              <Row label="LR Date" value={formatDate(data.lr.lrDate)} />
              <Row
                label="Route"
                value={`${data.cityName(data.lr.sourceCityId)} → ${data.cityName(data.lr.destCityId)}`}
              />
              <Row label="Consignor" value={data.partyName(data.lr.consignorId)} />
              <Row label="Consignee" value={data.partyName(data.lr.consigneeId)} />
              <Row
                label="Vehicle"
                value={data.lr.vehicleId ? data.vehicleNo(data.lr.vehicleId) : data.lr.vehicleText}
              />
              <Row label="LR Type" value={data.lr.lrType.replace("_", " ")} />
              <Row label="Freight" value={formatMoney(Number(data.lr.freight))} />
              <Row label="Grand Total" value={formatMoney(Number(data.lr.grandTotal))} />
              <Row
                label="Items"
                value={data.lr.items.map((i) => i.productName).join(", ")}
              />
            </CardContent>
          </Card>

          {/* Chalan */}
          <Card>
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm">Chalan</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-4 pt-0">
              {data.lr.chalanLrs.length === 0 ? (
                <NotYet text="Not yet loaded on a chalan." />
              ) : (
                data.lr.chalanLrs.map(({ chalan }) => (
                  <div key={chalan.id} className="space-y-1 border-b pb-2 last:border-b-0 last:pb-0">
                    <Row label="Chalan No" value={chalan.chalanNo} />
                    <Row label="Chalan Date" value={formatDate(chalan.chalanDate)} />
                    <Row label="Broker" value={data.partyName(chalan.brokerId)} />
                    <Row label="Vehicle" value={data.vehicleNo(chalan.vehicleId)} />
                    <Row label="Driver" value={chalan.driverName} />
                    <Row label="Freight" value={formatMoney(Number(chalan.freight))} />
                    <Row
                      label="Unloaded"
                      value={chalan.unloadDate ? formatDate(chalan.unloadDate) : "Pending"}
                    />
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* POD */}
          <Card>
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm">POD</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-4 pt-0">
              {data.lr.pods.length === 0 ? (
                <NotYet text="POD not yet received." />
              ) : (
                data.lr.pods.map((pod) => (
                  <div key={pod.id} className="space-y-1 border-b pb-2 last:border-b-0 last:pb-0">
                    <Row label="POD No" value={pod.docNo} />
                    <Row label="POD Date" value={formatDate(pod.docDate)} />
                    <Row
                      label="Unload Date"
                      value={pod.unloadDate ? formatDate(pod.unloadDate) : undefined}
                    />
                    <Row label="Ack No" value={pod.ackNo} />
                    <Row
                      label="Received Wt"
                      value={pod.recWt != null ? Number(pod.recWt).toFixed(3) : undefined}
                    />
                    <Row
                      label="Shortage Wt"
                      value={pod.shortageWt != null ? Number(pod.shortageWt).toFixed(3) : undefined}
                    />
                    <Row label="Status" value={<Badge variant="secondary">{pod.status}</Badge>} />
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Billing */}
          <Card>
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm">Billing</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-4 pt-0">
              {data.lr.invoiceLrs.length === 0 ? (
                <NotYet text="Not yet billed." />
              ) : (
                data.lr.invoiceLrs.map(({ invoice }) => (
                  <div key={invoice.id} className="space-y-1 border-b pb-2 last:border-b-0 last:pb-0">
                    <Row label="Invoice No" value={invoice.invoiceNo} />
                    <Row label="Invoice Date" value={formatDate(invoice.invoiceDate)} />
                    <Row label="Kind" value={invoice.kind.replace("_", " ")} />
                    <Row label="Party" value={data.partyName(invoice.partyId)} />
                    <Row label="Net Total" value={formatMoney(Number(invoice.netTotal))} />
                    <Row label="Balance" value={formatMoney(Number(invoice.balance))} />
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
