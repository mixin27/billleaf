# apps/api — NestJS 12 (Fastify, ESM)

Read the root `AGENTS.md` first. NestJS 12 is newer than most training data:
it is ESM (`"type": "module"`, `.js` import suffixes) and uses Vitest.

## Layout

```
src/
  main.ts / worker.ts / migrate.ts   entrypoints (HTTP · BullMQ worker · migrations)
  bootstrap.ts                       Fastify app, CORS, helmet, OpenAPI
  app.module.ts                      global guards/pipes/filters (order matters)
  core/       config (zod env), database (Drizzle), cache (Redis), queue, logger
  common/     request context (nestjs-cls), decorators, problem+json filter
  auth/       Better Auth instance + plugins (organization == workspace)
  iam/        permissions sync/resolver, WorkspaceGuard, roles, members, /me, audit
  billing/    plans + EntitlementsService (plan limits ≠ RBAC)
  modules/    business features (clients, quotes, invoices, …)
  jobs/       BullMQ processors (registered in worker.module.ts only)
```

## Request pipeline

`ThrottlerGuard → AuthGuard (Better Auth session) → WorkspaceGuard → ZodValidationPipe → controller`

`WorkspaceGuard` resolves the workspace from `X-Workspace-Id` or the session's
active organization, verifies membership, loads permissions (Redis-cached,
invalidated via `PermissionResolver.invalidateWorkspace`) and fills
`RequestContext` (`userId`, `workspaceId`, `memberId`, `permissions`).

## Conventions

- Controller → Service → Repository. Repositories are the only place with Drizzle
  queries and they always scope by `this.ctx.workspaceId`.
- Controllers: `@Controller({ path, version: "1" })`, `@RequirePermission(...)` on
  every handler, `@ZodResponse({ status, type })` so OpenAPI has typed 2xx responses.
- DTOs: `class XDto extends createZodDto(schemaFromContracts) {}`.
- Errors: throw Nest HTTP exceptions; the filter renders RFC 9457 problem+json.
- Side effects that are slow or retryable (email, PDF) → enqueue a BullMQ job.
- Security-relevant or financial actions → `AuditService.record(...)`.
- Changing roles/permissions/membership → call `PermissionResolver.invalidateWorkspace`.
- Better Auth plugins live in `src/auth/auth.plugins.ts`. After changing them run
  `pnpm --filter api auth:generate && pnpm db:generate`.
- Public routes: `@AllowAnonymous()` from `@thallesp/nestjs-better-auth`.

## Testing

`pnpm --filter api test` (Vitest + SWC for decorator metadata). Unit-test guards
and services with fakes; integration tests against a real Postgres (CI service).
