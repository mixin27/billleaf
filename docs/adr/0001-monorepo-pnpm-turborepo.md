# ADR-0001: Monorepo with pnpm workspaces and Turborepo

- **Status:** Accepted
- **Date:** 2026-11-15
- **Deciders:** Billleaf founding team

## Context

Billleaf has a web app, an API/worker, a docs site and a future mobile app that share types, validation schemas, the DB schema and UI primitives. The repo was bootstrapped from the shadcn Turborepo template.

## Decision

Use a single **pnpm workspaces + Turborepo** monorepo. Apps in `apps/*` are thin composition; shared truth lives in `packages/*` (`db`, `contracts`, `api-client`, `env`, `emails`, `ui`, configs) named `@workspace/<name>`. Turbo orchestrates `build`, `lint`, `typecheck`, `test`, `db:*`, `gen:api-client` with caching.

## Consequences

- Atomic changes across API, contracts and web in one PR; no package publishing.
- One lockfile, one toolchain, consistent configs.
- CI must use Turbo filtering/caching to stay fast as the repo grows.
- Dependency direction (`apps → packages`, never the reverse) must be enforced by review/lint.

## Alternatives considered

- **Polyrepo** — versioning shared packages and coordinating releases is overhead a small team can't afford.
- **Nx** — more powerful generators/graph, but heavier; Turbo is already in place and sufficient.
- **npm/yarn workspaces** — pnpm is faster and stricter about phantom dependencies.
