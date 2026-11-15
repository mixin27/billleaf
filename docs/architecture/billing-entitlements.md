# Billing & Entitlements

Product side: [Business model](../product/business-model.md). Decisions: [ADR-0010 Merchant of Record billing](../adr/0010-merchant-of-record-billing.md), [ADR-0011 Billing core with a test provider](../adr/0011-billing-core-with-test-provider.md).

> This is Billleaf charging **its** customers (SaaS subscription). Freelancers invoicing **their** clients is the Invoices module — unrelated code.

## Components (`apps/api/src/billing/`)

```mermaid
flowchart LR
  web[Web: Settings → Billing] -->|checkout / portal URL| api
  api -->|BillingProvider| mor[Paddle / Lemon Squeezy]
  mor -->|signed webhook| api
  api -->|enqueue| worker
  worker -->|upsert| subs[(workspace_subscriptions)]
  subs --> ent[EntitlementsService]
  ent --> guards[EntitlementsService.assertWithinLimit]
```

### Status

Implemented: plans, entitlement enforcement, subscription state, webhook pipeline, Settings → Billing, and a **test provider** (`BILLING_PROVIDER=test`, unavailable in production). Pending: a Paddle or Lemon Squeezy adapter (see ADR-0011).

### `BillingProvider` (`billing/providers/billing-provider.ts`)

- `createCheckout`, `createPortalSession`, `changePlan`, and `parseWebhook(rawBody, headers)`, which verifies the signature and normalises the payload into a `BillingEvent` (`subscription.activated | updated | canceled`, plan, interval, status, period end, cancel-at-period-end, workspace id from the checkout's custom data).
- Adding a provider: implement the interface, add its key to `BILLING_PROVIDER` and the factory in `BillingModule`, and point its webhooks at `POST /v1/billing/webhooks/<key>`.

### Webhook pipeline

`POST /v1/billing/webhooks/:provider` (anonymous, raw body kept by the body parser) → verify → insert `billing_events` (unique `provider + event_id`; duplicates return `duplicate: true`) → apply in a transaction (upsert `workspace_subscriptions`, skipping events older than `last_event_at`) → mark processed. If applying fails, the error is stored, the provider still gets a 200, and the `billing` queue retries with backoff.

### Test provider

Checkout and portal URLs open `/<workspace>/settings/billing/test?session=…` (a signed, 30-minute token bound to the workspace). "Pay (test)" and the portal actions (cancel / resume / payment failed / recovered / end now) are sent as signed webhooks through the pipeline above. In production the test provider is unavailable: checkout returns `billing_unavailable` and its webhooks are refused even when correctly signed (the default secret is public).

## Entitlements

- **Plan catalog:** `PLANS` in `@workspace/contracts` (shared with the web pricing UI) maps `free`, `pro`, `team` to limits (`members`, `clients`, `invoicesPerMonth`, `storageMb`) and features (`customBranding`, `recurringInvoices`, `timeTracking`, `customRoles`). Prices there are display-only; the provider charges.
- **Effective plan:** `effectivePlan()` — canceled → Free; scheduled cancellation → Free once the period ends; past due → keeps the plan for 14 days after the period end. `/v1/me` returns the effective plan and its features for UI hints.
- The catalog starts in code (`@workspace/contracts`) for type safety; per-workspace overrides (grandfathering, promos) and DB-driven plan values can be layered in so pricing changes need no feature-code changes.
- `EntitlementsService.get(workspaceId)` → resolved entitlements (cached in Valkey, invalidated on subscription change).

### Enforcement

| Entitlement         | Where                      | Behaviour                                                                                                |
| ------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------- |
| `members`           | invitations                | blocked at invite                                                                                        |
| `clients`           | create / restore client    | counts active (non-archived) clients                                                                     |
| `invoicesPerMonth`  | issuing an invoice         | drafts are never limited; counts invoices issued this month (workspace timezone); soft under concurrency |
| `storageMb`         | file uploads               | sum of stored file sizes                                                                                 |
| `customBranding`    | PDFs                       | without it: default colours, no logo, "Made with Billleaf" footer                                        |
| `recurringInvoices` | create / resume / generate | schedules pause if the plan loses it                                                                     |
| `customRoles`       | create / edit roles        | system roles keep working                                                                                |

`EntitlementsService.assertWithinLimit` / `assertFeature` throw 403 problem+json with `plan_limit_reached` / `feature_not_in_plan` and a message naming the plan and limit; the web shows it plus a "See plans" prompt. Downgrades never delete data: over-limit workspaces just can't add more.

## States

`active` · `trialing` · `past_due` (grace period, banner) · `canceled` (falls back to `free` at period end).

## Open items

- Confirm MoR availability for the operating company's jurisdiction.
- Final prices and limits.
