# Billleaf

**An all-in-one business workspace for freelancers:** win the work, do the work, get paid.

```
Client → Quote → Contract → Project → Time → Invoice → Payment → Receipt
```

Billleaf replaces the stack of separate tools a freelancer juggles (a quote template, an e-sign app, a time tracker, an invoicing tool, a spreadsheet of who paid) with one workspace where each step feeds the next.

## Features

| Area              | What you get                                                                                                                                                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Clients**       | Clients and contacts, multi-currency, payment terms                                                                                                                                                                                                     |
| **Quotes**        | Line items with per-line tax, PDF, email, accept/decline, convert to an invoice or a project                                                                                                                                                            |
| **Contracts**     | Templates with merge fields, from a quote, PDF + email, typed-name e-signature with a signature certificate                                                                                                                                             |
| **Projects**      | Task board with assignees, fixed or hourly billing, budgets                                                                                                                                                                                             |
| **Time tracking** | Clockify-style tracker:<br>• timer bar, tags, entries without a project, continue/duplicate, bulk edit<br>• weekly timesheet grid<br>• Summary, Detailed and Weekly reports with CSV export<br>• Clockify CSV import<br>• billable time → invoice lines |
| **Invoices**      | Gap-free numbering, derived statuses (open, overdue, partially paid, paid, void), PDF, email, recurring schedules                                                                                                                                       |
| **Payments**      | Manual payments and refunds, automatic receipts (PDF + email)                                                                                                                                                                                           |
| **Client portal** | Clients sign in with an emailed link to:<br>• view quotes, contracts, invoices and receipts<br>• accept or decline quotes<br>• e-sign contracts                                                                                                         |
| **Dashboard**     | Outstanding and overdue, aging, revenue trend, open quotes, per currency                                                                                                                                                                                |
| **Teams**         | Workspaces, invitations, dynamic roles and permissions                                                                                                                                                                                                  |
| **SaaS billing**  | Free / Pro / Team plans with enforced limits and a provider-agnostic billing core                                                                                                                                                                       |

Built for real businesses:

- **Money** is in integer minor units.
- **Issued documents** are immutable; corrections go through void or credit.
- **Tenancy:** every query is scoped to the workspace.
- **PDFs** render Latin, Thai and Myanmar scripts.

## Tech stack

| Layer   | Choice                                                                                                      |
| ------- | ----------------------------------------------------------------------------------------------------------- |
| Web     | **Next.js 16** (App Router), React, TanStack Query + Table, nuqs, Zustand, shadcn/ui (Base UI), Tailwind v4 |
| API     | **NestJS 12** on Fastify (ESM), Zod DTOs, OpenAPI → generated typed client                                  |
| Auth    | **Better Auth**: email/password, verification, Google, 2FA, organizations as workspaces                     |
| Data    | **PostgreSQL 17** + **Drizzle ORM** (generated, reviewed migrations)                                        |
| Jobs    | **BullMQ** on Valkey (email, recurring invoices, billing webhooks)                                          |
| Files   | S3-compatible storage: SeaweedFS locally, **Cloudflare R2** in production                                   |
| Tooling | pnpm workspaces, Turborepo, Vitest, ESLint, Prettier, lefthook + commitlint                                 |
| Hosting | One VPS with **Dokploy**; images on GHCR; Cloudflare in front                                               |

## Repository

```
apps/
  web/                Next.js product app (feature folders)
  api/                NestJS REST API + BullMQ worker (same image)
packages/
  contracts/          Zod schemas, shared types, permission catalog
  db/                 Drizzle schema, migrations, client
  api-client/         Typed client generated from the API's OpenAPI
  ui/                 shadcn/ui primitives (generic only)
  emails/             Transactional email templates
  env/                Environment validation
infra/                Docker Compose (dev + production), backups, smoke test
docs/                 Product, architecture, engineering and infrastructure docs, ADRs
```

## Getting started

**Requirements:** Node 24 (`.nvmrc`), pnpm 11 (`corepack enable`), Docker.

```bash
pnpm install
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
cp packages/db/.env.example packages/db/.env
pnpm infra:up
pnpm db:migrate && pnpm db:seed
pnpm dev
```

`pnpm infra:up` starts Postgres, Valkey, SeaweedFS (S3) and Mailpit in Docker.

`pnpm dev` starts:

- **web** on http://localhost:3000;
- **api** on http://localhost:4000 (interactive API docs at http://localhost:4000/docs);
- the package watchers.

To send email and run background jobs, start the worker in another terminal:

```bash
pnpm --filter api dev:worker
```

Emails land in **Mailpit** at http://localhost:8025.

## Everyday commands

| Command                                                  | What it does                                                  |
| -------------------------------------------------------- | ------------------------------------------------------------- |
| `pnpm lint && pnpm typecheck && pnpm test && pnpm build` | Everything CI checks                                          |
| `pnpm test:integration`                                  | API against real Postgres, Valkey and S3 (needs `infra:up`)   |
| `pnpm db:generate`                                       | New migration after changing `packages/db/src/schema`         |
| `pnpm db:migrate`                                        | Apply migrations                                              |
| `pnpm db:studio`                                         | Browse the database                                           |
| `pnpm gen:api-client`                                    | Regenerate the typed client after changing API routes or DTOs |
| `pnpm infra:down`                                        | Stop the local Docker services                                |

Commits follow [Conventional Commits](https://www.conventionalcommits.org) (`feat(api): …`), enforced by commitlint.

## Documentation

Start at **[docs/README.md](docs/README.md)**.

| If you want to…                     | Read                                                                                                                                                                      |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Understand the product              | [Vision](docs/product/vision.md) · [Modules](docs/product/modules.md) · [Roadmap](docs/product/roadmap.md) · [Future plan](docs/product/future-plan.md)                   |
| Understand the system               | [Architecture overview](docs/architecture/overview.md) · [Data model](docs/architecture/data-model.md) · [Auth & RBAC](docs/architecture/auth-and-rbac.md)                |
| Build a feature                     | [Conventions](docs/engineering/conventions.md) · [Adding a module](docs/engineering/adding-a-module.md) · [Design system](docs/engineering/design-system.md)              |
| Deploy or operate it                | [Dokploy runbook](docs/infrastructure/dokploy-runbook.md) · [Deployment](docs/infrastructure/deployment.md) · [Hosting playbook](docs/infrastructure/hosting-playbook.md) |
| Know why something is the way it is | [Architecture decision records](docs/adr/)                                                                                                                                |

Working with an AI coding agent? [`AGENTS.md`](AGENTS.md) has the rules, and `.claude/skills/` has repo workflows (new API module, new web feature, DB migration, permissions, ADRs).

## Non-negotiable rules

1. **Tenancy:** every business table has `workspace_id`, and every query filters by the request's workspace.
2. **Authorization:** every workspace route declares its permission; keys live in `packages/contracts`.
3. **Money:** integer minor units + ISO currency, never floats.
4. **Issued financial documents are immutable:** correct them with void or a credit note, never an edit.
5. **Migrations** are generated, reviewed and committed, never edited once applied.

## Status

Phase 1 (MVP) and most of Phase 2 are built; see the [roadmap](docs/product/roadmap.md). The repo is ready for its first production deploy; the remaining work is the server setup in the [Dokploy runbook](docs/infrastructure/dokploy-runbook.md). Next up: online invoice payments.
