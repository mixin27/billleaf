---
name: db-migration
description: Add or change Drizzle tables in packages/db and produce a reviewed SQL migration. Use for any database schema change in Billleaf.
---

# Database migration

1. Edit/add a schema file under `packages/db/src/schema/` (export it from `index.ts`).
   - Business tables: `id()`, `workspaceId` FK → `organization.id` (cascade) + index,
     `...timestamps`, usually `...softDelete`.
   - Money: `integer` minor units + `text` currency. Never `numeric`/float for amounts
     unless it is a rate (e.g. tax %), then `numeric(7,4)`.
   - Unique constraints include `workspaceId`.
   - Never edit `auth.ts` by hand — it is generated (`pnpm --filter api auth:generate`).
2. `pnpm db:generate` → inspect `packages/db/migrations/NNNN_*.sql`. Check for
   destructive statements (DROP/ALTER TYPE/NOT NULL on existing data). For a
   destructive change, split into expand → backfill → contract migrations across deploys.
3. `pnpm infra:up && pnpm db:migrate` to apply locally.
4. `pnpm --filter @workspace/db build && pnpm typecheck`.
5. Commit the schema change and the migration (+ `migrations/meta/*`) together.

Never modify a migration that has already been applied to staging/production.
