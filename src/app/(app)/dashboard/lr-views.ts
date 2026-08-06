export type LrView =
  | "TOTAL"
  | "RECEIVED"
  | "PENDING"
  | "NO_CHALAN"
  | "BILLED"
  | "RECEIVED_UNBILLED"
  | "UNBILLED";

export const LR_VIEW_META: Record<LrView, { title: string; info: string }> = {
  TOTAL: {
    title: "Total LR",
    info: "All active LRs this FY (excluding cancelled/paper-change) — count and freight total.",
  },
  RECEIVED: {
    title: "Received LR",
    info: "LRs whose POD has been received/uploaded (from the POD module).",
  },
  PENDING: { title: "Pending LR", info: "LRs whose POD has not been received yet." },
  NO_CHALAN: {
    title: "LR Pending for Challan",
    info: "LRs not yet placed on any active challan.",
  },
  BILLED: { title: "LR Billed", info: "LRs whose bill has been generated (from the billing module)." },
  RECEIVED_UNBILLED: {
    title: "LR Received but Bill Pending",
    info: "POD received but the bill has not been generated yet.",
  },
  UNBILLED: {
    title: "LR Pending Bill Amount",
    info: "LRs whose bill is still pending — count and freight amount.",
  },
};
