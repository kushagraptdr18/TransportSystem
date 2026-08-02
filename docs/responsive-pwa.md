# Responsive & PWA Work

_Last updated: 2 Aug 2026_

Record of what was done to make the app usable on a phone, and the one piece
that was deliberately deferred. Written as a backlog note for whoever picks up
the deferred item — including what it costs and why it was not done in the same
pass.

---

## 1. What is implemented today

| Piece | Where | Notes |
| --- | --- | --- |
| Mobile menu as a real drawer | `src/components/app/top-nav.tsx` | Portalled to `<body>`. See §2 - it was previously clipped inside the header. Overlay, Esc / overlay-click to close, body scroll locked while open. |
| Firm / FY switcher on mobile | drawer header, same file | The header chip is `hidden` below `sm`, so on a phone there was no way to see or change the active firm outside the avatar menu. |
| Viewport & PWA metadata | `src/app/layout.tsx` | `viewportFit: "cover"`, `themeColor` per colour scheme matched to `--card`, `appleWebApp` metadata. |
| Safe-area insets | header, drawer, `src/components/app/app-shell.tsx` | Insets go on a wrapper around `<main>`, not on `<main>` itself, so they add to `p-4` / `md:p-6` rather than overriding it. |
| Wide tables contained | `min-w-0` on `Card` and the `DataTable` root | `Table` already had `overflow-auto`, but flex/grid parents default to `min-width: auto` and refuse to shrink, so the overflow escaped upward and scrolled the whole page sideways. |
| Touch tap targets | `@media (pointer: coarse)` in `src/app/globals.css` | 40 px minimum. Gated on the input device, not a breakpoint - the distinction is thumb vs mouse, not window width, so desktop density is unchanged and resizing a desktop browser never triggers it. |
| Sticky first column | `DataTable`, `stickyFirstColumn` prop (default `true`) | Below `lg` only. Keeps the reference number visible while a wide register scrolls sideways. `lg:static` turns it off on desktop, where tables usually fit and a detaching column would be an unrequested change. Pass `false` for narrow tables that never overflow. |
| Collapsible filters on mobile | `src/components/data/filter-bar.tsx` | Below `md` the controls collapse behind one **Filters** button carrying a count badge. **The active-filter chips stay outside the collapse deliberately** - see §3. |

## 2. The header clipping bug, for the record

The mobile menu rendered but was trapped inside the header strip rather than
covering the screen. The header carries `backdrop-blur`, and an element with a
non-`none` `backdrop-filter` **becomes the containing block for its `fixed`
descendants**. The panel's `inset-0` therefore resolved to the header box, not
the viewport.

Nothing about the breakpoints or the markup was wrong. If a fixed-position
element is ever added inside the header again, it needs the same portal.

## 3. Standing rule: never hide *what* is filtered

The filter **controls** may collapse on a small screen. The chips showing which
filters are active may not.

A register figure means something different under a different date range or
party filter. Someone reading a total without noticing an active filter is a
plausible route to a wrong number being quoted, and that is a business error,
not a UI annoyance. Any future work that reorganizes `FilterBar` must keep the
chip row unconditionally visible.

---

## 4. Deferred: card mode in `DataTable`

**Status:** not built. Everything below is design notes, not description of
existing code.

### 4.1 What it is

Below `md`, `DataTable` renders each row as a stacked card of label/value pairs
instead of a wide table:

```
┌──────────────────────────────┐
│ CH-1043            [Pending] │
│ Date         29-07-2026      │
│ Broker       Gupta Carriers  │
│ Freight            62,000    │
│ Balance            27,000    │
└──────────────────────────────┘
```

Above `md` the output is byte-identical to today.

### 4.2 Why it is worth doing

On a 390 px screen a register shows roughly four of its columns. The chalan
number is in the first, and status and balance - the two things a register is
opened to check - are far enough right that they are never on screen at the
same time as the number they belong to. The sticky first column (§1) helps, but
the user is still scrolling sideways per row.

### 4.3 Why it was deferred rather than shipped alongside the rest

Not a design concern - a blast-radius one. Every register in the app renders
through this one component, so a mistake surfaces on all of them at once
instead of on one page. Non-exhaustively:

`chalan/register`, `lr/register`, `billing/register`, `broker/register`,
`pod/register`, `accounts/ledger`, `accounts/outstanding`, `accounts/tds`,
`accounts/advances`, `accounts/shortage`, `accounts/vouchers`,
`accounts/cash-book`, `accounts/bank-book`, `vehicle/management`,
`vehicle/driver-management`, `vehicle/tyres`, `trips`, `reports/*`,
`settings/audit`.

**Ship it as its own commit, containing nothing else**, so it can be reverted on
its own if a register misbehaves.

### 4.4 Design constraints for whoever builds it

1. **Opt-in per table, not automatic.** A two-column master list gains nothing
   from cards, and the columns worth putting on a card differ per register. Add
   a `cardMode` prop, default `false`.

2. **Column meta drives the card**, following the existing
   `DataTableColumnMeta` convention in `src/components/data/data-table.tsx`:

   - `card.title` - the value rendered as the card heading (chalan no, LR no)
   - `card.badge` - rendered as a pill top-right (status)
   - `card.hide` - omitted from the card entirely
   - everything else becomes a label/value pair, in column order

3. **Totals must survive.** `hasTotals` currently renders a `TableFooter`. In
   card mode it needs an equivalent summary block, or the totals silently
   disappear on mobile - which is the same class of error as §3.

4. **Sorting and pagination stay.** They are outside the table element already,
   so this mostly means not breaking them; the sort control needs a mobile
   affordance since there are no column headers to click.

5. **`onRowClick` must keep working** - the whole card is the tap target.

6. Right-aligned `meta.numeric` values stay right-aligned in the pair list, with
   `tabular-nums`, so amounts still line up down the card.

---

## 5. Not planned

**Offline data entry** - queueing chalans or vouchers created offline and
syncing them later. This needs conflict resolution against the settlement,
advance and shortage engines (`src/lib/settlement.ts`, `src/lib/party-advance.ts`,
`src/lib/shortage.ts`), all of which recompute live positions inside a
transaction and assume a single authoritative present state. It is a project in
its own right, not a PWA configuration task, and should not be attempted as an
incremental addition.

**Service worker / installability** - manifest, icons and a service worker were
scoped as Phase 4 and are not built. If added: precache the shell and static
assets only. Register and ledger responses must **not** be cached - stale
accounting data displayed as current is worse than an offline error.
