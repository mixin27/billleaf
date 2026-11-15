# Adding a Module

Walkthrough for a new business module, using **clients** as the example. Agent skills automate parts of this: `.claude/skills/new-api-module`, `new-web-feature`, `db-migration`, `add-permission`.

## 1. Contracts (`packages/contracts`)

- `src/clients/clients.schema.ts`: Zod schemas — `clientSchema`, `createClientSchema`, `updateClientSchema`, list query.
- Add permissions to `PERMISSION_CATALOG` (`client.read`, `client.create`, `client.update`, `client.delete`) and grant them to the relevant `SYSTEM_ROLES`.
- Add entitlement keys if the plan limits it (`clients.max`).
- Export from `src/index.ts`.

## 2. Database (`packages/db`)

- `src/schema/clients.ts`: table with `id()`, **`workspace_id` (not null, FK, indexed)**, columns, `...timestamps`, soft delete if needed; composite uniques start with `workspace_id`.
- Export from `schema/index.ts`.
- `pnpm db:generate` → review the SQL → `pnpm db:migrate`.

## 3. API (`apps/api/src/modules/clients/`)

```
clients.module.ts
clients.controller.ts     @RequirePermission('client.read') etc., Zod DTOs from contracts
clients.service.ts        business rules, transactions, events, entitlement checks
clients.repository.ts     Drizzle, scoped by workspace_id from CLS
dto/  events/  jobs/
clients.service.spec.ts
clients.int-spec.ts       403/2xx per permission, cross-tenant 404
```

- Register the module in `app.module.ts`.
- Write `audit_logs` entries for destructive/sensitive actions.
- Run the api, check `/docs`, then `pnpm gen:api-client`.

## 4. Web (`apps/web/features/clients/`)

```
api/keys.ts  api/queries.ts  api/mutations.ts     wrap @workspace/api-client
components/  hooks/  stores/  schemas/
index.ts                                          public surface
```

- Thin routes: `app/(app)/[workspaceSlug]/clients/page.tsx`, `[clientId]/page.tsx`.
- Add nav entry in `config/nav` gated by `client.read`.
- Wrap actions in `<PermissionGate>`; handle plan-limit errors with an upgrade prompt.

## 5. Tests & docs

- Unit + integration tests per [testing strategy](testing-strategy.md); add an E2E journey if it's a critical path.
- Update [modules](../product/modules.md) / [data model](../architecture/data-model.md); add an ADR if you made an architectural decision.

## Definition of done

- [ ] Permissions in catalog, every endpoint guarded.
- [ ] Every query scoped by `workspace_id`; cross-tenant test passes.
- [ ] Entitlements enforced where relevant.
- [ ] Migration reviewed and backward compatible.
- [ ] API client regenerated; web uses typed client.
- [ ] `pnpm lint typecheck test build` green.
