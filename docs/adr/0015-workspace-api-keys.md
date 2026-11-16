# ADR-0015: Workspace API keys that act as their creator, scoped

- **Status:** Accepted
- **Date:** 2026-11-16
- **Deciders:** Billleaf maintainers

## Context

With webhooks ([ADR-0014](0014-outgoing-webhooks.md)) Billleaf can tell other tools what happened; integrations also need to **call** the API (create clients, read invoices, record payments). Every `/v1` route required a Better Auth browser session. Our business code relies on a real person behind each request: `ctx.userId` / `ctx.memberId` drive time tracking ("my" entries), `payments.recorded_by`, proof reviewers and the audit actor. Better Auth's API-key plugin now lives in a separate package (`@better-auth/api-key`); its permission model is its own, not our dynamic RBAC ([ADR-0005](0005-dynamic-rbac-tables.md)), and it works by mocking a user session.

## Decision

We will store our own **workspace API keys** (`api_keys`) and authenticate them in a global guard:

- **Keys:** `blk_` + 32 random bytes, shown once; we store only a SHA-256 hash and a short prefix for display. Optional expiry (30/90/365 days); revocable; `last_used_at` updated at most once a minute.
- **Identity:** a key **acts as the member who created it**. Its effective permissions are its scopes ∩ that member's current permissions, so it never exceeds its creator and shrinks when they lose access; keys are deleted with the member. Audit entries keep the person as actor and add `api_key_id`.
- **Scopes:** chosen from an allowlist (`API_KEY_SCOPES`): business resources only (clients, quotes, contracts, projects, time, invoices, payments, workspace read). Never billing, members, roles, settings, webhooks, API keys, rates, export or deletion. Creating a key needs `api_key.manage` and only scopes the creator holds.
- **Guards:** `AppAuthGuard` replaces the library `AuthGuard`. `Authorization: Bearer blk_…` wins over cookies and skips the session. `WorkspaceGuard` then pins the key's workspace (a different `X-Workspace-Id` is refused), requires the `developerApi` plan feature (Pro/Team), and refuses routes that aren't workspace routes or are marked `@SessionOnly()` (`/v1/me`, account, admin).
- **Rate limit:** 120 requests a minute per key (by hashed token), separate from the per-IP limit.
- **Reference:** a public OpenAPI document of key-usable operations at `/v1/openapi.json`, rendered at `/docs/api`, in every environment. The full internal reference stays out of production.

## Consequences

- Integrations can use the existing REST API unchanged, with existing permission checks and tenant scoping.
- Keys inherit a person's identity: if that person leaves, integrations break and need a new key from someone else. We say so in the UI.
- Rate-limit counters live in Valkey (`RedisThrottlerStorage`, one atomic Lua step per hit), so they hold across API instances. If Valkey is unreachable, requests are allowed rather than failed.
- Follow-up: OAuth applications (third-party apps with consent) can reuse scopes, guard and audit pieces; Zapier/Make templates.

## Alternatives considered

- **`@better-auth/api-key`** — separate permission model and session mocking; we'd still need our RBAC mapping and workspace pinning.
- **Service accounts (keys not tied to a person)** — needs a synthetic member and changes to every "who did this" field; more work for little gain now.
- **OAuth applications now** — needed for third-party apps acting for other users, not for owners automating their own workspace.
