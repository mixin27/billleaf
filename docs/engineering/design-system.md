# Design system

How Billleaf looks and how pages are put together. The brand is **calm, trustworthy, efficient**: restrained colour, clear typography, generous whitespace. When in doubt, remove rather than add.

## Building blocks

| Layer      | Where                                                                         | Rule                                                                                          |
| ---------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Primitives | `packages/ui/src/components` (shadcn, **Base UI** flavour, `base-nova` style) | Generic only. Add with `packages/ui/node_modules/.bin/shadcn add <name>` run from `apps/web`. |
| Composites | `apps/web/components` (layout, page header, command menu, data table, forms)  | Product-aware but feature-neutral.                                                            |
| Feature UI | `apps/web/features/<feature>/components`                                      | Everything specific to one module.                                                            |

**Base UI notes:** compose with `render={<Link href=… />}` (there is no `asChild`). A `Button` that renders a link also needs `nativeButton={false}`. A `Select` needs `items` so the trigger can show labels. A `DropdownMenuLabel` must sit inside a `DropdownMenuGroup`.

**Icons:** [Hugeicons](https://hugeicons.com) free set via `<HugeiconsIcon icon={…} strokeWidth={1.8} />`. Use them in navigation, menus and empty states; keep body text and table cells icon-free unless the icon carries meaning.

## Tokens

Defined as CSS variables in `packages/ui/src/styles/globals.css` (Tailwind v4 `@theme inline`), in light and `.dark` variants. Always use the semantic classes (`bg-background`, `text-muted-foreground`, `border`, `bg-primary`…), never raw colours.

- **Tag colours** (`features/time/components/tag-chip.tsx`) are the one exception to "no raw colours": they're user-chosen identity labels from a fixed palette, always shown with their name.
- **Colour:** neutral greys + one **leaf green** primary (`--primary`, used for primary actions, active state and focus). Charts use the green ramp `chart-1…5`. Red (`destructive`) is only for errors, overdue and irreversible actions.
- **Sidebar:** `--sidebar*` tokens. A faintly green-tinted grey that sits _behind_ the content panel (lighter panel in light mode, darker sidebar in dark mode).
- **Radius:** `--radius: 0.45rem` (the `rounded-*` scale derives from it).
- **Type:** Inter (`--font-sans`), Geist Mono for codes and numbers where alignment matters.
  - Page title: `text-xl sm:text-2xl font-semibold tracking-tight`.
  - Section title: `text-base font-semibold`.
  - Body: `text-sm`; small print `text-xs text-muted-foreground`.
  - Money and durations: `tabular-nums`.
- **Theme:** light, dark and system (user menu, ⌘K, or the `d` key). Check every new surface in both.

## App shell

```
┌ Sidebar (inset · collapses to icons · drawer on mobile) ┬ Inset panel ─────────────────────────┐
│ Workspace switcher (plan)                               │ ☰ │ Section › Page        (top bar)   │
│ Search ⌘K                                               ├───────────────────────────────────────┤
│ Timer (start · live clock · stop)                       │ PageHeader                            │
│ Home                                                    │ content                               │
│ SELL Clients · Quotes · Contracts                       │                                       │
│ WORK Projects · Time                                    │                                       │
│ GET PAID Invoices · Recurring · Payments                │                                       │
│ Settings · User menu (theme, sign out)                  │                                       │
└─────────────────────────────────────────────────────────┴───────────────────────────────────────┘
```

- **Shell:** `components/layout/app-shell.tsx` (`SidebarProvider` + `AppSidebar` + `SidebarInset`).
  - The collapsed state is stored in the `sidebar_state` cookie and read by the workspace layout, so there's no flash on load.
  - `⌘B` toggles the sidebar.
- **Navigation:** `config/nav.ts`, grouped in journey order with an icon per item.
  - Items are filtered by permission in `use-nav.ts`.
  - The longest matching route wins, so `/invoices/recurring` highlights _Recurring_.
  - Add a route to the nav only if it's a top-level destination.
- **Breadcrumbs:** the section comes from the nav; the page name comes from `PageHeader` (string titles, or the `breadcrumb` prop).
- **Command menu (⌘K):** `components/layout/command-menu.tsx`. It has go-to entries for every nav item, permission-aware create actions, timer start/stop and theme. Open it from code with `useCommandMenu().setOpen(true)`.
- **Create dialogs:** list pages that create in a dialog open it from `?new=true`, so the command menu can link to them.

## Page anatomy

Every page starts with **`PageHeader`** (`components/page-header.tsx`):

```tsx
<PageHeader
  title={invoice.number ?? "Draft invoice"}
  badge={<InvoiceStatusBadge status={invoice.displayStatus} />}
  description="Monthly retainer"
  meta={<>From quote <Link …>QUO-0001</Link></>}
  actions={<><Button variant="outline">Edit</Button><Button>Send</Button></>}
/>
```

- **One primary action** per page (solid button); secondary actions are `outline`, and rare ones go in a **More** menu.
- **Destructive actions** go at the end of the More menu (`variant="destructive"`) and always confirm with an `AlertDialog`, saying what happens and whether it can be undone.
- **No back links** in content: the breadcrumbs and the sidebar cover navigation.

**List pages:** `PageHeader` → toolbar (search, filters, view options, primary "New …" on the right) → table → pagination. Empty states are a dashed box with one sentence on what the thing is and the primary action. With filters active, say "No matching …" and offer to reset.

**Data tables** (`components/data-table`, TanStack Table v9 in manual mode):

- **State:** `useDataTableState()` keeps page, size, sort and search in the URL. Fetch with `{ ...table.query, ...filters }` and pass `data`, `total` and `state` to `<DataTable>`.
- **Columns:** define them with `columnsFor<Row>()`.
  - A column is sortable only with `enableSorting: true`, and its id must be an API sort field.
  - Use `<DataTableColumnHeader>` for sortable headers.
  - `meta.label` puts the column in the View menu; `meta.hideBelow` hides it on small screens; `meta.align: "right"` for amounts.
- **Toolbar:** `<DataTableToolbar>` takes search, filters (`DataTableSelectFilter` for a status) and actions such as "New …".
- **Empty states:** use `DataTableEmpty`.
- **Rows:** `getRowHref` opens the row on click or Enter; ⌘-click opens it in a new tab.
- **Small screens:** fold secondary info under the first column (e.g. the client under the number) instead of scrolling sideways.

**Detail pages:** `PageHeader` (number/name + status badge, related-record links in `meta`) → key facts as a `dl` grid → the document or body → related lists.

**Forms:** `Field` (label, hint, error) in a responsive grid (`sm:grid-cols-2 lg:grid-cols-3`). Long text spans full width. Actions go bottom-right: Cancel (outline) then Save (primary). Validate inline and toast only on submit errors.

**Feedback:** `sonner` toasts for results ("Invoice sent"), and inline messages for blocking problems. Plan limits add a "See plans" prompt automatically.

## Responsive

- The sidebar becomes a drawer below `md` (768px).
- Tables hide secondary columns below `sm`/`md` and never scroll the page sideways.
- Headers wrap their actions under the title on small screens.
- Test at **375px** and desktop width.

## Accessibility

- Every interactive element is reachable and operable by keyboard. Icon-only buttons have an `aria-label` (and a tooltip in the collapsed sidebar).
- Status is never shown by colour alone: badges have text, and charts have labels or tables.
- Respect `prefers-reduced-motion`: animations are short fades, and the pulsing timer dot is the only loop.
