---
name: new-api-module
description: Scaffold a new business module in apps/api (e.g. clients, quotes, invoices) following Billleaf's controller → service → repository pattern with workspace scoping, RBAC and Zod DTOs. Use when adding a new API resource or feature endpoint set.
---

# New API module

Inputs: feature name (plural, kebab-case, e.g. `clients`) and its fields.

## Steps

1. **Permissions** — ensure keys exist in `packages/contracts/src/iam/permissions.ts`
   (`<resource>.read/create/update/delete`). If not, run the `add-permission` skill.
2. **Contracts** — add `packages/contracts/src/<feature>/<feature>.schema.ts` with
   `<entity>Schema`, `create<Entity>Schema`, `update<Entity>Schema` (explicit
   optional fields — do **not** `.partial()` a schema that has `.default()`s),
   and list query schema (extend `pageQuerySchema` with `sort: sortQuery([...fields])`; respond with `paged(item)`; build ORDER BY with `orderBy()` from `apps/api/src/common/pagination.ts`). Export from `src/index.ts`.
3. **Schema** — add the table via the `db-migration` skill (must include
   `workspaceId`, `timestamps`, usually `softDelete`).
4. **Module files** in `apps/api/src/modules/<feature>/`:
   - `<feature>.dto.ts` — `class CreateXDto extends createZodDto(createXSchema) {}` etc.
   - `<feature>.repository.ts` — inject `@InjectDb()` + `RequestContext`; EVERY
     query has `eq(table.workspaceId, this.ctx.workspaceId)`; soft-deleted rows excluded.
   - `<feature>.service.ts` — business rules, `db.transaction` for multi-writes,
     `EntitlementsService.assertWithinLimit` before creates when the plan limits it,
     `AuditService.record` for sensitive/financial changes, `NotFoundException` when
     the repository returns null.
   - `<feature>.controller.ts` — `@Controller({ path: "<feature>", version: "1" })`,
     `@ApiTags`, `@RequirePermission(...)` on every handler, `ParseUUIDPipe` on ids,
     `@ZodResponse({ status, type })` on every handler that returns a body.
   - `<feature>.module.ts` — providers: repository, service; controllers.
   - `<feature>.service.spec.ts` — Vitest unit tests with a fake repository.
5. Register the module in `apps/api/src/app.module.ts` imports.
6. Verify: `pnpm --filter @workspace/contracts build && pnpm --filter api typecheck && pnpm --filter api test`.
7. Regenerate the client: `pnpm gen:api-client` (needs `pnpm infra:up`), commit `packages/api-client/src/schema.d.ts`.

Reference implementation: `apps/api/src/iam/roles/`.
