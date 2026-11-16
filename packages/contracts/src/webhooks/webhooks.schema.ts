import { z } from "zod"

import { paged, pageQuerySchema } from "../common/pagination.js"

/**
 * Outgoing webhooks. Each event is POSTed as JSON to every enabled endpoint
 * subscribed to its type:
 *
 *   { "id": "evt_…", "type": "invoice.issued", "createdAt": "…",
 *     "workspaceId": "…", "data": { "object": { …the invoice… } } }
 *
 * Header `Billleaf-Signature: t=<unix seconds>,v1=<hex>` where v1 is
 * HMAC-SHA256(secret, `${t}.${rawBody}`). A delivery succeeds on any 2xx
 * within 10 s; failures are retried 7 times over about 2 hours, and
 * redeliveries keep the same event id.
 */
export const WEBHOOK_EVENTS = {
  "client.created": "A client is added",
  "quote.accepted": "A quote is accepted",
  "quote.declined": "A quote is declined",
  "contract.signed": "A contract is signed",
  "invoice.issued": "An invoice is issued",
  "invoice.sent": "An invoice is emailed",
  "invoice.paid": "An invoice is paid in full",
  "invoice.voided": "An invoice is voided",
  "credit_note.issued": "A credit note is issued",
  "payment.recorded": "A payment is recorded",
  "payment_proof.submitted": "A client uploads a payment proof",
  "timesheet.submitted": "A member submits a week of time for approval",
  "timesheet.approved": "A submitted week is approved",
  "timesheet.rejected": "A submitted week is sent back",
} as const
export type WebhookEventType = keyof typeof WEBHOOK_EVENTS
export const WEBHOOK_EVENT_TYPES = Object.keys(
  WEBHOOK_EVENTS
) as WebhookEventType[]

/** Sent by "Send test event"; endpoints always receive it. */
export const WEBHOOK_PING_EVENT = "ping"

/** Header names (lowercase on the wire). */
export const WEBHOOK_SIGNATURE_HEADER = "billleaf-signature"
export const WEBHOOK_EVENT_HEADER = "billleaf-event"
export const WEBHOOK_DELIVERY_HEADER = "billleaf-delivery"

/** An endpoint is turned off after this many deliveries failed in a row. */
export const WEBHOOK_DISABLE_AFTER_FAILURES = 10

const eventList = z
  .array(
    z.enum(WEBHOOK_EVENT_TYPES as [WebhookEventType, ...WebhookEventType[]])
  )
  .min(1, "Pick at least one event")
  .max(WEBHOOK_EVENT_TYPES.length)
  .transform((v) => [...new Set(v)])

const webhookUrl = z
  .url({ protocol: /^https?$/, message: "Enter a full URL, e.g. https://…" })
  .max(2000)

export const webhookEndpointSchema = z.object({
  id: z.string(),
  url: z.string(),
  description: z.string().nullable(),
  events: z.array(z.string()),
  /** Last 4 characters only; the full secret is shown on create/rotate. */
  secretHint: z.string(),
  enabled: z.boolean(),
  disabledReason: z.string().nullable(),
  consecutiveFailures: z.number().int(),
  /** Most recent delivery, for the list. */
  lastDelivery: z
    .object({
      status: z.enum(["pending", "succeeded", "failed"]),
      createdAt: z.iso.datetime(),
    })
    .nullable(),
  createdAt: z.iso.datetime(),
})
export type WebhookEndpoint = z.infer<typeof webhookEndpointSchema>

export const webhookEndpointListSchema = z.object({
  items: z.array(webhookEndpointSchema),
  /** False on plans without webhooks: endpoints stay but nothing is sent. */
  available: z.boolean(),
})
export type WebhookEndpointList = z.infer<typeof webhookEndpointListSchema>

/** Returned once, when an endpoint is created or its secret rotated. */
export const webhookSecretSchema = z.object({
  endpoint: webhookEndpointSchema,
  secret: z.string(),
})
export type WebhookSecret = z.infer<typeof webhookSecretSchema>

export const createWebhookEndpointSchema = z.object({
  url: webhookUrl,
  description: z
    .string()
    .trim()
    .max(200)
    .nullish()
    .transform((v) => v || null),
  events: eventList,
})
export type CreateWebhookEndpointInput = z.input<
  typeof createWebhookEndpointSchema
>

export const updateWebhookEndpointSchema = z
  .object({
    url: webhookUrl,
    description: z
      .string()
      .trim()
      .max(200)
      .nullable()
      .transform((v) => v || null),
    events: eventList,
    /** Turning an endpoint back on also clears its failure count. */
    enabled: z.boolean(),
  })
  .partial()
export type UpdateWebhookEndpointInput = z.input<
  typeof updateWebhookEndpointSchema
>

export const webhookDeliveryStatusSchema = z.enum([
  "pending",
  "succeeded",
  "failed",
])
export type WebhookDeliveryStatus = z.infer<typeof webhookDeliveryStatusSchema>

export const webhookDeliverySchema = z.object({
  id: z.string(),
  endpointId: z.string(),
  eventId: z.string(),
  eventType: z.string(),
  status: webhookDeliveryStatusSchema,
  attempts: z.number().int(),
  responseStatus: z.number().int().nullable(),
  responseBody: z.string().nullable(),
  error: z.string().nullable(),
  durationMs: z.number().int().nullable(),
  payload: z.unknown(),
  deliveredAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
})
export type WebhookDelivery = z.infer<typeof webhookDeliverySchema>

export const listWebhookDeliveriesQuerySchema = pageQuerySchema.extend({
  status: webhookDeliveryStatusSchema.optional(),
})
export type ListWebhookDeliveriesQuery = z.input<
  typeof listWebhookDeliveriesQuerySchema
>

export const webhookDeliveryListSchema = paged(webhookDeliverySchema)
export type WebhookDeliveryList = z.infer<typeof webhookDeliveryListSchema>
