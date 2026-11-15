# Multi-tenancy

Decision: [ADR-0006 Shared-schema tenancy](../adr/0006-shared-schema-multi-tenancy.md)

## Model

- **Tenant = workspace** = Better Auth `organization`.
- **One database, one schema.** Every business row carries `workspace_id`.
- A user can belong to many workspaces; the session holds the **active workspace**. Web URLs carry the slug: `app.billleaf.com/<workspaceSlug>/…`.

## Rules

1. Every business table: `workspace_id uuid not null references organization(id)`, indexed.
2. Composite uniques start with `workspace_id` (e.g. `unique(workspace_id, number)` on invoices).
3. Foreign keys between business tables stay inside one workspace (enforced in services; composite FKs where practical).
4. **Repositories require the workspace id** from request context (`nestjs-cls`) and add `where workspace_id = $ws` to every query. No repository method accepts an unscoped query.
5. Workers receive `workspaceId` in the job payload and set CLS before touching repositories.
6. Background/cross-tenant jobs (e.g. billing sync) are explicit, named, and reviewed.

## Request context

```
session guard → { userId, workspaceId (active org), memberId } → ClsService
repository     → this.cls.get('workspaceId')  (throws if missing)
```

## Defense in depth (later)

- **Postgres Row-Level Security** on business tables with `current_setting('app.workspace_id')` set per transaction. Planned once Phase 1 tables exist; recorded in ADR-0006.
- Integration tests assert cross-workspace reads return 404, never another tenant's data.

## Per-workspace numbering

`document_sequences (workspace_id, scope, prefix, padding, next_value)` — inside the issuing transaction the service runs `UPDATE … SET next_value = next_value + 1 … RETURNING` (which row-locks), formats `INV-0001`, and inserts the document. Gap-free and safe under concurrency.

## Scaling path

Shared schema → add RLS → move heavy tenants' read load to replicas → (only if ever needed) shard by `workspace_id`. Every step works because `workspace_id` is everywhere from day one.

## Data lifecycle

- Workspace deletion: soft delete, 30-day grace, then hard delete cascade (job).
- Export: per-workspace CSV/JSON export job.
