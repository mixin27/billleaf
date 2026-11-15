# ADR-0008: REST + OpenAPI with a generated typed client

- **Status:** Accepted
- **Date:** 2026-11-15
- **Deciders:** Billleaf founding team

## Context

Web now and mobile later must consume the API with end-to-end types. Third-party integrations (Phase 3) need a conventional, documented API.

## Decision

Expose **REST under `/v1`** with Zod DTOs (from `@workspace/contracts`) via `nestjs-zod`, generating **OpenAPI**; serve Scalar docs at `/docs` in non-prod. Generate `packages/api-client` with **openapi-typescript + openapi-fetch** (`pnpm gen:api-client`), checked in CI. Errors are RFC 9457 problem+json; paginated lists (originally cursor-based; now numbered pages with whitelisted server-side sorting for data tables); idempotency keys on payment/webhook endpoints.

## Consequences

- One schema source drives validation, docs and client types.
- Public/partner API is a natural extension.
- Codegen step must stay in sync (CI diff check).
- Less ergonomic than tRPC inside TypeScript-only clients.

## Alternatives considered

- **tRPC** — excellent TS DX, but couples clients to TypeScript and is a poor public API.
- **GraphQL** — flexible, but more infra and complexity than our CRUD-heavy domain needs.
- **Hand-written fetch wrappers** — drift and duplicated types.
