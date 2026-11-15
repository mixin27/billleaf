# Web (`apps/web`)

Decision: [ADR-0009 TanStack Query + Zustand](../adr/0009-tanstack-query-zustand.md)

> **Next.js 16 differs from older versions.** Read `apps/web/node_modules/next/dist/docs/` before writing code (route-protection file conventions, caching APIs, async `params`, etc.). See the root `AGENTS.md`.

## Stack

Next.js 16 (App Router) · React 19 · Tailwind 4 · shadcn (Base UI) via `@workspace/ui` · hugeicons · TanStack Query · Zustand · `nuqs` · react-hook-form + Zod · `better-auth/react`.

## Rendering model

- The product is mostly interactive behind auth: **RSC for layout/shell**, **client components + TanStack Query** for data.
- Session check in Next 16's request-interception file (per the local v16 docs) for redirects, plus server-side `getSession` in layouts. This is UX only — the API is the authority.

## State — one home per kind

| Kind            | Tool                                                      | Examples                                    |
| --------------- | --------------------------------------------------------- | ------------------------------------------- |
| Server state    | TanStack Query (query-key factories per feature)          | clients list, invoice detail, `/me`         |
| Client/UI state | Zustand (small, feature-local stores)                     | sidebar, wizards, invoice line editor draft |
| URL state       | `nuqs`                                                    | filters, pagination cursor, active tab      |
| Form state      | react-hook-form + Zod schemas from `@workspace/contracts` | create invoice form                         |

Never copy server data into Zustand.

## Structure

```
apps/web/
├─ app/
│  ├─ (auth)/sign-in, sign-up, verify, …
│  ├─ (app)/[workspaceSlug]/dashboard, clients, invoices, …, settings/   ← thin route files
│  ├─ layout.tsx
│  └─ providers.tsx        QueryClientProvider, theme, …
├─ features/<feature>/
│  ├─ api/          keys.ts, queries.ts, mutations.ts (wrap @workspace/api-client)
│  ├─ components/
│  ├─ hooks/  stores/  schemas/  utils/
│  └─ index.ts      public surface — other code imports only from here
├─ components/      app-wide composites (app shell, sidebar, data-table, permission-gate)
├─ lib/             auth-client, api client instance, query-client, env
└─ config/          nav, site
```

## Rules

- **Feature boundaries (ESLint):** `features/a` must not deep-import `features/b/*`; use `features/b` (its `index.ts`). `app/` imports features only.
- **Route files are thin:** fetch params, render a feature component.
- `@workspace/ui` stays generic (shadcn primitives); product composites live in the app.
- **Permission gating:** `/me` returns the effective permission keys for the active workspace; `<PermissionGate permission="invoice.create">` hides UI. Cosmetic only.
- **API calls** only through `@workspace/api-client` (typed from OpenAPI), with `credentials: "include"`.

See also: [Adding a module](../engineering/adding-a-module.md) · [Conventions](../engineering/conventions.md)
