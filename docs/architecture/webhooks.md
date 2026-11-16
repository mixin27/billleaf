# Outgoing webhooks

Workspaces on Pro and Team can have Billleaf POST events to their own URLs (Settings → Webhooks). Design: [ADR-0014](../adr/0014-outgoing-webhooks.md).

## Events

| Type                      | When                                         | `data.object`      |
| ------------------------- | -------------------------------------------- | ------------------ |
| `client.created`          | A client is added                            | Client             |
| `quote.accepted`          | A quote is accepted (in the app or portal)   | Quote              |
| `quote.declined`          | A quote is declined                          | Quote              |
| `contract.signed`         | A contract is signed                         | Contract           |
| `invoice.issued`          | An invoice is issued                         | Invoice            |
| `invoice.sent`            | An invoice is emailed                        | Invoice            |
| `invoice.paid`            | A payment settles the invoice in full        | Invoice            |
| `invoice.voided`          | An invoice is voided                         | Invoice            |
| `credit_note.issued`      | A credit note is issued                      | Credit note        |
| `payment.recorded`        | A payment is recorded (or a proof confirmed) | Payment            |
| `payment_proof.submitted` | A client uploads a payment proof             | Proof summary      |
| `timesheet.submitted`     | A member submits a week for approval         | Timesheet approval |
| `timesheet.approved`      | A submitted week is approved                 | Timesheet approval |
| `timesheet.rejected`      | A week is sent back or reopened              | Timesheet approval |
| `ping`                    | "Send test event"                            | `{ message }`      |

Objects have the same shape as the REST API's responses (see `/docs`), frozen when the event happened.

## Request

```http
POST /your/endpoint
Content-Type: application/json
User-Agent: Billleaf-Webhooks/1.0
Billleaf-Event: invoice.paid
Billleaf-Delivery: <delivery id>
Billleaf-Signature: t=1763300000,v1=5f2b…

{"id":"evt_…","type":"invoice.paid","createdAt":"2026-11-16T10:00:00.000Z","workspaceId":"…","data":{"object":{…}}}
```

Answer any `2xx` within 10 seconds. Anything else (or a timeout, or a redirect) is retried 7 more times, starting after 1 minute and doubling (about 2 hours in all). After 10 events in a row fail for good, the webhook is turned off and workspace owners are emailed.

Delivery is **at least once** and **not ordered**: use the event `id` to ignore duplicates (a manual "Resend" keeps the same id).

## Verifying the signature

`v1` is the hex HMAC-SHA256 of `"<t>.<raw body>"` with the webhook's secret. Compare in constant time and reject old timestamps:

```js
import { createHmac, timingSafeEqual } from "node:crypto"

export function verify(rawBody, header, secret, toleranceSeconds = 300) {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=")))
  const expected = createHmac("sha256", secret)
    .update(`${parts.t}.${rawBody}`)
    .digest("hex")
  const fresh =
    Math.abs(Date.now() / 1000 - Number(parts.t)) <= toleranceSeconds
  return (
    fresh &&
    expected.length === parts.v1?.length &&
    timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1))
  )
}
```

Use the body exactly as received (before JSON parsing).

## Internals

- Tables: `webhook_endpoints`, `webhook_deliveries` (see [data model](data-model.md)). Deliveries are pruned after 30 days.
- `WebhooksService.emit()` is called by services after their change commits and never throws.
- The worker's `WebhookProcessor` sends with `node:http(s)`; the DNS lookup refuses private, loopback, link-local and other reserved addresses (`safe-http.ts`). `WEBHOOKS_ALLOW_PRIVATE_URLS` turns this off (default: on outside production only).
- Limits: 10 webhooks per workspace; 1 KB of each response is kept.
