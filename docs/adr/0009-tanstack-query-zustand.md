# ADR-0009: TanStack Query for server state, Zustand for client state

- **Status:** Accepted
- **Date:** 2026-11-15
- **Deciders:** Billleaf founding team

## Context

The product UI is highly interactive behind auth (tables, editors, wizards). We need caching, invalidation and optimistic updates for API data, plus lightweight local UI state.

## Decision

In `apps/web`: **TanStack Query** owns all server state (query-key factories per feature); **Zustand** owns client/UI-only state (sidebar, wizards, draft builders); **`nuqs`** owns URL state; **react-hook-form + Zod** owns forms. RSC renders layout/shell; data views are client components. Code is organized in `features/<feature>` with a public `index.ts`.

## Consequences

- Clear "one home per kind of state" rule; less accidental duplication.
- Works identically in the future Expo app (TanStack Query + Zustand both support React Native).
- Less use of RSC data fetching than a content site would have — acceptable for an authenticated app.

## Alternatives considered

- **Redux Toolkit / RTK Query** — more boilerplate.
- **RSC + server actions for all data** — awkward for rich client interactions and not reusable on mobile.
- **SWR** — lighter, fewer mutation/invalidation features.
