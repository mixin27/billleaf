# ADR-0014: Outgoing webhooks delivered by the worker, with an SSRF guard

- **Status:** Accepted
- **Date:** 2026-11-16
- **Deciders:** Billleaf maintainers

## Context

Freelancers want Billleaf events (an invoice paid, a quote accepted) in other tools: accounting, spreadsheets, chat, Zapier/Make. We have no budget for a hosted webhook service, and the receiving URLs are typed in by customers, so sending to them is a server-side request forgery risk on our own VPS.

## Decision

We will build webhooks into the API and worker:

- **Endpoints** (`webhook_endpoints`) belong to a workspace: URL, chosen event types, and a signing secret shown once (on create or rotate). Managing them needs `webhook.manage`; sending needs the `webhooks` plan feature (Pro and Team).
- **Emitting:** services call `WebhooksService.emit(type, object)` after their change commits. It writes one `webhook_deliveries` row per subscribed endpoint (payload frozen at that moment) and queues a job on the `webhooks` queue. It never throws, so a webhook problem can't break the action.
- **Delivering** (worker): a signed JSON POST (`Billleaf-Signature: t=…,v1=HMAC-SHA256(secret, "t.body")`), 10 s timeout, no redirects, first 1 KB of the response kept. Any 2xx succeeds; otherwise BullMQ retries 7 more times with exponential backoff from 1 minute (≈ 2 hours). Resends keep the event id, so receivers can de-duplicate.
- **Failing endpoints** are turned off after 10 deliveries in a row fail for good, and owners are emailed.
- **SSRF guard:** production allows only `https://` to public addresses. The address check runs inside the socket's DNS lookup, so a hostname can't resolve to a private address between the check and the connection. `WEBHOOKS_ALLOW_PRIVATE_URLS` (defaults on outside production) allows local targets for development and tests.
- Deliveries are kept 30 days.

## Consequences

- Customers get reliable, verifiable events with no third-party cost.
- Delivery is at-least-once and unordered; we say so in the docs and give event ids.
- Secrets are stored in clear text (we must sign with them). Database backups are therefore sensitive, as they already are.
- Payloads are snapshots: a receiver that needs the latest state should fetch it.
- Follow-up: Zapier/Make templates on top of these events; more event types as people ask.

## Alternatives considered

- **Hosted webhook service (Svix, Hookdeck)** — costs money and adds a processor of customer data.
- **Fire-and-forget from the API request** — no retries, slows requests, and loses events on restart.
- **Check the URL only when it's saved** — DNS can change afterwards (rebinding), so the check has to happen when connecting.
