# Testing Strategy

| Layer             | Tool                                                   | Scope                                                                                                                                      | Runs                                         |
| ----------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| Unit              | **Vitest**                                             | Pure logic: money, numbering formatters, permission resolution, Zod schemas, services with fakes, React hooks/components (Testing Library) | Every PR                                     |
| Integration (API) | **Vitest + Testcontainers** (real Postgres 17, Valkey) | Repositories, guards, controllers via Fastify `inject`, migrations apply cleanly                                                           | Every PR                                     |
| End-to-end        | **Playwright**                                         | Critical user journeys in the browser against web + api + docker services                                                                  | PRs touching web/api (smoke), nightly (full) |
| Contract          | `pnpm gen:api-client` diff                             | Generated client matches the API's OpenAPI                                                                                                 | Every PR                                     |

## What must be tested

- **Authorization:** every guarded endpoint has a test for 403 without the permission and 2xx with it.
- **Tenancy:** cross-workspace access returns 404 (never data from another workspace).
- **Money & numbering:** rounding, currency handling, concurrent number issuance is gap-free.
- **Entitlements:** limit reached → plan-limit problem+json.
- **Migrations:** applied from scratch in integration tests.

## Critical E2E journeys

1. Sign up → verify email (Mailpit) → workspace created with Owner role.
2. Invite member → accept → member sees only permitted UI.
3. Create custom role → assign → guarded action 403 → grant → 200.
4. (Phase 1) Create client → quote → convert to invoice → issue → record payment → receipt.

## Conventions

- Test files next to code: `*.spec.ts` (api), `*.test.ts(x)` (packages, web).
- Integration tests: `*.int-spec.ts`, one Postgres container per test file (or per worker) with migrations applied; isolate tests by unique workspace per test rather than truncating.
- Factories/builders for test data (`createTestWorkspace()`, `createTestMember({ permissions })`).
- No mocking of Drizzle in integration tests — use the real DB.
- Avoid snapshot tests except for small, stable outputs (e.g. email HTML).

## Commands

```bash
pnpm test                         # all unit + integration (turbo)
pnpm --filter api test            # one package
pnpm --filter web test:e2e        # Playwright (requires infra:up)
```

Coverage is informative, not a gate; focus on the "must be tested" list above.
