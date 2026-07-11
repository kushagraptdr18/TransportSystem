import Link from "next/link";
import type { InvoiceKind, Prisma } from "@prisma/client";
import { requireSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { toNum } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FilterBar, type FilterDef } from "@/components/data/filter-bar";
import {
  BillingRegisterTable,
  type BillingRegisterRow,
} from "@/components/billing/register-table";

export const dynamic = "force-dynamic";

const KINDS: InvoiceKind[] = ["PART_TRUCK", "FULL_TRUCK", "MANUAL", "GST"];

interface SearchParams {
  date_from?: string;
  date_to?: string;
  kind?: string;
  party?: string;
  q?: string;
}

export default async function BillingRegisterPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = requireSession();

  const { rows, parties } = await withTenant(session.tenantId, async (tx) => {
    const where: Prisma.InvoiceWhereInput = {
      firmId: session.firmId,
      fyId: session.fyId,
      deletedAt: null,
    };
    if (searchParams.date_from || searchParams.date_to) {
      where.invoiceDate = {
        ...(searchParams.date_from ? { gte: new Date(searchParams.date_from + "T00:00:00") } : {}),
        ...(searchParams.date_to ? { lte: new Date(searchParams.date_to + "T23:59:59") } : {}),
      };
    }
    if (searchParams.kind && KINDS.includes(searchParams.kind as InvoiceKind)) {
      where.kind = searchParams.kind as InvoiceKind;
    }
    if (searchParams.party) where.partyId = searchParams.party;
    if (searchParams.q) where.invoiceNo = { contains: searchParams.q, mode: "insensitive" };

    const [invoices, partyRows] = await Promise.all([
      tx.invoice.findMany({
        where,
        include: { _count: { select: { lrs: true } } },
        orderBy: [{ invoiceDate: "desc" }, { invoiceNo: "desc" }],
      }),
      tx.party.findMany({
        where: { isActive: true, ledgerGroup: "CONSIGNEE_CONSIGNOR" },
        orderBy: { name: "asc" },
      }),
    ]);
    return { rows: invoices, parties: partyRows };
  });

  const partyById = new Map(parties.map((p) => [p.id, p.name]));

  const data: BillingRegisterRow[] = rows.map((i) => ({
    id: i.id,
    invoiceNo: i.invoiceNo,
    invoiceDate: i.invoiceDate.toISOString(),
    kind: i.kind,
    party: partyById.get(i.partyId) ?? "",
    lrCount: i._count.lrs,
    total: toNum(String(i.total)),
    gstAmt: toNum(String(i.cgstAmt)) + toNum(String(i.sgstAmt)) + toNum(String(i.igstAmt)),
    netTotal: toNum(String(i.netTotal)),
    advance: toNum(String(i.advance)),
    balance: toNum(String(i.balance)),
  }));

  const filters: FilterDef[] = [
    { type: "daterange", key: "date", label: "Invoice Date" },
    {
      type: "select",
      key: "kind",
      label: "Bill Type",
      options: [
        { value: "PART_TRUCK", label: "Part Truck" },
        { value: "FULL_TRUCK", label: "Full Truck" },
        { value: "MANUAL", label: "Manual" },
        { value: "GST", label: "GST" },
      ],
    },
    {
      type: "combobox",
      key: "party",
      label: "Party",
      options: parties.map((p) => ({ value: p.id, label: p.name })),
    },
    { type: "text", key: "q", label: "Invoice No" },
  ];

  const canDelete = session.role === "ADMIN" || session.role === "OWNER";

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Billing Register</h1>
        <div className="flex gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href="/billing/part-truck">New PT Bill</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/billing/full-truck">New FT Bill</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/billing/manual">New Manual Bill</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/billing/gst">New GST Bill</Link>
          </Button>
        </div>
      </div>
      <FilterBar filters={filters} />
      <BillingRegisterTable data={data} canDelete={canDelete} />
    </div>
  );
}
