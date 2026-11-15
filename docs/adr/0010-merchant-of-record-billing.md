# ADR-0010: Merchant of Record for SaaS billing behind a provider interface

- **Status:** Accepted
- **Date:** 2026-11-15
- **Deciders:** Billleaf founding team

## Context

Billleaf sells subscriptions globally. Handling VAT/GST/sales tax registration and remittance ourselves is costly, and Stripe availability depends on the company's jurisdiction.

## Decision

Use a **Merchant of Record — Paddle or Lemon Squeezy** — for SaaS subscriptions, integrated behind a **`BillingProvider` interface** (checkout, customer portal, webhook → normalized events). Store only `workspace_subscriptions`; derive **entitlements** (limits and feature flags) from the plan so feature code never checks plan names. Confirm provider availability for the operating company's country of incorporation before going live.

## Consequences

- Tax compliance and invoicing to customers handled by the MoR.
- Higher fees than raw Stripe (~5% + fixed).
- Swappable later (e.g. Stripe Billing) without touching feature modules.
- Webhooks must be verified and idempotent.

## Alternatives considered

- **Stripe Billing directly** — lower fees, but we own tax compliance; may be unavailable in our jurisdiction.
- **Build our own billing** — not a core competency.
