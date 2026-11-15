# ADR-0007: Self-hosted VPS with Dokploy; Vercel only for static sites

- **Status:** Accepted
- **Date:** 2026-11-15
- **Deciders:** Billleaf founding team

## Context

We want predictable low cost, full control over Postgres, long-running workers, and no serverless limits — while keeping deployments easy for a small team.

## Decision

Run `web`, `api`, `worker`, `postgres:17` and `valkey` as containers on a **VPS managed by Dokploy** (Traefik + Let's Encrypt, zero-downtime deploys). **Cloudflare** in front (DNS, proxy, WAF). **Cloudflare R2** for files and backups. Images built in GitHub Actions and pushed to **GHCR**; Dokploy webhooks deploy staging on `main` and production on approved `v*` tags; a one-off migrate job runs first. **Vercel (free)** hosts only static-ish sites (`apps/docs`, later marketing). Plain compose + Caddy is the documented fallback.

## Consequences

- Low, flat cost; no cold starts; workers and cron run natively.
- We own patching, backups, monitoring and capacity — documented in [infrastructure docs](../infrastructure/deployment.md).
- Single VPS is a single point of failure early on; mitigated by backups/PITR and a scale-out path (separate DB VPS).

## Alternatives considered

- **Vercel/Netlify for the app + managed DB (Neon/Supabase)** — great DX, but costs grow with usage and workers don't fit serverless well.
- **Kubernetes** — overkill for current scale.
- **Coolify** — viable equivalent to Dokploy; either works.
