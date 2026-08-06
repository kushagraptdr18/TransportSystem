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
    info: "Is FY ke sabhi active LR (cancelled/paper-change chhod kar) — count aur freight total.",
  },
  RECEIVED: {
    title: "Received LR",
    info: "Jin LRs ki POD receive/upload ho chuki hai (POD module se).",
  },
  PENDING: { title: "Pending LR", info: "Jin LRs ki POD abhi tak receive nahi hui." },
  NO_CHALAN: {
    title: "LR Pending for Challan",
    info: "Jin LRs par abhi tak koi active chalan nahi bana.",
  },
  BILLED: { title: "LR Billed", info: "Jin LRs ka bill ban chuka hai (billing module se)." },
  RECEIVED_UNBILLED: {
    title: "LR Received but Bill Pending",
    info: "POD aa gayi par bill abhi tak nahi bana.",
  },
  UNBILLED: {
    title: "LR Pending Bill Amount",
    info: "Jin LRs ka bill abhi tak pending hai — count aur freight.",
  },
};
