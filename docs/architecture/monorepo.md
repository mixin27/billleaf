# Monorepo

pnpm workspaces + Turborepo. Decision: [ADR-0001](../adr/0001-monorepo-pnpm-turborepo.md).

## Layout

```
billleaf/
├─ apps/
│  ├─ web/          Next.js 16 — app.billleaf.com
│  ├─ api/          NestJS — api.billleaf.com (+ worker entrypoint)
│  ├─ docs/         Fumadocs → Vercel, docs.billleaf.com   [placeholder]
│  └─ mobile/       Expo — FUTURE (reserved, not created)
├─ packages/
│  ├─ ui/                 shadcn primitives (web)
│  ├─ db/                 Drizzle schema, migrations, seed, client factory
│  ├─ contracts/          Zod schemas + types: DTOs, enums, permission catalog
│  ├─ api-client/         typed client generated from the API's OpenAPI
│  ├─ env/                Zod env validation helpers
│  ├─ emails/             react-email templates (rendered by worker)
│  ├─ eslint-config/
│  └─ typescript-config/  base, nextjs, react-library, library, nestjs
├─ infra/           docker-compose (dev + prod reference), proxy config, backup scripts
├─ docs/            this documentation
├─ .claude/skills/  repo-specific agent skills
└─ .github/         CI, templates, CODEOWNERS, dependabot
```

## Principles

- **Apps are thin composition; shared truth lives in packages.** If two apps need it, it is a package.
- **Dependency direction:** `apps/* → packages/*`. Packages never import apps. `ui` never imports `db`. `contracts` has no runtime deps beyond Zod.
- **Package names:** `@workspace/<name>` (e.g. `@workspace/db`, `@workspace/contracts`).
- Mobile later reuses `contracts`, `api-client` and Better Auth's Expo client unchanged.

## Who imports what

| Package      | web | api | worker | mobile (future) |
| ------------ | --- | --- | ------ | --------------- |
| `ui`         | ✓   |     |        |                 |
| `db`         |     | ✓   | ✓      |                 |
| `contracts`  | ✓   | ✓   | ✓      | ✓               |
| `api-client` | ✓   |     |        | ✓               |
| `env`        | ✓   | ✓   | ✓      | ✓               |
| `emails`     |     |     | ✓      |                 |

## Common commands

| Command                                                     | What                                         |
| ----------------------------------------------------------- | -------------------------------------------- |
| `pnpm dev`                                                  | Run all apps (web :3000, api :4000)          |
| `pnpm build` / `lint` / `typecheck` / `test`                | Turbo pipelines across the repo              |
| `pnpm infra:up` / `infra:down`                              | Local Postgres, Valkey, S3, Mailpit          |
| `pnpm db:generate` / `db:migrate` / `db:seed` / `db:studio` | Drizzle tasks in `@workspace/db`             |
| `pnpm gen:api-client`                                       | Regenerate the typed API client from OpenAPI |
| `pnpm --filter <pkg> <script>`                              | Run in one package                           |

Node version: see `.nvmrc` (Node ≥ 22). pnpm version pinned in `package.json#packageManager`.
