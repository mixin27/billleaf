---
name: new-web-feature
description: Scaffold a new feature folder in apps/web (Next.js 16) with TanStack Query hooks, optional Zustand store, components and thin route pages. Use when building UI for a Billleaf module (clients, invoices, …).
---

# New web feature

Before writing Next code, read the relevant guide in
`apps/web/node_modules/next/dist/docs/` (Next 16 differs from older versions).

## Steps

1. Make sure the API endpoints exist and the client is regenerated
   (`pnpm gen:api-client`). Never hand-write response types.
2. Create `apps/web/features/<feature>/`:
   - `api/keys.ts` — query-key factory; keys start with the feature name and include
     the workspace id: `["clients", workspaceId, "list", filters]`.
   - `api/queries.ts` — `useQuery` wrappers using `api.GET(...)` + `unwrap`,
     `enabled: Boolean(workspaceId)`.
   - `api/mutations.ts` — `useMutation` wrappers; invalidate the feature's keys on success.
   - `components/` — UI. Forms: react-hook-form + `zodResolver(schemaFromContracts)`.
     Lists: filters/pagination in the URL with `nuqs`.
   - `stores/` — only if there is real client-only state (e.g. a draft line-item editor).
   - `index.ts` — export only what other code needs.
3. Routes: `app/(app)/[workspaceSlug]/<feature>/page.tsx` (and `[id]/page.tsx`) that
   only compose feature components. Remember `params` is a Promise.
4. Gate actions with `<Can permission="<resource>.<action>">`; add a nav item with its
   `permission` in `config/nav.ts`.
5. Primitives from `@workspace/ui/components/*`. Add missing ones with
   `../../packages/ui/node_modules/.bin/shadcn add <name>` from `apps/web`.
6. Verify: `pnpm --filter web typecheck && pnpm --filter web lint`, then exercise the
   page in the browser with `pnpm dev` running.

Reference implementation: `apps/web/features/roles/`.
