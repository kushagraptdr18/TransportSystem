import {
  LayoutDashboard,
  Database,
  FileText,
  Truck,
  ClipboardCheck,
  ReceiptText,
  Handshake,
  Wallet,
  Wrench,
  BarChart3,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
}

export interface NavGroup {
  label: string;
  icon: LucideIcon;
  href?: string;
  items?: NavItem[];
}

export const NAV: NavGroup[] = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
  {
    label: "Masters",
    icon: Database,
    items: [
      { label: "Ledger / Parties", href: "/masters/parties" },
      { label: "Bank & Cash Heads", href: "/masters/bank-cash-heads" },
      { label: "Income-Expense Heads", href: "/masters/account-heads" },
      { label: "Product Groups", href: "/masters/product-groups" },
      { label: "Products", href: "/masters/products" },
      { label: "States", href: "/masters/states" },
      { label: "Cities", href: "/masters/cities" },
      { label: "Vehicles", href: "/masters/vehicles" },
      { label: "Driver Master", href: "/masters/drivers" },
      { label: "Units", href: "/masters/units" },
      { label: "Rate Setup", href: "/masters/rates" },
      { label: "Document Master", href: "/masters/document-master" },
      { label: "Document Registration", href: "/masters/vehicle-documents" },
    ],
  },
  {
    label: "Booking",
    icon: FileText,
    items: [
      { label: "LR Entry", href: "/lr" },
      { label: "Multiple LR Entry", href: "/lr/multiple" },
      { label: "LR Register", href: "/lr/register" },
    ],
  },
  {
    label: "Fleet Ops",
    icon: Truck,
    items: [
      { label: "Chalan Entry", href: "/chalan" },
      { label: "Chalan Register", href: "/chalan/register" },
      { label: "Loading Challan", href: "/loading-chalan" },
      { label: "Unloading / Arrival", href: "/arrival" },
      { label: "Delivery (Gate Pass / Cash Memo)", href: "/delivery" },
      { label: "Crossing", href: "/crossing" },
      { label: "Outward Crossing", href: "/outward-crossing" },
      { label: "Hire Slip", href: "/hire-slip" },
      { label: "Summary Entry", href: "/summary" },
    ],
  },
  {
    label: "POD",
    icon: ClipboardCheck,
    items: [
      { label: "POD Confirmation", href: "/pod" },
      { label: "POD Register", href: "/pod/register" },
    ],
  },
  {
    label: "Billing",
    icon: ReceiptText,
    items: [
      { label: "Billing (Part Truck)", href: "/billing/part-truck" },
      { label: "Billing (Full Truck)", href: "/billing/full-truck" },
      { label: "Billing (Manual)", href: "/billing/manual" },
      { label: "GST Invoice", href: "/billing/gst" },
      { label: "Bill Submission", href: "/billing/submission" },
      { label: "Billing Register", href: "/billing/register" },
      { label: "Rate Change Register", href: "/billing/rate-change" },
      { label: "Trip Closure Intimation", href: "/billing/trip-closure" },
    ],
  },
  {
    label: "Broker",
    icon: Handshake,
    items: [
      { label: "Broker Slip Entry", href: "/broker/slip" },
      { label: "Broker Register", href: "/broker/register" },
      { label: "Courier Dispatch", href: "/broker/courier" },
    ],
  },
  {
    label: "Accounts",
    icon: Wallet,
    items: [
      { label: "Vouchers (Receipt / Payment / Contra)", href: "/accounts/vouchers" },
      { label: "Voucher Register", href: "/accounts/vouchers/register" },
      { label: "Cash Book", href: "/accounts/cash-book" },
      { label: "Bank Book", href: "/accounts/bank-book" },
      { label: "Ledger Summary", href: "/accounts/ledger" },
      { label: "Outstanding (Receivables)", href: "/accounts/outstanding" },
      { label: "Outstanding Payables", href: "/accounts/payables" },
      { label: "TDS Payable Register", href: "/accounts/tds-report" },
      { label: "TDS Receivable Register", href: "/accounts/tds-receivable" },
      { label: "Advance Register", href: "/accounts/advances" },
      { label: "Staff Payroll & Advances", href: "/accounts/staff" },
      { label: "Office Income & Expense", href: "/accounts/office" },
      { label: "Profit & Loss", href: "/accounts/pnl" },
    ],
  },
  {
    label: "Vehicle",
    icon: Wrench,
    items: [
      { label: "Trip Sheets", href: "/trips" },
      { label: "Trip Expenses", href: "/vehicle/trip-expenses" },
      { label: "Vehicle Expenses", href: "/vehicle/expenses" },
      { label: "Vehicle Expense Summary", href: "/vehicle/expense-summary" },
      { label: "Tyre Management", href: "/vehicle/tyres" },
      // salary, +/- settlement, advance and F&F are tabs of one screen
      { label: "Driver Management", href: "/vehicle/driver-management" },
      { label: "AdBlue (Urea) Stock", href: "/vehicle/adblue" },
      { label: "Vehicle Tracking", href: "/vehicle/tracking" },
      { label: "Vehicle Profit & Loss", href: "/vehicle/pnl" },
    ],
  },
  {
    label: "Reports",
    icon: BarChart3,
    items: [
      { label: "All Registers", href: "/reports" },
      { label: "LR Register", href: "/lr/register" },
      { label: "Cancelled LR Report", href: "/reports/cancelled-lrs" },
      { label: "Paper Change LR Report", href: "/reports/paper-change-lrs" },
    ],
  },
  {
    label: "Settings",
    icon: Settings,
    items: [
      { label: "Firm Settings", href: "/settings/firm" },
      { label: "Users", href: "/settings/users" },
      { label: "Audit Log", href: "/settings/audit" },
    ],
  },
];
