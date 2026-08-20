/**
 * Permission registry shared by authorize() and the Role Permissions
 * dashboard. Keep MODULES in sync with the module strings passed to
 * authorize() across the app — a module missing here can still be enforced,
 * it just cannot be edited from the dashboard.
 */

export type Action = "view" | "create" | "edit" | "delete" | "print" | "export";

export const ACTIONS: { key: Action; label: string }[] = [
  { key: "view", label: "View" },
  { key: "create", label: "Create" },
  { key: "edit", label: "Edit" },
  { key: "delete", label: "Delete" },
  { key: "print", label: "Print" },
  { key: "export", label: "Export" },
];

/** every module string used with authorize(), with a readable label */
export const MODULES: { key: string; label: string }[] = [
  { key: "lr", label: "LR Entry" },
  { key: "loading", label: "Loading Chalan / Arrival" },
  { key: "chalan", label: "Freight Chalan" },
  { key: "crossing", label: "Crossing" },
  { key: "delivery", label: "Delivery / Cash Memo" },
  { key: "pod", label: "POD" },
  { key: "billing", label: "Billing" },
  { key: "hireslip", label: "Hire Slip" },
  { key: "broker", label: "Broker" },
  { key: "trips", label: "Trips" },
  { key: "maintenance", label: "Vehicle & Driver" },
  { key: "vouchers", label: "Accounts / Vouchers" },
  { key: "reports", label: "Reports" },
  { key: "tally", label: "Tally Export" },
  { key: "summary", label: "Summary" },
  { key: "masters", label: "Masters" },
  { key: "settings", label: "Settings" },
];

export type RoleKey = "OWNER" | "ADMIN" | "OPERATOR" | "ACCOUNTANT" | "VIEWER";

/** hard-coded fallback when neither a user override nor a role row exists */
export const ROLE_DEFAULTS: Record<RoleKey, Action[]> = {
  OWNER: ["view", "create", "edit", "delete", "print", "export"],
  ADMIN: ["view", "create", "edit", "delete", "print", "export"],
  OPERATOR: ["view", "create", "edit", "print", "export"],
  ACCOUNTANT: ["view", "create", "edit", "print", "export"],
  VIEWER: ["view", "print", "export"],
};

/** roles the dashboard may edit — OWNER always has everything (recovery path) */
export const EDITABLE_ROLES: RoleKey[] = ["ADMIN", "OPERATOR", "ACCOUNTANT", "VIEWER"];
