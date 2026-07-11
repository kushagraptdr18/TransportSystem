# TransportTMS — Code Conventions

## Stack
Next.js 14 App Router (src dir), TypeScript, Tailwind + shadcn-style primitives in `src/components/ui`, Prisma 6 + PostgreSQL (RLS), vitest.

## Multi-tenancy
- NEVER use `prisma` directly for tenant data. Always `withTenant(session.tenantId, tx => ...)` from `src/lib/db.ts`. RLS enforces isolation; the wrapper sets `app.tenant_id`.
- Every created row must include `tenantId` (and `firmId`, `fyId` for documents).

## Sessions & authz
- Server components/actions: `requireSession()` from `src/lib/session.ts` → `{userId, tenantId, firmId, fyId, role, ...}`.
- Mutations: `await authorize(session, "<module>", "<action>")` from `src/lib/authz.ts`. Module keys: masters, lr, chalan, loading, delivery, crossing, hireslip, summary, pod, billing, broker, vouchers, trips, maintenance, reports, settings.
- Audit every mutation: `audit(tx, session, {entity, entityId, action, before, after})`.

## Document numbers
- `nextDocNumber(tx, {tenantId, firmId, fyId, docType})` for auto numbers; `syncSequenceTo` after saving a manually-edited number; `peekDocNumber` for form prefill. Invoice numbers (billing) are ALWAYS manual — never call sequence for InvoiceKind PART_TRUCK/FULL_TRUCK/MANUAL/GST.

## Calculations
- All money math in `src/lib/calc/*` (pure, unit-tested). Client forms compute live with the same functions; server actions recompute before saving (never trust client totals).
- TDS from PAN: `tdsPctFromPan(pan, mode)`; GST split: `gstSplit`; basis amounts: `amountByBasis`.

## Server actions pattern
```ts
"use server";
export async function saveThing(input: unknown) {
  const session = requireSession();
  await authorize(session, "lr", "create");
  const data = schema.parse(input);        // zod
  return withTenant(session.tenantId, async (tx) => {
    // recompute totals via calc lib, insert, audit
  });
}
```
Return `{ok: true, id}` or `{ok: false, error}` — do not throw across the wire for expected validation errors.

## Pages
- Registers/list pages: server component reads `searchParams`, queries with filters, renders `<FilterBar/>` + `<DataTable/>` + `<ExportButton/>`. Print via `/print/...` routes (server-rendered, `.no-print` class hides chrome).
- Entry forms: client component + react-hook-form + zod; MasterCombobox for all master lookups (inline create); DateInput dd/mm/yyyy; Enter advances to next field.
- Soft delete: set `deletedAt`, exclude `deletedAt: null` in queries; only role ADMIN/OWNER may delete.

## UI
- Table numbers right-aligned, formatted `formatMoney`; dates `formatDate` (dd/mm/yyyy).
- Status badges: LR status/type, POD status, voucher type.
- Every register: totals footer for numeric columns.
