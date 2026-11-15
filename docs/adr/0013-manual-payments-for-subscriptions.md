# ADR-0013: Take subscription payments manually, approved by platform admins

- **Status:** Accepted
- **Date:** 2026-11-15
- **Deciders:** Billleaf founding team

## Context

ADR-0010 chose a Merchant of Record (Paddle or Lemon Squeezy) and ADR-0011 left the adapter for later. Neither provider, nor Stripe or PayPal, serves businesses in Myanmar, which is Billleaf's first market. Customers there pay by bank transfer or mobile wallet (KBZPay, WavePay, AYA Pay) and send a screenshot. There is no budget for a payment service either. Without a way to take money, every workspace stays on Free.

## Decision

We add a **`manual` billing provider** (`BILLING_PROVIDER=manual`) and run it in production until an online provider is possible:

- **Prices** are set by platform admins per plan, interval and currency (`platform_prices`, minor units). `PLANS[...].prices` in code stay display defaults only.
- **Where to pay** is Billleaf's own list of bank accounts and wallets with optional QR codes (`platform_payment_accounts`). Their images live in object storage under `_platform/` and don't count against any workspace's quota.
- **Pay and upload proof:** on Settings → Billing → Pay, a member with `billing.manage` picks a plan, interval, currency and number of periods (amount = price × periods, set by the server) and uploads a screenshot (`subscription_payments`). Only **one pending request** per workspace is allowed, enforced by a partial unique index. Platform admins get an email.
- **Approve or reject** in the admin portal (Approvals):
  - Approval moves the row from `pending` once, so a double click returns 409.
  - It then applies a billing event with id `manual-<payment id>` through the existing `billing_events` → apply pipeline, so history and idempotency work as for any provider.
  - Renewing the **same plan before it ends stacks** onto the current period; otherwise the period starts now.
  - Manual plans always have `cancel_at_period_end = true`: they end unless paid again.
  - Rejection stores a reason and emails the owners.
- **Expiry:** `effectivePlan()` gives `manual` plans a **7-day grace period** (`MANUAL_GRACE_DAYS`) after the period end, then Free. No data is deleted.
- **Reminders:** an hourly job on the `billing` queue emails owners 7 days and 1 day before the end, and once when the plan has ended. `workspace_subscriptions.last_reminder` makes each one go out once per period. The app shows a banner in the last 7 days and during the grace period.
- **Admin "Set plan"** (comps, corrections) uses the same `manual` events.

## Consequences

- Workspaces can pay with what they already use, at no cost to Billleaf. The cost is manual work: an admin checks each screenshot against the bank or wallet. That is acceptable at early volumes, and the approvals queue keeps it to minutes.
- Screenshots can be faked, so approval means matching the transaction in the real account, not trusting the image. The reference, payer and IP address are recorded for that.
- Renewals aren't automatic. The reminders and the grace period are what keep churn from missed payments down.
- An online provider can still be added later as another `BillingProvider`. Both can coexist: subscriptions record their own `provider`.

## Alternatives considered

- **Stay on Free until a provider is available:** no revenue, and no way to learn whether people will pay.
- **Admin "Set plan" only** (payment details over chat): no record of what was paid, no proof stored, and every renewal is chased by hand.
- **A local payment gateway (e.g. KBZPay merchant API, 2C2P):** needs a registered company, a merchant account and fees. Worth revisiting once there's volume.
