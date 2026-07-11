import Link from "next/link";
import {
  BadgeIndianRupee,
  Banknote,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  HandCoins,
  Package,
  Receipt,
  Scale,
  Truck,
  Users,
  Wallet,
} from "lucide-react";
import { requireSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { formatDate } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatCard } from "@/components/dashboard/stat-card";
import { BarSparkline, type SparkPoint } from "@/components/dashboard/sparkline";

export const dynamic = "force-dynamic";

function num(v: unknown): number {
  return v == null ? 0 : Number(v);
}

function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}

export default async function DashboardPage() {
  const session = requireSession();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const scope = { tenantId: session.tenantId, firmId: session.firmId, fyId: session.fyId };

  const data = await withTenant(session.tenantId, async (tx) => {
    const [
      lrCount,
      lrMonth,
      loadingCount,
      loadingMonth,
      chalanCount,
      chalanMonth,
      chalanPayCount,
      chalanPayMonth,
      brokerSlipCount,
      brokerSlipMonth,
      brokerOutstanding,
      receiptCount,
      receiptMonth,
      receivables,
      paymentCount,
      paymentMonth,
      billPtCount,
      billPtMonth,
      billFtCount,
      billFtMonth,
      podPending,
      ewayLrs,
      docRenewals,
      serviceDue,
      recentLrs,
    ] = await Promise.all([
      tx.lr.count({ where: { ...scope, deletedAt: null } }),
      tx.lr.aggregate({
        where: { ...scope, deletedAt: null, lrDate: { gte: monthStart } },
        _sum: { grandTotal: true },
      }),
      tx.loadingChalan.count({ where: { ...scope, deletedAt: null } }),
      tx.loadingChalan.aggregate({
        where: { ...scope, deletedAt: null, chalanDate: { gte: monthStart } },
        _sum: { netAmount: true },
      }),
      tx.chalan.count({ where: { ...scope, deletedAt: null } }),
      tx.chalan.aggregate({
        where: { ...scope, deletedAt: null, chalanDate: { gte: monthStart } },
        _sum: { grandTotal: true },
      }),
      tx.voucher.count({
        where: { ...scope, deletedAt: null, type: "PAYMENT", moduleLink: "FREIGHT_CHALLAN" },
      }),
      tx.voucher.aggregate({
        where: {
          ...scope,
          deletedAt: null,
          type: "PAYMENT",
          moduleLink: "FREIGHT_CHALLAN",
          voucherDate: { gte: monthStart },
        },
        _sum: { netAmount: true },
      }),
      tx.brokerSlip.count({ where: { ...scope, deletedAt: null } }),
      tx.brokerSlip.aggregate({
        where: { ...scope, deletedAt: null, slipDate: { gte: monthStart } },
        _sum: { vNetAmt: true },
      }),
      tx.brokerSlip.aggregate({
        where: { ...scope, deletedAt: null },
        _sum: { vBalance: true },
      }),
      tx.voucher.count({ where: { ...scope, deletedAt: null, type: "RECEIPT" } }),
      tx.voucher.aggregate({
        where: { ...scope, deletedAt: null, type: "RECEIPT", voucherDate: { gte: monthStart } },
        _sum: { netAmount: true },
      }),
      tx.invoice.aggregate({
        where: { ...scope, deletedAt: null },
        _sum: { balance: true },
        _count: true,
      }),
      tx.voucher.count({ where: { ...scope, deletedAt: null, type: "PAYMENT" } }),
      tx.voucher.aggregate({
        where: { ...scope, deletedAt: null, type: "PAYMENT", voucherDate: { gte: monthStart } },
        _sum: { netAmount: true },
      }),
      tx.invoice.count({ where: { ...scope, deletedAt: null, kind: "PART_TRUCK" } }),
      tx.invoice.aggregate({
        where: { ...scope, deletedAt: null, kind: "PART_TRUCK", invoiceDate: { gte: monthStart } },
        _sum: { grandTotal: true },
      }),
      tx.invoice.count({ where: { ...scope, deletedAt: null, kind: "FULL_TRUCK" } }),
      tx.invoice.aggregate({
        where: { ...scope, deletedAt: null, kind: "FULL_TRUCK", invoiceDate: { gte: monthStart } },
        _sum: { grandTotal: true },
      }),
      tx.lr.count({
        where: { ...scope, deletedAt: null, status: "ON_CHALAN", pods: { none: {} } },
      }),
      tx.lr.findMany({
        where: {
          ...scope,
          deletedAt: null,
          ewayExpiry: { not: null, lte: addDays(today, 3) },
          status: { notIn: ["DELIVERED", "BILLED"] },
        },
        select: { id: true, lrNo: true, lrDate: true, ewayBillNo: true, ewayExpiry: true },
        orderBy: { ewayExpiry: "asc" },
        take: 15,
      }),
      tx.vehicleDocument.findMany({
        where: {
          tenantId: session.tenantId,
          expiryDate: { not: null, lte: addDays(today, 30) },
          docType: { showReminder: true },
        },
        include: { docType: true },
        orderBy: { expiryDate: "asc" },
        take: 15,
      }),
      tx.jobEntry.findMany({
        where: {
          ...scope,
          deletedAt: null,
          dueDate: { not: null, lte: addDays(today, 15) },
        },
        select: { id: true, invoiceNo: true, vehicleId: true, dueDate: true },
        orderBy: { dueDate: "asc" },
        take: 15,
      }),
      tx.lr.findMany({
        where: { ...scope, deletedAt: null, lrDate: { gte: addDays(today, -29) } },
        select: { lrDate: true },
      }),
    ]);

    const vehicleIds = [
      ...docRenewals.map((d) => d.vehicleId),
      ...serviceDue.map((j) => j.vehicleId).filter((v): v is string => !!v),
    ];
    const vehicles = vehicleIds.length
      ? await tx.vehicle.findMany({
          where: { id: { in: vehicleIds } },
          select: { id: true, number: true },
        })
      : [];

    return {
      lrCount,
      lrMonth: num(lrMonth._sum.grandTotal),
      loadingCount,
      loadingMonth: num(loadingMonth._sum.netAmount),
      chalanCount,
      chalanMonth: num(chalanMonth._sum.grandTotal),
      chalanPayCount,
      chalanPayMonth: num(chalanPayMonth._sum.netAmount),
      brokerSlipCount,
      brokerSlipMonth: num(brokerSlipMonth._sum.vNetAmt),
      brokerOutstanding: num(brokerOutstanding._sum.vBalance),
      receiptCount,
      receiptMonth: num(receiptMonth._sum.netAmount),
      receivableCount: receivables._count,
      receivableSum: num(receivables._sum.balance),
      paymentCount,
      paymentMonth: num(paymentMonth._sum.netAmount),
      billPtCount,
      billPtMonth: num(billPtMonth._sum.grandTotal),
      billFtCount,
      billFtMonth: num(billFtMonth._sum.grandTotal),
      podPending,
      ewayLrs,
      docRenewals,
      serviceDue,
      recentLrs,
      vehicleMap: new Map(vehicles.map((v) => [v.id, v.number])),
    };
  });

  // bookings per day, last 30 days
  const spark: SparkPoint[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = addDays(today, -i);
    spark.push({ label: formatDate(d), value: 0 });
  }
  for (const lr of data.recentLrs) {
    const d = new Date(lr.lrDate);
    const key = formatDate(new Date(d.getFullYear(), d.getMonth(), d.getDate()));
    const p = spark.find((s) => s.label === key);
    if (p) p.value += 1;
  }

  const kpis = [
    { label: "Bookings (LR)", count: data.lrCount, amount: data.lrMonth, href: "/lr/register", icon: FileText },
    { label: "Loading Challans", count: data.loadingCount, amount: data.loadingMonth, href: "/loading-chalan", icon: Package },
    { label: "Freight Chalans", count: data.chalanCount, amount: data.chalanMonth, href: "/chalan", icon: Truck },
    { label: "Chalan Payments", count: data.chalanPayCount, amount: data.chalanPayMonth, href: "/accounts/vouchers", icon: HandCoins },
    { label: "Broker Slips", count: data.brokerSlipCount, amount: data.brokerSlipMonth, href: "/broker/slip", icon: Users },
    { label: "Broker Outstanding", count: data.brokerSlipCount, amount: data.brokerOutstanding, href: "/broker/register", icon: Scale },
    { label: "Receipts", count: data.receiptCount, amount: data.receiptMonth, href: "/accounts/vouchers", icon: Receipt },
    { label: "Pending Receivables", count: data.receivableCount, amount: data.receivableSum, href: "/accounts/outstanding", icon: BadgeIndianRupee },
    { label: "Payments", count: data.paymentCount, amount: data.paymentMonth, href: "/accounts/vouchers", icon: Banknote },
    { label: "Bills Part Truck", count: data.billPtCount, amount: data.billPtMonth, href: "/billing/part-truck", icon: FileSpreadsheet },
    { label: "Bills Full Truck", count: data.billFtCount, amount: data.billFtMonth, href: "/billing/full-truck", icon: Wallet },
    { label: "PODs Pending", count: data.podPending, href: "/pod/register", icon: FileCheck2 },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Dashboard</h1>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
        {kpis.map((k) => (
          <StatCard key={k.label} {...k} />
        ))}
      </div>

      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Bookings per day — last 30 days
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <BarSparkline points={spark} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-medium">E-Way Bill Expiry (3 days)</CardTitle>
          </CardHeader>
          <CardContent className="p-2 pt-0">
            {data.ewayLrs.length === 0 ? (
              <p className="p-2 text-sm text-muted-foreground">No e-way bills expiring soon.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">LR No</TableHead>
                    <TableHead className="text-xs">Date</TableHead>
                    <TableHead className="text-xs">EWB No</TableHead>
                    <TableHead className="text-xs">Expiry</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.ewayLrs.map((lr) => {
                    const past = lr.ewayExpiry && new Date(lr.ewayExpiry) < today;
                    return (
                      <TableRow key={lr.id}>
                        <TableCell className="text-sm">
                          <Link href={`/lr/register?q=${encodeURIComponent(lr.lrNo)}`} className="text-primary hover:underline">
                            {lr.lrNo}
                          </Link>
                        </TableCell>
                        <TableCell className="text-sm">{formatDate(lr.lrDate)}</TableCell>
                        <TableCell className="text-sm">{lr.ewayBillNo ?? "—"}</TableCell>
                        <TableCell className={past ? "text-sm font-medium text-red-600" : "text-sm"}>
                          {formatDate(lr.ewayExpiry)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-medium">Document Renewals (30 days)</CardTitle>
          </CardHeader>
          <CardContent className="p-2 pt-0">
            {data.docRenewals.length === 0 ? (
              <p className="p-2 text-sm text-muted-foreground">No documents due for renewal.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Document</TableHead>
                    <TableHead className="text-xs">Vehicle</TableHead>
                    <TableHead className="text-xs">Company</TableHead>
                    <TableHead className="text-xs">Expiry</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.docRenewals.map((d) => {
                    const past = d.expiryDate && new Date(d.expiryDate) < today;
                    return (
                      <TableRow key={d.id}>
                        <TableCell className="text-sm">{d.docType.name}</TableCell>
                        <TableCell className="text-sm">
                          {data.vehicleMap.get(d.vehicleId) ?? "—"}
                        </TableCell>
                        <TableCell className="text-sm">{d.companyName ?? "—"}</TableCell>
                        <TableCell className={past ? "text-sm font-medium text-red-600" : "text-sm"}>
                          {formatDate(d.expiryDate)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-medium">Service Due (15 days)</CardTitle>
          </CardHeader>
          <CardContent className="p-2 pt-0">
            {data.serviceDue.length === 0 ? (
              <p className="p-2 text-sm text-muted-foreground">No services due.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Vehicle</TableHead>
                    <TableHead className="text-xs">Job Invoice</TableHead>
                    <TableHead className="text-xs">Due Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.serviceDue.map((j) => {
                    const past = j.dueDate && new Date(j.dueDate) < today;
                    return (
                      <TableRow key={j.id}>
                        <TableCell className="text-sm">
                          {(j.vehicleId && data.vehicleMap.get(j.vehicleId)) ?? "—"}
                        </TableCell>
                        <TableCell className="text-sm">{j.invoiceNo}</TableCell>
                        <TableCell className={past ? "text-sm font-medium text-red-600" : "text-sm"}>
                          {formatDate(j.dueDate)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
