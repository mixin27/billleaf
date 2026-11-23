# ADR-0018: Push notifications through Expo's push service, behind a provider interface

- **Status:** Accepted
- **Date:** 2026-11-23
- **Deciders:** Billleaf maintainers

## Context

The mobile app (ADR-0017) shows what's happening in a workspace, but only when it's open. The moments that matter most to a freelancer happen elsewhere: a client accepts a quote or signs a contract in the portal, a payment is recorded, a teammate submits a timesheet. People asked to hear about those on their phone.

What existed: no event bus and no notifications. `WebhooksService.emit` was the only hook at those points, and it returns early when a workspace has no webhook endpoints. The worker already runs BullMQ queues for email and webhooks. The app is built with Expo, which can hand out a push token for iOS and Android alike.

## Decision

We will send push notifications through **Expo's push service**, behind a small `PushProvider` interface (`send`, `receipts`).

- **Events.** A `DomainEvents.publish(type, object)` call replaces `webhooks.emit` where an event can notify: `quote.accepted` / `quote.declined`, `contract.signed`, `payment.recorded`, `payment_proof.submitted`, `timesheet.submitted`. It fans out to webhooks (unchanged) and to `NotificationsService.notify`. Like `emit`, it runs after the change is committed and never throws. Other events keep calling `webhooks.emit`.
- **Who gets it.** Four push types (`PUSH_TYPES` in `@workspace/contracts`), each tied to a permission: quote answered → `quote.read`, contract signed → `contract.read`, payment received (recorded or proof sent) → `invoice.read`, timesheet submitted → `time.approve`. Recipients are the workspace's members holding it (owners and locked roles hold everything), minus the member who did it (portal actions have none, so everyone is told), minus anyone who turned that type off.
- **Where.** `push_devices` holds one row per Expo push token, bound to the user who signed in on that phone last; the app registers it after sign-in and removes it on sign-out. `notification_settings` stores per-user choices; no row means on. Choices follow the user across phones and workspaces.
- **Sending.** The API works out the recipients and queues one `send` job on a new `push` queue with the tokens. The worker sends it (`ExpoPushProvider`, chunked by the SDK), deletes tokens Expo reports as `DeviceNotRegistered`, and 15 minutes later checks delivery receipts for the same. `PUSH_PROVIDER=log` (the default) writes pushes to the worker log for development and CI.
- **What it says.** Short and specific: "Northwind accepted QUO-0004", "$480.00 · Website care"; "Payment received: $650.00". The data carries the workspace (id, slug, name) and the app path to open (`/quote/…`, `/contract/…`, `/invoice/…`), so a tap switches workspace and opens the right screen.

## Consequences

- One API for both platforms, and no APNs or FCM keys in our servers: Expo holds the credentials (uploaded once with `eas credentials`). Sending is free; the limit is 600 notifications per second per project.
- Pushes depend on Expo's service being up. A failed `send` is retried by BullMQ (3 attempts, backoff); after that the push is dropped. That's acceptable for a nudge, since the app and email show the same facts.
- Lock screens show client names and amounts. That's the point of the feature, and iOS and Android let people hide notification content; the per-type switches let them turn a kind off entirely.
- Recipient resolution runs in the request that caused the event (a couple of small queries), so the job is self-contained and the integration test can assert on it without a worker.
- Follow-ups: the mobile app (registration, permission prompt, taps, settings screen) is a separate change. Timesheet pushes open the app's Home, since approvals are web-only. More events can be added by mapping them in `push-messages.ts`.

## Alternatives considered

- **Direct APNs and FCM.** No dependency on Expo, but two integrations, Apple and Google keys in our secrets, and twice the code. The provider interface keeps this open if we ever need it.
- **A third-party notification service** (OneSignal and similar). Another account, SDK and data processor for something Expo already does for free.
- **An outbox table and a general event bus.** Sturdier delivery guarantees, but a larger change than these notifications need. `DomainEvents` is the seam where one could go later.
