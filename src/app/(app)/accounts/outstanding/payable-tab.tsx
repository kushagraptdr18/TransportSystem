import type { Prisma } from "@prisma/client";
import { requireSession } from "@/lib/session";
import { authorize } from "@/lib/authz";
import { withTenant } from "@/lib/db";
import { toNum } from "@/lib/utils";
import { ALL_PAYABLE_REF_TYPES } from "@/lib/settlement";
import { FilterBar, type FilterDef } from "@/components/data/filter-bar";
import { SimpleReport } from "@/components/accounts/simple-report";

export const dynamic = "force-dynamic";

/**
 * Outstanding Payables — centralized register of everything the firm still has
 * to pay: chalan freight (vehicle owner / broker), broker slip owner side, and
 * unpaid staff salaries. Payment-voucher allocations against a document count
 * as paid/adjusted, as do settlement round-off and shortage write-offs.
 */
export async function OutstandingPayableTab({
  searchParams,
}: {
  searchParams: {
    date_from?: string;
    date_to?: string;
    party?: string;
    source?: string;
    show_closed?: string;
  };
}) {
  const session = requireSession();
  await authorize(session, "reports", "view");

  const showClosed = searchParams.show_closed === "1";
  const source = searchParams.source; // CHALAN | BROKER_SLIP | SALARY | undefined

  const dateWhere =
    searchParams.date_from || searchParams.date_to
      ? {
          ...(searchParams.date_from ? { gte: new Date(searchParams.date_from + "T00:00:00") } : {}),
          ...(searchParams.date_to ? { lte: new Date(searchParams.date_to + "T23:59:59") } : {}),
        }
      : undefined;

  const { rows, parties } = await withTenant(session.tenantId, async (tx) => {
    const chalanWhere: Prisma.ChalanWhereInput = {
      firmId: session.firmId,
      fyId: session.fyId,
      deletedAt: null,
    };
    if (searchParams.party) chalanWhere.brokerId = searchParams.party;
    if (dateWhere) chalanWhere.chalanDate = dateWhere;

    const slipWhere: Prisma.BrokerSlipWhereInput = {
      firmId: session.firmId,
      fyId: session.fyId,
      deletedAt: null,
      ownerId: searchParams.party ? searchParams.party : { not: null },
    };
    if (dateWhere) slipWhere.slipDate = dateWhere;

    const salaryWhere: Prisma.StaffSalaryWhereInput = {
      firmId: session.firmId,
      fyId: session.fyId,
      deletedAt: null,
    };
    if (searchParams.party) salaryWhere.partyId = searchParams.party;

    const officeWhere: Prisma.OfficeTransactionWhereInput = {
      firmId: session.firmId,
      fyId: session.fyId,
      deletedAt: null,
      txnType: "EXPENSE",
      // only entries left on credit are payable — one with a payment mode was
      // settled in cash or bank at entry
      paymentMode: null,
      partyId: searchParams.party ? searchParams.party : { not: null },
    };
    if (dateWhere) officeWhere.date = dateWhere;

    const [chalans, slips, salaries, office, parties, allocations] = await Promise.all([
      source && source !== "CHALAN"
        ? Promise.resolve([])
        : tx.chalan.findMany({ where: chalanWhere, orderBy: { chalanDate: "asc" } }),
      source && source !== "BROKER_SLIP"
        ? Promise.resolve([])
        : tx.brokerSlip.findMany({ where: slipWhere, orderBy: { slipDate: "asc" } }),
      source && source !== "SALARY"
        ? Promise.resolve([])
        : tx.staffSalary.findMany({ where: salaryWhere, orderBy: { month: "asc" } }),
      source && source !== "OFFICE_EXPENSE"
        ? Promise.resolve([])
        : tx.officeTransaction.findMany({ where: officeWhere, orderBy: { date: "asc" } }),
      tx.party.findMany({
        where: {
          ledgerGroup: { in: ["OWNER_BROKER", "SUPPLIERS", "STAFF", "DRIVER"] },
          isActive: true,
        },
        orderBy: { name: "asc" },
      }),
      tx.voucherAllocation.findMany({
        where: {
          refType: { in: ALL_PAYABLE_REF_TYPES },
          // only live PAYMENT vouchers of this firm + FY count as paid
          voucher: {
            deletedAt: null,
            firmId: session.firmId,
            fyId: session.fyId,
            type: "PAYMENT",
          },
        },
        select: { refId: true, amount: true, tdsAmt: true, deduction: true, otherAmt: true },
      }),
    ]);
    return { chalans, slips, salaries, office, parties, allocations };
  }).then(({ chalans, slips, salaries, office, parties, allocations }) => {
    const paidByRef = new Map<string, number>();
    for (const a of allocations) {
      // approved deductions (TDS / deduction) settle the payable just like
      // money paid — adjusted amounts never remain outstanding
      const settled = toNum(a.amount) + toNum(a.tdsAmt) + toNum(a.deduction);
      paidByRef.set(a.refId, (paidByRef.get(a.refId) ?? 0) + settled);
    }
    const partyById = new Map(parties.map((p) => [p.id, p]));
    const status = (total: number, outstanding: number) =>
      outstanding <= 0.009 ? "PAID" : outstanding < total - 0.009 ? "PARTLY PAID" : "UNPAID";
    const partyType = (id: string | null | undefined, fallback: string) => {
      const g = id ? partyById.get(id)?.ledgerGroup : undefined;
      if (g === "OWNER_BROKER") return "Owner / Broker";
      if (g === "SUPPLIERS") return "Supplier";
      if (g === "STAFF") return "Staff";
      if (g === "DRIVER") return "Driver";
      return fallback;
    };

    const chalanRows = chalans.map((c) => {
      const gross = toNum(c.grandTotal);
      const paid =
        toNum(c.advanceTotal) +
        toNum(c.balPaidAmount) +
        toNum(c.balRoundOff) +
        toNum(c.balShortage) +
        (paidByRef.get(c.id) ?? 0);
      const outstanding = Math.round((gross - paid) * 100) / 100;
      return {
        refNo: c.chalanNo,
        date: c.chalanDate.toISOString(),
        kind: "CHALAN",
        partyType: partyType(c.brokerId, "Owner / Broker"),
        party: partyById.get(c.brokerId)?.name ?? "",
        gross,
        paid,
        outstanding,
        status: status(gross, outstanding),
        link: `chalan?id=${c.id}`,
      };
    });

    // broker slip owner (V) side: hire payable to the vehicle owner
    const slipRows = slips.map((s) => {
      const gross = toNum(s.vNetAmt);
      const paid =
        toNum(s.vAdvance) +
        toNum(s.vPaidAmount) +
        toNum(s.vRoundOff) +
        toNum(s.vShortage) +
        (paidByRef.get(s.id) ?? 0);
      const outstanding = Math.round((gross - paid) * 100) / 100;
      return {
        refNo: s.slipNo,
        date: s.slipDate.toISOString(),
        kind: "BROKER_SLIP",
        partyType: partyType(s.ownerId, "Vehicle Owner"),
        party: (s.ownerId && partyById.get(s.ownerId)?.name) || s.ownerName || "",
        gross,
        paid,
        outstanding,
        status: status(gross, outstanding),
        link: `broker/slip?id=${s.id}`,
      };
    });

    const salaryRows = salaries.map((s) => {
      const gross = toNum(s.netSalary);
      // settled from the payroll screen PLUS anything allocated by a payment
      // voucher — before this, a salary paid by voucher still read as fully
      // outstanding here
      const paid = toNum(s.paidAmount) + (paidByRef.get(s.id) ?? 0);
      const outstanding = Math.round((gross - paid) * 100) / 100;
      return {
        refNo: s.refNo || s.voucherNo || `Salary ${s.month}`,
        date: new Date(`${s.month}-01T00:00:00`).toISOString(),
        kind: "SALARY",
        partyType: "Staff",
        party: partyById.get(s.partyId)?.name ?? "",
        gross,
        paid,
        outstanding,
        status: status(gross, outstanding),
        link: `accounts/staff`,
      };
    });

    const officeRows = office.map((o) => {
      const gross = toNum(o.amount);
      const paid = paidByRef.get(o.id) ?? 0;
      const outstanding = Math.round((gross - paid) * 100) / 100;
      return {
        refNo: o.refNo || o.voucherNo,
        date: o.date.toISOString(),
        kind: "OFFICE_EXPENSE",
        partyType: partyType(o.partyId, "Supplier"),
        party: (o.partyId && partyById.get(o.partyId)?.name) ?? "",
        gross,
        paid,
        outstanding,
        status: status(gross, outstanding),
        link: `accounts/office?id=${o.id}`,
      };
    });

    return {
      parties,
      rows: [...chalanRows, ...slipRows, ...salaryRows, ...officeRows]
        .filter((r) => r.gross > 0)
        .filter((r) => showClosed || r.outstanding > 0.009)
        .sort((a, b) => a.date.localeCompare(b.date)),
    };
  });

  const filters: FilterDef[] = [
    { type: "daterange", key: "date", label: "Date" },
    {
      type: "combobox",
      key: "party",
      label: "Party",
      options: parties.map((p) => ({
        value: p.id,
        label: `${p.name} (${p.ledgerGroup.replace(/_/g, " ")})`,
      })),
    },
    {
      type: "select",
      key: "source",
      label: "Module",
      options: [
        { value: "CHALAN", label: "Chalan (Freight Payable)" },
        { value: "BROKER_SLIP", label: "Broker Slip (Owner Payable)" },
        { value: "SALARY", label: "Staff Salary" },
        { value: "OFFICE_EXPENSE", label: "Office Expense" },
      ],
    },
    {
      type: "select",
      key: "show_closed",
      label: "Show Closed",
      options: [{ value: "1", label: "Include settled" }],
    },
  ];

  return (
    <div className="space-y-4">
      <FilterBar filters={filters} />
      <SimpleReport
        title={`${rows.length} payable${rows.length === 1 ? "" : "s"} (chalan freight + broker slip owner side + staff salary)`}
        columns={[
          { key: "refNo", header: "Ref No", linkBase: "/", linkParamKey: "link" },
          { key: "date", header: "Date", kind: "date" },
          { key: "kind", header: "Module", kind: "badge" },
          { key: "partyType", header: "Party Type" },
          { key: "party", header: "Party" },
          { key: "gross", header: "Gross Amt", kind: "money" },
          { key: "paid", header: "Paid / Adj", kind: "money" },
          { key: "outstanding", header: "Outstanding", kind: "money" },
          { key: "status", header: "Status", kind: "badge" },
        ]}
        rows={rows}
        fileName="outstanding-payables"
        emptyMessage="No outstanding payables — everything is settled."
      />
    </div>
  );
}
