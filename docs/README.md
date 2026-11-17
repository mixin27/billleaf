# Billleaf Documentation

Billleaf is an all-in-one business workspace for freelancers — **Client → Quote → Contract → Project → Time → Invoice → Payment → Receipt**.

**New here?** Read [Vision](product/vision.md) → [Architecture overview](architecture/overview.md) → [Monorepo](architecture/monorepo.md) → [Conventions](engineering/conventions.md) → [Adding a module](engineering/adding-a-module.md).

## Product

| Doc                                         | What                                      |
| ------------------------------------------- | ----------------------------------------- |
| [Vision](product/vision.md)                 | Problem, promise, audience, principles    |
| [Modules](product/modules.md)               | Product modules and the business journey  |
| [Business model](product/business-model.md) | Freemium tiers, MoR billing, entitlements |
| [Roadmap](product/roadmap.md)               | Phases 0–4                                |
| [Future plan](product/future-plan.md)       | Next concrete items, in order, for later  |
| [Brand](product/brand.md)                   | Logo, colours, usage, asset files         |

Customer and developer help pages are **not** here: they live in `apps/docs/content/docs` and are published as the public docs site ([ADR-0016](adr/0016-docs-site.md)). This folder is internal.

## Architecture

| Doc                                                            | What                                         |
| -------------------------------------------------------------- | -------------------------------------------- |
| [Overview](architecture/overview.md)                           | System diagram, components, request flow     |
| [Monorepo](architecture/monorepo.md)                           | Layout, packages, commands                   |
| [API](architecture/api.md)                                     | NestJS structure, layering, API contract     |
| [Web](architecture/web.md)                                     | Next.js 16 structure, state management       |
| [Data model](architecture/data-model.md)                       | Tables and data conventions                  |
| [Auth & RBAC](architecture/auth-and-rbac.md)                   | Better Auth, dynamic roles and permissions   |
| [Multi-tenancy](architecture/multi-tenancy.md)                 | Workspaces, `workspace_id` scoping, RLS plan |
| [Billing & entitlements](architecture/billing-entitlements.md) | SaaS subscriptions and plan limits           |
| [Background jobs](architecture/background-jobs.md)             | BullMQ worker, queues, job rules             |

## Infrastructure

| Doc                                                        | What                                                                              |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------- |
| [Environments](infrastructure/environments.md)             | local / staging / production, config & secrets                                    |
| [Deployment](infrastructure/deployment.md)                 | VPS + Dokploy + Vercel, GHCR, migrate job                                         |
| [Dokploy runbook](infrastructure/dokploy-runbook.md)       | Step by step: server → Dokploy → first deploy; release, roll back, troubleshoot   |
| [Hosting playbook](infrastructure/hosting-playbook.md)     | How Dokploy works, costs, sizing, DO/Hetzner, migration (reusable for other SaaS) |
| [Observability](infrastructure/observability.md)           | Sentry, logs, traces, alerts                                                      |
| [Backup & restore](infrastructure/backup-restore.md)       | Runbook and restore drill                                                         |
| [Security checklist](infrastructure/security-checklist.md) | Pre-launch and quarterly review                                                   |

## Engineering

| Doc                                                 | What                                      |
| --------------------------------------------------- | ----------------------------------------- |
| [Conventions](engineering/conventions.md)           | Naming, money, dates, API and web rules   |
| [Design system](engineering/design-system.md)       | Tokens, app shell, page anatomy, UI rules |
| [Git workflow](engineering/git-workflow.md)         | Trunk-based, conventional commits, PRs    |
| [Testing strategy](engineering/testing-strategy.md) | Vitest, Testcontainers, Playwright        |
| [Adding a module](engineering/adding-a-module.md)   | Step-by-step guide + definition of done   |

## Architecture Decision Records

| ADR                                                   | Decision                                                        | Status   |
| ----------------------------------------------------- | --------------------------------------------------------------- | -------- |
| [0001](adr/0001-monorepo-pnpm-turborepo.md)           | Monorepo with pnpm workspaces and Turborepo                     | Accepted |
| [0002](adr/0002-nestjs-fastify-api.md)                | NestJS with the Fastify adapter for the API                     | Accepted |
| [0003](adr/0003-postgres-drizzle.md)                  | PostgreSQL with Drizzle ORM                                     | Accepted |
| [0004](adr/0004-better-auth.md)                       | Better Auth for authentication and workspaces                   | Accepted |
| [0005](adr/0005-dynamic-rbac-tables.md)               | Dynamic, workspace-scoped RBAC in our own tables                | Accepted |
| [0006](adr/0006-shared-schema-multi-tenancy.md)       | Shared-schema multi-tenancy with `workspace_id`                 | Accepted |
| [0007](adr/0007-self-hosted-vps-dokploy.md)           | Self-hosted VPS with Dokploy; Vercel only for static sites      | Accepted |
| [0008](adr/0008-rest-openapi-generated-client.md)     | REST + OpenAPI with a generated typed client                    | Accepted |
| [0009](adr/0009-tanstack-query-zustand.md)            | TanStack Query for server state, Zustand for client state       | Accepted |
| [0010](adr/0010-merchant-of-record-billing.md)        | Merchant of Record for SaaS billing behind a provider interface | Accepted |
| [0011](adr/0011-billing-core-with-test-provider.md)   | Billing core with a built-in test provider; MoR adapter later   | Accepted |
| [0012](adr/0012-client-portal-magic-links.md)         | Client portal with emailed magic links, on every plan           | Accepted |
| [0013](adr/0013-manual-payments-for-subscriptions.md) | Manual subscription payments, approved by platform admins       | Accepted |
| [0014](adr/0014-outgoing-webhooks.md)                 | Outgoing webhooks delivered by the worker, with an SSRF guard   | Accepted |
| [0015](adr/0015-workspace-api-keys.md)                | Workspace API keys that act as their creator, scoped            | Accepted |
| [0016](adr/0016-docs-site.md)                         | Public docs site with Fumadocs, statically exported             | Accepted |
| [0017](adr/0017-mobile-app-expo-native-auth.md)       | Mobile app on Expo, signed in through Better Auth's expo plugin | Accepted |

New ADR: copy [the template](adr/template.md).

## Keeping docs current

Update the relevant page in the same PR as the code change. Architectural changes need an ADR.
