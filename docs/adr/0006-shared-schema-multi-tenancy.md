# ADR-0006: Shared-schema multi-tenancy with workspace_id

- **Status:** Accepted
- **Date:** 2026-11-15
- **Deciders:** Billleaf founding team

## Context

Most tenants are solo freelancers with small data. We need low cost per tenant, simple migrations, and a path to stronger isolation.

## Decision

Use **one database and schema**; every business row has **`workspace_id`** (FK, indexed, leading column in composite uniques). Repositories read the workspace from request context (`nestjs-cls`) and scope every query; workers carry `workspaceId` in job payloads. **Postgres Row-Level Security** will be added later as defense-in-depth once business tables exist.

## Consequences

- Cheapest and simplest to operate; single migration run.
- Isolation depends on application discipline until RLS is added — mitigated by repository conventions and cross-tenant tests.
- Noisy-neighbor risk handled by indexes, query limits and later replicas.
- Per-tenant restore requires filtered copy from a dump.

## Alternatives considered

- **Schema-per-tenant** — migration fan-out and connection overhead for thousands of tiny tenants.
- **Database-per-tenant** — strongest isolation, far too costly for freemium.
