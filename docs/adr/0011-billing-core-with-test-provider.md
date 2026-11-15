# ADR-0011: Ship the billing core with a built-in test provider; add the MoR adapter later

- **Status:** Accepted
- **Date:** 2026-11-15
- **Deciders:** Billleaf founding team

## Context

ADR-0010 chose a Merchant of Record behind a `BillingProvider` interface, but which MoR (Paddle or Lemon Squeezy) depends on the operating company's jurisdiction, which isn't settled. Everything else — plans, entitlement enforcement, subscription state, the webhook pipeline, the billing UI — doesn't depend on that choice, and the app needs it to enforce Free limits.

## Decision

- Build the provider-agnostic core now, with one adapter: **`TestBillingProvider`** (`BILLING_PROVIDER=test`). Its hosted checkout and portal are pages in the web app (Settings → Billing → test), and every action is delivered as an **HMAC-signed webhook** through the same pipeline a real provider uses. It reports `available = false` in production, so production shows "online billing isn't set up yet" instead of taking fake payments.
- **Webhook pipeline:** verify the signature on the raw body → insert into `billing_events` (unique `provider + event_id`, so redelivery is a no-op) → **apply inline** (one small transactional upsert of `workspace_subscriptions`, ignoring events older than `last_event_at`) → on failure, store the error and retry from the `billing` BullMQ queue with backoff. The normalised event is stored with the raw payload so retries need no provider call.
- **Entitlements** come from the _effective_ plan (`effectivePlan()` in `@workspace/contracts`): canceled → Free; scheduled cancellation → Free after the period ends; past due → keeps the plan for a 14-day grace period after the period end.

## Consequences

- Limits are enforced and the whole upgrade/downgrade lifecycle is testable locally and in CI, without provider accounts.
- Adding Paddle or Lemon Squeezy means one adapter class (checkout, portal, change plan, webhook parsing/verification) plus env vars — no feature-module changes.
- Applying inline means a normal webhook updates the plan before the provider gets its 200, so the UI reflects upgrades immediately; the queue only handles failures.
- Until an adapter ships, production workspaces stay on the plan set in the database (Free by default).

## Alternatives considered

- **Pick a provider now** — blocks on the jurisdiction decision; rework if it changes.
- **Queue every webhook before applying** — more moving parts and a visible delay after checkout, for an operation that is a single indexed upsert.
- **No test provider (seed plans in the DB)** — leaves checkout, portal and webhook handling untested until the real provider lands.
