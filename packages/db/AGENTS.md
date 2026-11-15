# packages/db — Drizzle + PostgreSQL

- `src/schema/auth.ts` is **generated** from Better Auth's plugin set
  (`pnpm --filter api auth:generate`). Do not edit by hand.
- `src/schema/iam.ts`, `billing.ts`, and future business schemas are hand-written.
- Column names are camelCase in TS and snake_case in SQL (`casing: "snake_case"`).
- Helpers in `src/schema/_shared.ts`: `id()` (UUIDv7), `timestamps`, `softDelete`.

## Rules for business tables

```ts
export const clients = pgTable(
  "clients",
  {
    id: id(),
    workspaceId: uuid()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    // …
    ...timestamps,
    ...softDelete,
  },
  (t) => [index().on(t.workspaceId)]
)
```

- Always `workspace_id` (FK to `organization`, indexed; include it in unique keys).
- Money: `integer` minor units + `text` currency column.
- Export new schema files from `src/schema/index.ts`.

## Workflow

```bash
pnpm db:generate     # writes migrations/NNNN_*.sql — review and commit it
pnpm db:migrate      # applies to DATABASE_URL (packages/db/.env)
pnpm db:seed         # syncs the permission catalog
pnpm db:studio
```

Never edit a migration that has been applied anywhere shared. Production runs
`node dist/migrate.js` (api image) before api/worker start.
