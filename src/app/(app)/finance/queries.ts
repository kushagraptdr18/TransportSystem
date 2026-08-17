import { requireSession } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { round2 } from "@/lib/calc/tds";
import { toNum } from "@/lib/utils";
import { nextDueDate } from "@/lib/loan";

/**
 * Read models for the Finance module. Outstanding is always derived from the
 * instalments actually recorded — never stored — so it cannot drift from the
 * EMI register the way a running-balance column would.
 */

export interface LoanRow {
  id: string;
  loanNo: string;
  date: string;
  party: string;
  partyId: string;
  loanType: string;
  vehicle: string;
  vehicleId: string | null;
  amount: number;
  repaid: number;
  outstanding: number;
  interestPaid: number;
  emiAmount: number;
  emiCount: number;
  remainingEmis: number | null;
  nextDueDate: string | null;
  interestMode: string;
  interestRate: number;
  tdsApplicable: boolean;
  tdsPct: number;
  emiFrequency: string;
  emiStartDate: string | null;
  tenureMonths: number;
  purpose: string;
  remarks: string;
  status: string;
}

export interface EmiRow {
  id: string;
  loanId: string;
  loanNo: string;
  party: string;
  vehicle: string;
  emiNo: number;
  dueDate: string | null;
  payDate: string;
  principal: number;
  interest: number;
  penalty: number;
  otherAmt: number;
  tdsAmt: number;
  total: number;
  netPaid: number;
  isSettlement: boolean;
  voucherNo: string;
  remarks: string;
}

export interface FinanceTxnRow {
  id: string;
  voucherNo: string;
  date: string;
  direction: string;
  txnType: string;
  partyId: string;
  party: string;
  amount: number;
  entryType: string;
  bankPartyId: string;
  bank: string;
  remarks: string;
}

export async function getFinanceData(): Promise<{
  loans: LoanRow[];
  emis: EmiRow[];
  txns: FinanceTxnRow[];
}> {
  const session = requireSession();
  return withTenant(session.tenantId, async (tx) => {
    const scope = { firmId: session.firmId, fyId: session.fyId, deletedAt: null as null };
    const [loans, txns, parties, vehicles] = await Promise.all([
      tx.loan.findMany({
        // loans are long-lived: firm-scoped only, so a loan taken in an earlier
        // FY stays visible and payable after the year changes
        where: { firmId: session.firmId, deletedAt: null },
        include: { emis: { where: { deletedAt: null }, orderBy: { payDate: "asc" } } },
        orderBy: { date: "desc" },
      }),
      tx.financeTxn.findMany({ where: scope, orderBy: { date: "desc" } }),
      tx.party.findMany({ select: { id: true, name: true } }),
      tx.vehicle.findMany({ select: { id: true, number: true } }),
    ]);
    const partyName = new Map(parties.map((p) => [p.id, p.name]));
    const vehicleNo = new Map(vehicles.map((v) => [v.id, v.number]));

    const loanRows: LoanRow[] = loans.map((l) => {
      const amount = round2(toNum(String(l.amount)));
      const repaid = round2(l.emis.reduce((s, e) => s + toNum(String(e.principal)), 0));
      const emiAmount = round2(toNum(String(l.emiAmount)));
      const outstanding = round2(amount - repaid);
      // what is left to pay, at the loan's own instalment size
      const remainingEmis =
        emiAmount > 0 && outstanding > 0.009 ? Math.ceil(outstanding / emiAmount) : emiAmount > 0 ? 0 : null;
      const due =
        l.status === "CLOSED"
          ? null
          : nextDueDate(l.emiStartDate, l.emiFrequency, l.emis.length);
      return {
        id: l.id,
        loanNo: l.loanNo,
        date: l.date.toISOString(),
        party: partyName.get(l.partyId) ?? "",
        partyId: l.partyId,
        loanType: l.loanType,
        vehicle: l.vehicleId ? vehicleNo.get(l.vehicleId) ?? "" : "",
        vehicleId: l.vehicleId,
        amount,
        repaid,
        outstanding,
        interestPaid: round2(l.emis.reduce((s, e) => s + toNum(String(e.interest)), 0)),
        emiAmount,
        emiCount: l.emis.length,
        remainingEmis,
        nextDueDate: due ? due.toISOString() : null,
        interestMode: l.interestMode,
        interestRate: toNum(String(l.interestRate)),
        tdsApplicable: l.tdsApplicable,
        tdsPct: toNum(String(l.tdsPct)),
        emiFrequency: l.emiFrequency,
        emiStartDate: l.emiStartDate ? l.emiStartDate.toISOString() : null,
        tenureMonths: l.tenureMonths,
        purpose: l.purpose ?? "",
        remarks: l.remarks ?? "",
        status: l.status,
      };
    });

    const emiRows: EmiRow[] = loans.flatMap((l) =>
      l.emis.map((e) => ({
        id: e.id,
        loanId: l.id,
        loanNo: l.loanNo,
        party: partyName.get(l.partyId) ?? "",
        vehicle: l.vehicleId ? vehicleNo.get(l.vehicleId) ?? "" : "",
        emiNo: e.emiNo,
        dueDate: e.dueDate ? e.dueDate.toISOString() : null,
        payDate: e.payDate.toISOString(),
        principal: round2(toNum(String(e.principal))),
        interest: round2(toNum(String(e.interest))),
        penalty: round2(toNum(String(e.penalty))),
        otherAmt: round2(toNum(String(e.otherAmt))),
        tdsAmt: round2(toNum(String(e.tdsAmt))),
        total: round2(toNum(String(e.total))),
        netPaid: round2(toNum(String(e.netPaid))),
        isSettlement: e.isSettlement,
        voucherNo: e.voucherNo ?? "",
        remarks: e.remarks ?? "",
      }))
    );
    emiRows.sort((a, b) => b.payDate.localeCompare(a.payDate));

    const txnRows: FinanceTxnRow[] = txns.map((t) => ({
      id: t.id,
      voucherNo: t.voucherNo,
      date: t.date.toISOString(),
      direction: t.direction,
      txnType: t.txnType,
      partyId: t.partyId,
      party: partyName.get(t.partyId) ?? "",
      amount: round2(toNum(String(t.amount))),
      entryType: t.entryType,
      bankPartyId: t.bankPartyId,
      bank: partyName.get(t.bankPartyId) ?? "",
      remarks: t.remarks ?? "",
    }));

    return { loans: loanRows, emis: emiRows, txns: txnRows };
  });
}
