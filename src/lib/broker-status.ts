/** Broker slip balance status labels — Pending / Partially / Fully, per side. */
export function brokerBalanceStatus(args: {
  side: "P" | "V";
  paymentStatus: string; // PENDING | RECEIVED | PAID
  paidAmount: number;
  roundOff: number;
  shortage: number;
  balance: number;
}): string {
  const verb = args.side === "P" ? "Received" : "Paid";
  if (args.paymentStatus === "PENDING") return "Pending";
  const settled = args.paidAmount + args.roundOff + args.shortage;
  return settled + 0.01 >= args.balance ? `Fully ${verb}` : `Partially ${verb}`;
}
