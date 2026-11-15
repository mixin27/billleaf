<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Billleaf — agent guide

Billleaf is an all-in-one business workspace for freelancers:
**Client → Quote → Contract → Project → Time → Invoice → Payment → Receipt.**
Read `docs/README.md` (product + architecture + ADRs) before non-trivial work.

## Repo map

| Path                               | What                                                                                     |
| ---------------------------------- | ---------------------------------------------------------------------------------------- |
| `apps/web`                         | Next.js 16 product app (App Router, feature folders). See `apps/web/AGENTS.md`           |
| `apps/api`                         | NestJS 12 (Fastify, ESM) REST API + BullMQ worker. See `apps/api/AGENTS.md`              |
| `apps/mobile`                      | _Reserved_ — Expo app (Phase 4), reuses `contracts` + `api-client`                       |
| `packages/db`                      | Drizzle schema, migrations, client. See `packages/db/AGENTS.md`                          |
| `packages/contracts`               | Zod schemas, shared types, **permission catalog**                                        |
| `packages/api-client`              | Typed client generated from the API's OpenAPI                                            |
| `packages/ui`                      | shadcn/ui (Base UI) primitives — generic only                                            |
| `packages/env` · `packages/emails` | Env validation · transactional email templates                                           |
| `infra/`                           | Docker Compose (dev + prod reference), backups                                           |
| `.claude/skills/`                  | Repo workflows: new-api-module, new-web-feature, db-migration, add-permission, write-adr |

## Commands

```bash
pnpm install
pnpm infra:up                  # postgres, valkey, s3 (seaweedfs), mailpit (docker)
pnpm db:migrate && pnpm db:seed
pnpm dev                       # web :3000, api :4000 (+ package watchers)
pnpm --filter api dev:worker   # background jobs (emails)
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm gen:api-client            # after changing API routes/DTOs
pnpm db:generate               # after changing packages/db/src/schema
```

Local tools: Mailpit http://localhost:8025 · API docs http://localhost:4000/docs

## Non-negotiable rules

1. **Tenancy:** every business table has `workspace_id`; every query filters by
   `RequestContext.workspaceId`. Never take a workspace id from a request body.
2. **Authorization:** every workspace route has `@RequirePermission(...)` (or
   `@RequireWorkspace()`). Permission keys come from
   `packages/contracts/src/iam/permissions.ts` — add new ones there first.
3. **Money:** integer minor units + ISO currency (`moneySchema`). No floats.
4. **Shared shapes** live in `packages/contracts`; the API builds DTOs with
   `createZodDto`, the web reuses the same schemas for forms.
5. **Issued financial documents are immutable** — void / credit note, never edit.
6. **Migrations** are generated (`pnpm db:generate`), reviewed, and committed. Never edit an applied migration.
7. ESM everywhere in Node packages: relative imports end in `.js`.
8. Conventional commits (`feat(api): …`), enforced by commitlint via lefthook.

## Where things go

- New business capability → API module in `apps/api/src/modules/<feature>` +
  web feature in `apps/web/features/<feature>` (use the skills).
- Cross-feature imports in web go through `features/<name>/index.ts` only.
- Architecture decisions → ADR in `docs/adr/` (skill: `write-adr`).
