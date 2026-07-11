import Link from "next/link";
import {
  BarChart3,
  BookOpen,
  ClipboardCheck,
  FileText,
  HandCoins,
  Landmark,
  ReceiptText,
  Scale,
  Truck,
  Users,
  Wallet,
  Wrench,
} from "lucide-react";
import { requireSession } from "@/lib/session";
import { Card, CardContent } from "@/components/ui/card";

const SECTIONS: { title: string; links: { label: string; href: string; icon: typeof FileText; desc: string }[] }[] = [
  {
    title: "Operations",
    links: [
      { label: "LR Register", href: "/lr/register", icon: FileText, desc: "All bookings with filters and totals" },
      { label: "Bilty Status", href: "/lr/status", icon: ClipboardCheck, desc: "Track a single LR end to end" },
      { label: "Chalan Register", href: "/chalan/register", icon: Truck, desc: "Freight chalans and balances" },
      { label: "POD Register", href: "/pod/register", icon: ClipboardCheck, desc: "Proof-of-delivery records" },
      { label: "Broker Register", href: "/broker/register", icon: Users, desc: "Broker slips, both sides" },
    ],
  },
  {
    title: "Billing",
    links: [
      { label: "Billing Register", href: "/billing/register", icon: ReceiptText, desc: "PT / FT / Manual / GST invoices" },
      { label: "Outstanding", href: "/accounts/outstanding", icon: Scale, desc: "Unpaid and partly-paid invoices" },
      { label: "Voucher Register", href: "/accounts/vouchers/register", icon: Wallet, desc: "Receipts, payments, contra" },
    ],
  },
  {
    title: "Accounts",
    links: [
      { label: "Cash Book", href: "/accounts/cash-book", icon: HandCoins, desc: "Cash accounts day book" },
      { label: "Bank Book", href: "/accounts/bank-book", icon: Landmark, desc: "Bank accounts day book" },
      { label: "Ledger Summary", href: "/accounts/ledger", icon: BookOpen, desc: "Party ledger with running balance" },
      { label: "TDS Report", href: "/accounts/tds", icon: Scale, desc: "TDS deducted across documents" },
      { label: "Profit & Loss", href: "/accounts/pnl", icon: BarChart3, desc: "Income vs expense summary" },
    ],
  },
  {
    title: "Fleet",
    links: [
      { label: "Vehicle Report", href: "/vehicle/report", icon: Wrench, desc: "Earnings vs running cost per vehicle" },
      { label: "Trip Expenses", href: "/vehicle/trip-expenses", icon: Truck, desc: "Consolidated trip expense lines" },
      { label: "Document Renewals", href: "/masters/vehicle-documents?due=30", icon: ClipboardCheck, desc: "Documents expiring in 30 days" },
    ],
  },
];

export default function ReportsHubPage() {
  requireSession();
  return (
    <div className="space-y-6 p-4">
      <h1 className="page-title">Reports &amp; Registers</h1>
      {SECTIONS.map((s) => (
        <div key={s.title} className="space-y-2">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            {s.title}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {s.links.map((l) => (
              <Link key={l.href} href={l.href} className="group">
                <Card className="h-full transition-all hover:border-primary/40 hover:shadow-card">
                  <CardContent className="flex items-start gap-3 p-4">
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <l.icon className="h-[18px] w-[18px]" />
                    </span>
                    <span>
                      <span className="block font-medium group-hover:text-primary">{l.label}</span>
                      <span className="block text-sm text-muted-foreground">{l.desc}</span>
                    </span>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
