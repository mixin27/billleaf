<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# apps/web — Next.js 16 product app

Read the root `AGENTS.md` first, and the Next.js docs in
`node_modules/next/dist/docs/` before using any Next API (Next 16 renamed
middleware to **`proxy.ts`**, `params`/`searchParams` are Promises, etc.).

## Layout

```
app/                      thin route files only — compose features, no logic
  (auth)/                 sign-in, sign-up, verify-email
  (app)/onboarding        create first workspace
  (app)/[workspaceSlug]/  WorkspaceGate + AppShell (inset sidebar), then pages
  providers.tsx           Theme, TanStack Query, nuqs, Toaster
features/<feature>/
  api/                    keys.ts (query-key factory), queries.ts, mutations.ts
  components/             feature UI
  stores/                 zustand (client-only state)
  index.ts                public surface — import other features ONLY from here
components/               app-wide composites (layout, permissions/Can)
lib/                      env, auth-client (Better Auth), api (typed client), query-client
config/                   nav, site
proxy.ts                  optimistic session-cookie redirect (no data fetching)
```

## State rules

- **Server state → TanStack Query** (always via the typed `api` client + `unwrap`).
  Keys come from the feature's `keys.ts` and include the workspace id.
- **Client/UI state → Zustand** (e.g. active workspace, draft builders).
- **URL state → nuqs** (selected tab/row, filters, pagination).
- **Forms → react-hook-form + zodResolver**, schemas from `@workspace/contracts` when they exist.

## Auth & permissions

- Better Auth client in `lib/auth-client.ts` talks to the API (`/api/auth`).
- `useMe()` returns the member's permissions; gate UI with `<Can permission="…">`.
  This is cosmetic — the API enforces everything.
- After changing API routes run `pnpm gen:api-client` to refresh types.

## UI

Read `docs/engineering/design-system.md` first (tokens, shell, PageHeader, page anatomy).

- Primitives from `@workspace/ui/components/*`; add new ones with
  `packages/ui/node_modules/.bin/shadcn add <name>` (run from `apps/web`).
- Product-specific composites stay in this app, not in `packages/ui`.
