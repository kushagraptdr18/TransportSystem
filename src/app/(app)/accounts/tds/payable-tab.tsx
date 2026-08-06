import { requireSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { toNum } from "@/lib/utils";
import { FilterBar, type FilterDef } from "@/components/data/filter-bar";
import { SimpleReport, type ReportRow } from "@/components/accounts/simple-report";

/** So a nil deduction reads as a deliberate outcome, not a missing row. */
const tdsStatus = (amt: number) => (amt > 0.009 ? "DEDUCTED" : "NOT DEDUCTED");

/**
 * TDS PAYABLE Register — TDS OUR company deducts while MAKING payments.
 * Sources: Chalan (owner payment side), Broker Slip (owner payment side),
 * PAYMENT vouchers, and JOURNAL vouchers that touch the TDS Payable ledger.
 * Receipt vouchers NEVER appear here.
 *
 * Journal rows are derived live from the LEDGER entries posted against the
 * common "TDS Payable" head — the same entries an edit re-posts and a delete
 * removes — so the register and the ledger can never disagree and no
 * duplicate tracking is needed. A credit raises the liability (TDS deducted
 * via journal); a debit reduces it and shows as a negative amount.
 */
export async function TdsPayableTab({
  searchParams,
}: {
  searchParams: {
    q?: string;
    tds?: string;
    party?: string;
    module?: string;
    status?: string;
    date_from?: string;
    date_to?: string;
  };
}) {
  const session = requireSession();

  const dateWhere =
    searchParams.date_from || searchParams.date_to
      ? {
          ...(searchParams.date_from ? { gte: new Date(searchParams.date_from + "T00:00:00") } : {}),
          ...(searchParams.date_to ? { lte: new Date(searchParams.date_to + "T23:59:59") } : {}),
        }
      : undefined;

  const { rows, parties } = await withTenant(session.tenantId, async (tx) => {
    const scope = { firmId: session.firmId, fyId: session.fyId, deletedAt: null };
    // TDS applies only to hired vehicles. A company-owned vehicle is our own
    // asset — there is no payee to deduct from, so it never belongs here.
    const ownVehicleIds = (
      await tx.vehicle.findMany({
        where: { ownershipType: "OWNER" },
        select: { id: true },
      })
    ).map((v) => v.id);
    const notOwnVehicle = ownVehicleIds.length
      ? { vehicleId: { notIn: ownVehicleIds } }
      : {};

    const [payVouchers, chalans, slips, parties] = await Promise.all([
      // PAYMENT vouchers only — receipts must never appear in TDS Payable
      tx.voucher.findMany({
        where: {
          ...scope,
          type: "PAYMENT",
          ...(dateWhere ? { voucherDate: dateWhere } : {}),
          // a voucher against a company-owned vehicle is out too; one with no
          // vehicle at all cannot be ruled out, so it stays
          ...(ownVehicleIds.length
            ? { OR: [{ vehicleId: null }, { vehicleId: { notIn: ownVehicleIds } }] }
            : {}),
          AND: [
            { OR: [{ tdsAmt: { gt: 0 } }, { allocations: { some: { tdsAmt: { gt: 0 } } } }] },
          ],
        },
        include: { allocations: true },
      }),
      // Every TDS-ELIGIBLE chalan and broker slip, deducted or not. Filtering
      // on tdsAmt > 0 hid the zero-TDS ones, so there was no way to tell a
      // deliberate nil deduction from one that had simply been missed.
      tx.chalan.findMany({
        // cancelled chalans owe nothing, so no TDS arises on them
        where: { ...scope, cancelledAt: null, ...notOwnVehicle, ...(dateWhere ? { chalanDate: dateWhere } : {}) },
      }),
      tx.brokerSlip.findMany({
        where: {
          ...scope,
          ...notOwnVehicle,
          ...(dateWhere ? { slipDate: dateWhere } : {}),
          // only slips that actually have an owner side to deduct against
          OR: [{ ownerId: { not: null } }, { vNetAmt: { gt: 0 } }],
        },
      }),
      tx.party.findMany({ select: { id: true, name: true, pan: true } }),
    ]);
    const partyById = new Map(parties.map((p) => [p.id, p]));

    // section labels come ONLY from the TDS Master's freight-module ticks —
    // chalan, broker slip and hire references. Everything else stays blank
    // (no head-based guessing).
    const tdsSections = await tx.tdsSection.findMany({ where: { deletedAt: null } });
    const moduleSection = new Map<string, string>();
    for (const s of tdsSections) for (const m of s.moduleRefs) moduleSection.set(m, s.code);
    const allocSection = (a: { refType: string }): string => {
      if (a.refType === "FREIGHT_CHALLAN") return moduleSection.get("CHALAN") ?? "";
      if (a.refType === "BROKER_ENTRY") return moduleSection.get("BROKER_SLIP") ?? "";
      if (a.refType === "LORRY_HIRE") return moduleSection.get("HIRE") ?? "";
      return "";
    };

    // journal vouchers that touched the TDS Payable ledger head
    const tdsHeads = await tx.accountHead.findMany({
      where: { name: "TDS Payable" },
      select: { id: true },
    });
    const tdsLedger = tdsHeads.length
      ? await tx.ledgerEntry.findMany({
          where: {
            firmId: session.firmId,
            fyId: session.fyId,
            refType: "VOUCHER",
            accountHeadId: { in: tdsHeads.map((h) => h.id) },
            ...(dateWhere ? { date: dateWhere } : {}),
          },
        })
      : [];
    const journals = tdsLedger.length
      ? await tx.voucher.findMany({
          where: {
            id: { in: Array.from(new Set(tdsLedger.map((e) => e.refId))) },
            type: "JOURNAL",
            deletedAt: null,
          },
        })
      : [];
    const journalById = new Map(journals.map((v) => [v.id, v]));

    const out: ReportRow[] = [];
    for (const e of tdsLedger) {
      const v = journalById.get(e.refId);
      if (!v) continue; // payment/receipt vouchers already have their own rows
      const p = (v.partyId && partyById.get(v.partyId)) || (v.bankPartyId && partyById.get(v.bankPartyId)) || undefined;
      // credit = liability raised (deducted); debit = paid off / reversed
      const signedAmt = e.side === "CREDIT" ? toNum(String(e.amount)) : -toNum(String(e.amount));
      out.push({
        date: e.date.toISOString(),
        module: "JOURNAL VOUCHER",
        section: "",
        party: p?.name ?? "",
        pan: p?.pan ?? "",
        refNo: v.voucherNo,
        invoiceAmount: toNum(String(v.amount)),
        tdsPct: 0,
        tdsAmt: signedAmt,
        net: toNum(String(v.netAmount)),
        status: tdsStatus(Math.abs(signedAmt)),
        remarks: e.narration ?? v.remarks ?? "",
      });
    }
    for (const v of payVouchers) {
      const p = v.partyId ? partyById.get(v.partyId) : undefined;
      const allocTds = v.allocations.filter((a) => toNum(String(a.tdsAmt)) > 0);
      if (allocTds.length) {
        for (const a of allocTds) {
          out.push({
            date: v.voucherDate.toISOString(),
            module: "PAYMENT VOUCHER",
            section: allocSection(a),
            party: p?.name ?? "",
            pan: p?.pan ?? "",
            // for a chalan / slip the two are the same number; only a voucher
            // settling a bill has a distinct reference, so name both there
            refNo: a.refNo && a.refNo !== v.voucherNo ? `${a.refNo} (${v.voucherNo})` : v.voucherNo,
            // voucher rows carry only the TDS figure — bill/net stay blank
            invoiceAmount: null,
            tdsPct: toNum(String(a.tdsPct)),
            tdsAmt: toNum(String(a.tdsAmt)),
            net: null,
            status: tdsStatus(toNum(String(a.tdsAmt))),
            remarks: a.remarks ?? v.remarks ?? "",
          });
        }
      } else if (toNum(String(v.tdsAmt)) > 0) {
        out.push({
          date: v.voucherDate.toISOString(),
          module: "PAYMENT VOUCHER",
          section: "",
          party: p?.name ?? "",
          pan: p?.pan ?? "",
          refNo: v.voucherNo,
          invoiceAmount: null,
          tdsPct: 0,
          tdsAmt: toNum(String(v.tdsAmt)),
          net: null,
          status: tdsStatus(toNum(String(v.tdsAmt))),
          remarks: v.remarks ?? "",
        });
      }
    }
    for (const c of chalans) {
      const p = partyById.get(c.brokerId);
      out.push({
        date: c.chalanDate.toISOString(),
        module: "CHALLAN (OWNER)",
        section: moduleSection.get("CHALAN") ?? "",
        party: p?.name ?? "",
        pan: p?.pan ?? "",
        refNo: c.chalanNo,
        invoiceAmount: toNum(String(c.totalChalanAmt)),
        tdsPct: toNum(String(c.tdsPct)),
        tdsAmt: toNum(String(c.tdsAmt)),
        net: toNum(String(c.grandTotal)),
        status: tdsStatus(toNum(String(c.tdsAmt))),
        remarks: c.remarks ?? "",
      });
    }
    for (const s of slips) {
      const p = s.ownerId ? partyById.get(s.ownerId) : undefined;
      out.push({
        date: s.slipDate.toISOString(),
        module: "BROKER SLIP (OWNER)",
        section: moduleSection.get("BROKER_SLIP") ?? "",
        party: p?.name ?? s.ownerName ?? "",
        pan: p?.pan ?? "",
        refNo: s.slipNo,
        invoiceAmount: toNum(String(s.vChalanAmt)),
        tdsPct: toNum(String(s.vTdsPct)),
        tdsAmt: toNum(String(s.vTdsAmt)),
        net: toNum(String(s.vNetAmt)),
        status: tdsStatus(toNum(String(s.vTdsAmt))),
        remarks: s.vRemarks ?? "",
      });
    }
    return {
      rows: out.sort((a, b) => String(a.date).localeCompare(String(b.date))),
      parties,
    };
  });

  let filtered: ReportRow[] = rows;
  if (searchParams.party) {
    const name = parties.find((p) => p.id === searchParams.party)?.name ?? "";
    filtered = filtered.filter((r) => r.party === name);
  }
  if (searchParams.module) filtered = filtered.filter((r) => r.module === searchParams.module);
  if (searchParams.q) {
    const q = searchParams.q.toLowerCase();
    filtered = filtered.filter((r) => String(r.refNo).toLowerCase().includes(q));
  }
  if (searchParams.tds) {
    filtered = filtered.filter((r) => String(r.tdsPct) === searchParams.tds?.trim());
  }
  if (searchParams.status) filtered = filtered.filter((r) => r.status === searchParams.status);

  const deductedCount = filtered.filter((r) => r.status === "DEDUCTED").length;
  const tdsTotal = filtered.reduce((s, r) => s + Number(r.tdsAmt ?? 0), 0);

  const filters: FilterDef[] = [
    { type: "text", key: "q", label: "Reference No..." },
    { type: "text", key: "tds", label: "TDS % (exact)..." },
    { type: "daterange", key: "date", label: "Date" },
    {
      type: "combobox",
      key: "party",
      label: "Party",
      options: parties.map((p) => ({ value: p.id, label: p.name })),
    },
    {
      type: "select",
      key: "module",
      label: "Module",
      options: [
        { value: "PAYMENT VOUCHER", label: "Payment Voucher" },
        { value: "CHALLAN (OWNER)", label: "Challan (Owner)" },
        { value: "BROKER SLIP (OWNER)", label: "Broker Slip (Owner)" },
        { value: "JOURNAL VOUCHER", label: "Journal Voucher" },
      ],
    },
    {
      type: "select",
      key: "status",
      label: "TDS Status",
      options: [
        { value: "DEDUCTED", label: "Deducted" },
        { value: "NOT DEDUCTED", label: "Not Deducted" },
      ],
    },
  ];

  return (
    <div className="space-y-4">
      <FilterBar filters={filters} />
      <SimpleReport
        title={`${filtered.length} transaction${filtered.length === 1 ? "" : "s"} — ${deductedCount} with TDS deducted, ${filtered.length - deductedCount} without — ₹${tdsTotal.toLocaleString("en-IN")} TDS`}
        columns={[
          { key: "date", header: "Date", kind: "date" },
          { key: "refNo", header: "Reference No" },
          { key: "module", header: "Module", kind: "badge" },
          { key: "section", header: "TDS Section" },
          { key: "party", header: "Party / Owner" },
          { key: "pan", header: "PAN" },
          { key: "invoiceAmount", header: "Bill Amount", kind: "money" },
          { key: "tdsPct", header: "TDS %" },
          { key: "tdsAmt", header: "TDS Amount", kind: "money" },
          { key: "status", header: "TDS Status", kind: "badge" },
          { key: "remarks", header: "Remarks" },
        ]}
        rows={filtered}
        fileName="tds-payable-register"
        emptyMessage="No TDS-eligible payments in this period."
      />
    </div>
  );
}
