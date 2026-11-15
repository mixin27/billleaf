# ADR-0002: NestJS with the Fastify adapter for the API

- **Status:** Accepted
- **Date:** 2026-11-15
- **Deciders:** Billleaf founding team

## Context

The API carries most business logic (documents, numbering, money, permissions, billing, jobs) and must stay maintainable as many modules are added by a small team and AI agents. Next.js route handlers alone would mix product UI and domain logic and make a future mobile client second-class.

## Decision

Build a separate **NestJS 11** API (`apps/api`) on the **Fastify** adapter, organized feature/module-first with controller → service → repository layering. The same codebase runs a **worker** entrypoint (`worker.ts`) for BullMQ consumers. Supporting libs: `nestjs-zod`, `nestjs-cls`, Pino, `@nestjs/terminus`, `@nestjs/throttler`, `@nestjs/event-emitter`.

## Consequences

- Strong conventions (modules, DI, guards, interceptors) make structure predictable for humans and agents.
- Web and mobile are equal API clients.
- Fastify gives better throughput; some Express-only Nest middleware needs Fastify equivalents.
- Extra deployable (api + worker) compared with a Next-only app.

## Alternatives considered

- **Next.js route handlers / server actions only** — couples domain to the web app, weak for mobile and background work.
- **Hono / plain Fastify** — lighter, but we would hand-build DI, guards and module conventions.
- **NestJS on Express** — more ecosystem examples, lower performance; Fastify chosen since there's no legacy.
