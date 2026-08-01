import { ArrowLeftRight, BookOpen, Download, Upload } from "lucide-react";
import type { VoucherType } from "@prisma/client";

export type VType = VoucherType;

/**
 * Labels, hints and icons for the four voucher types.
 *
 * Kept OUT of the entry component: that module is "use client", and a server
 * component cannot read a property off a client module — it may only pass the
 * imported name through. The vouchers page builds its tab strip from this, so
 * it has to live somewhere both sides can read.
 */
export const TYPE_META: Record<VType, { title: string; hint: string; icon: React.ReactNode }> = {
  RECEIPT: {
    title: "Receipt",
    hint: "Money IN — from any ledger (party, broker, owner, driver, staff...)",
    icon: <Download className="h-4 w-4" />,
  },
  PAYMENT: {
    title: "Payment",
    hint: "Money OUT — to any ledger (owner, supplier, broker, driver, staff...)",
    icon: <Upload className="h-4 w-4" />,
  },
  JOURNAL: {
    title: "Journal",
    hint: "Ledger ↔ ledger — debit/credit notes, transfers, write-offs (no cash/bank)",
    icon: <BookOpen className="h-4 w-4" />,
  },
  CONTRA: {
    title: "Contra",
    hint: "Bank ↔ Cash / Bank ↔ Bank internal transfer",
    icon: <ArrowLeftRight className="h-4 w-4" />,
  },
};
