import { round2 } from "./tds";

export function tripLegTotal(freight: number, hamali: number, others: number): number {
  return round2(freight + hamali + others);
}

export function tripLegBalance(
  totalFreight: number,
  diesel: number,
  driverAdvance: number,
  partyAdvance: number,
  other: number
): number {
  return round2(totalFreight - diesel - driverAdvance - partyAdvance - other);
}

export function tripProfit(income: number, tripExpenses: number[]): number {
  return round2(income - tripExpenses.reduce((s, e) => s + e, 0));
}

export function vehicleNetPl(
  totalIncome: number,
  tripExpenseTotal: number,
  vehicleExpenseTotal: number
): number {
  return round2(totalIncome - tripExpenseTotal - vehicleExpenseTotal);
}
