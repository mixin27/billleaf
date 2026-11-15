# API (`apps/api`)

Decisions: [ADR-0002 NestJS + Fastify](../adr/0002-nestjs-fastify-api.md) · [ADR-0008 REST + OpenAPI](../adr/0008-rest-openapi-generated-client.md)

## Stack

NestJS 11 (Fastify adapter) · Drizzle (`@workspace/db`) · `nestjs-zod` (Zod DTOs → OpenAPI) · `nestjs-cls` (request context) · Pino · BullMQ + Valkey · `@nestjs/terminus` · `@nestjs/throttler` · `@nestjs/event-emitter` · Sentry + OpenTelemetry.

## Structure

```
apps/api/src/
├─ main.ts          HTTP entrypoint
├─ worker.ts        queue-consumer entrypoint (same codebase, no HTTP)
├─ app.module.ts
├─ core/            config, database (Drizzle provider), cache, queue, logger, telemetry, storage (S3/R2)
├─ common/          request context (nestjs-cls), decorators (@RequirePermission, @RequireWorkspace; @AllowAnonymous/@Session from nestjs-better-auth),
│                   filters (problem+json), interceptors, pipes, pagination, money utils
├─ auth/            Better Auth instance + Nest integration + session guard
├─ iam/             workspaces, members, invitations, roles, permissions, RBAC guard, audit log
├─ billing/         SaaS subscription + entitlements (provider-agnostic)
└─ modules/         business features (Phase 1+)
   └─ <feature>/
      ├─ <feature>.module.ts
      ├─ <feature>.controller.ts
      ├─ <feature>.service.ts
      ├─ <feature>.repository.ts
      ├─ dto/  events/  jobs/
      └─ *.spec.ts
```

## Layering

| Layer      | Does                                                             | Must not                              |
| ---------- | ---------------------------------------------------------------- | ------------------------------------- |
| Controller | HTTP, Zod validation, permission decorators, map to response DTO | Touch Drizzle; contain business rules |
| Service    | Business rules, transactions, emit domain events, enqueue jobs   | Build raw SQL; know about HTTP        |
| Repository | Drizzle queries, **always scoped by `workspace_id`** from CLS    | Contain business rules                |

- **Cross-module calls** go through an exported service or a domain event — never another module's repository.
- **In-process events:** `@nestjs/event-emitter` (e.g. `invoice.issued`). **Async/slow work:** BullMQ ([background-jobs.md](background-jobs.md)).

## Contract

- REST, prefix **`/v1`**; auth routes at **`/api/auth/*`** (Better Auth).
- DTOs are Zod schemas from `@workspace/contracts` (via `nestjs-zod`), giving validation + OpenAPI from one source.
- OpenAPI served at `/docs` (Scalar UI) in non-production; JSON spec consumed by `pnpm gen:api-client` → `packages/api-client` (openapi-typescript + openapi-fetch).
- Errors: **RFC 9457 `application/problem+json`** (`type`, `title`, `status`, `detail`, `instance`, plus `errors[]` for validation).
- Pagination: **cursor-based** (`?cursor=&limit=`, response `{ items, nextCursor }`).
- Idempotency: `Idempotency-Key` header required on payment and webhook-triggering endpoints.
- Rate limiting: `@nestjs/throttler` backed by Valkey; stricter on auth endpoints.

## Cross-cutting

- **Health:** `GET /health` (liveness) and readiness checks for Postgres and Valkey.
- **Logging:** Pino JSON with request id, `userId`, `workspaceId`; never log secrets or PII bodies.
- **Config:** env validated with Zod at boot (`@workspace/env`); the app refuses to start on invalid config.
- **Audit:** sensitive actions (role changes, member removal, document void, billing changes) write to `audit_logs`.

See also: [Auth & RBAC](auth-and-rbac.md) · [Multi-tenancy](multi-tenancy.md) · [Adding a module](../engineering/adding-a-module.md)
