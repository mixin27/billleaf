import { randomBytes, randomUUID } from "node:crypto"

import { InjectQueue } from "@nestjs/bullmq"
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common"
import {
  type CreateWebhookEndpointInput,
  type UpdateWebhookEndpointInput,
  WEBHOOK_PING_EVENT,
  type WebhookDelivery,
  type WebhookDeliveryList,
  type WebhookDeliveryStatus,
  type WebhookEndpoint,
  type WebhookEndpointList,
  type WebhookEventType,
  type WebhookSecret,
} from "@workspace/contracts"
import { webhookDeliveries, webhookEndpoints } from "@workspace/db"
import type { Queue } from "bullmq"
import { and, arrayContains, count, desc, eq, sql } from "drizzle-orm"

import { RequestContext } from "../../common/context/request-context.js"
import { offsetOf, type PageArgs } from "../../common/pagination.js"
import { EntitlementsService } from "../../billing/entitlements.service.js"
import { ENV, type Env } from "../../core/config/env.js"
import { InjectDb, type Database } from "../../core/database/database.module.js"
import { QUEUES } from "../../core/queue/queue.module.js"
import { AuditService } from "../../iam/audit/audit.service.js"
import { assertAllowedUrl, UnsafeTargetError } from "./safe-http.js"

type EndpointRow = typeof webhookEndpoints.$inferSelect
type DeliveryRow = typeof webhookDeliveries.$inferSelect

/** BullMQ retries: 1 + 7 more, 1 min doubling (≈ 2 h in all). */
export const DELIVERY_JOB_OPTS = {
  attempts: 8,
  backoff: { type: "exponential", delay: 60_000 },
  removeOnComplete: 1_000,
  removeOnFail: 1_000,
} as const

export function allowPrivateTargets(env: Env) {
  return env.WEBHOOKS_ALLOW_PRIVATE_URLS ?? env.NODE_ENV !== "production"
}

const newSecret = () => `whsec_${randomBytes(24).toString("base64url")}`

function toDelivery(d: DeliveryRow): WebhookDelivery {
  return {
    id: d.id,
    endpointId: d.endpointId,
    eventId: d.eventId,
    eventType: d.eventType,
    status: d.status,
    attempts: d.attempts,
    responseStatus: d.responseStatus,
    responseBody: d.responseBody,
    error: d.error,
    durationMs: d.durationMs,
    payload: d.payload,
    deliveredAt: d.deliveredAt?.toISOString() ?? null,
    createdAt: d.createdAt.toISOString(),
  }
}

/**
 * Settings → Webhooks, and `emit()`: services call it after an action
 * commits. It never throws, so a webhook problem can't break the action.
 */
@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name)

  constructor(
    @InjectDb() private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    @InjectQueue(QUEUES.webhooks) private readonly queue: Queue,
    private readonly ctx: RequestContext,
    private readonly entitlements: EntitlementsService,
    private readonly audit: AuditService
  ) {}

  private scope() {
    return eq(webhookEndpoints.workspaceId, this.ctx.workspaceId)
  }

  private checkUrl(url: string) {
    try {
      return assertAllowedUrl(url, allowPrivateTargets(this.env)).toString()
    } catch (err) {
      if (err instanceof UnsafeTargetError)
        throw new BadRequestException({
          message: err.message,
          code: "webhook_url_not_allowed",
        })
      throw err
    }
  }

  private async toDto(e: EndpointRow): Promise<WebhookEndpoint> {
    const [last] = await this.db
      .select({
        status: webhookDeliveries.status,
        createdAt: webhookDeliveries.createdAt,
      })
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.endpointId, e.id))
      .orderBy(desc(webhookDeliveries.createdAt))
      .limit(1)
    return {
      id: e.id,
      url: e.url,
      description: e.description,
      events: e.events,
      secretHint: `whsec_…${e.secret.slice(-4)}`,
      enabled: e.enabled,
      disabledReason: e.disabledReason,
      consecutiveFailures: e.consecutiveFailures,
      lastDelivery: last
        ? { status: last.status, createdAt: last.createdAt.toISOString() }
        : null,
      createdAt: e.createdAt.toISOString(),
    }
  }

  private async require(id: string): Promise<EndpointRow> {
    const [row] = await this.db
      .select()
      .from(webhookEndpoints)
      .where(and(this.scope(), eq(webhookEndpoints.id, id)))
    if (!row) throw new NotFoundException("Webhook not found")
    return row
  }

  async list(): Promise<WebhookEndpointList> {
    const rows = await this.db
      .select()
      .from(webhookEndpoints)
      .where(this.scope())
      .orderBy(webhookEndpoints.createdAt)
    return {
      items: await Promise.all(rows.map((r) => this.toDto(r))),
      available: await this.entitlements.hasFeature("developerApi"),
    }
  }

  async create(input: CreateWebhookEndpointInput): Promise<WebhookSecret> {
    await this.entitlements.assertFeature("developerApi")
    const [{ n } = { n: 0 }] = await this.db
      .select({ n: count() })
      .from(webhookEndpoints)
      .where(this.scope())
    if (n >= 10)
      throw new BadRequestException({
        message: "A workspace can have up to 10 webhooks",
        code: "webhook_limit",
      })
    const secret = newSecret()
    const [row] = await this.db
      .insert(webhookEndpoints)
      .values({
        workspaceId: this.ctx.workspaceId,
        url: this.checkUrl(input.url),
        description: input.description ?? null,
        events: input.events,
        secret,
      })
      .returning()
    await this.audit.record("webhook.created", {
      resourceType: "webhook",
      resourceId: row!.id,
      metadata: { url: row!.url, events: row!.events },
    })
    return { endpoint: await this.toDto(row!), secret }
  }

  async update(
    id: string,
    input: UpdateWebhookEndpointInput
  ): Promise<WebhookEndpoint> {
    await this.require(id)
    const values: Partial<typeof webhookEndpoints.$inferInsert> = {
      updatedAt: new Date(),
    }
    if (input.url !== undefined) values.url = this.checkUrl(input.url)
    if (input.description !== undefined) values.description = input.description
    if (input.events !== undefined) values.events = input.events
    if (input.enabled !== undefined) {
      if (input.enabled) await this.entitlements.assertFeature("developerApi")
      values.enabled = input.enabled
      values.disabledReason = null
      if (input.enabled) values.consecutiveFailures = 0
    }
    const [row] = await this.db
      .update(webhookEndpoints)
      .set(values)
      .where(and(this.scope(), eq(webhookEndpoints.id, id)))
      .returning()
    await this.audit.record("webhook.updated", {
      resourceType: "webhook",
      resourceId: id,
      metadata: { ...input },
    })
    return this.toDto(row!)
  }

  async rotateSecret(id: string): Promise<WebhookSecret> {
    await this.require(id)
    const secret = newSecret()
    const [row] = await this.db
      .update(webhookEndpoints)
      .set({ secret, updatedAt: new Date() })
      .where(and(this.scope(), eq(webhookEndpoints.id, id)))
      .returning()
    await this.audit.record("webhook.secret_rotated", {
      resourceType: "webhook",
      resourceId: id,
    })
    return { endpoint: await this.toDto(row!), secret }
  }

  async remove(id: string): Promise<void> {
    const row = await this.require(id)
    await this.db
      .delete(webhookEndpoints)
      .where(and(this.scope(), eq(webhookEndpoints.id, id)))
    await this.audit.record("webhook.deleted", {
      resourceType: "webhook",
      resourceId: id,
      metadata: { url: row.url },
    })
  }

  async deliveries(
    endpointId: string,
    q: PageArgs & { status?: WebhookDeliveryStatus }
  ): Promise<WebhookDeliveryList> {
    await this.require(endpointId)
    const where = and(
      eq(webhookDeliveries.workspaceId, this.ctx.workspaceId),
      eq(webhookDeliveries.endpointId, endpointId),
      q.status ? eq(webhookDeliveries.status, q.status) : undefined
    )
    const [rows, [total]] = await Promise.all([
      this.db
        .select()
        .from(webhookDeliveries)
        .where(where)
        .orderBy(desc(webhookDeliveries.createdAt), desc(webhookDeliveries.id))
        .limit(q.pageSize)
        .offset(offsetOf(q.page, q.pageSize)),
      this.db.select({ n: count() }).from(webhookDeliveries).where(where),
    ])
    return {
      items: rows.map(toDelivery),
      total: total?.n ?? 0,
      page: q.page,
      pageSize: q.pageSize,
    }
  }

  /** Send a `ping` event to one endpoint (ignores its event list). */
  async sendTest(id: string): Promise<WebhookDelivery> {
    await this.entitlements.assertFeature("developerApi")
    const endpoint = await this.require(id)
    const [delivery] = await this.enqueue(
      [endpoint.id],
      this.envelope(WEBHOOK_PING_EVENT, {
        message: "Test event from Billleaf",
      })
    )
    return toDelivery(delivery!)
  }

  /** Deliver the same event (same id and payload) again. */
  async resend(deliveryId: string): Promise<WebhookDelivery> {
    await this.entitlements.assertFeature("developerApi")
    const [old] = await this.db
      .select()
      .from(webhookDeliveries)
      .where(
        and(
          eq(webhookDeliveries.workspaceId, this.ctx.workspaceId),
          eq(webhookDeliveries.id, deliveryId)
        )
      )
    if (!old) throw new NotFoundException("Delivery not found")
    const [delivery] = await this.enqueue([old.endpointId], {
      id: old.eventId,
      type: old.eventType,
      payload: old.payload,
    })
    return toDelivery(delivery!)
  }

  private envelope(type: string, object: unknown) {
    const id = `evt_${randomUUID().replace(/-/g, "")}`
    return {
      id,
      type,
      payload: {
        id,
        type,
        createdAt: new Date().toISOString(),
        workspaceId: this.ctx.workspaceId,
        // Plain JSON (dates as ISO strings), frozen at emit time.
        data: { object: JSON.parse(JSON.stringify(object ?? null)) },
      } as unknown,
    }
  }

  private async enqueue(
    endpointIds: string[],
    event: { id: string; type: string; payload: unknown }
  ): Promise<DeliveryRow[]> {
    const rows = await this.db
      .insert(webhookDeliveries)
      .values(
        endpointIds.map((endpointId) => ({
          workspaceId: this.ctx.workspaceId,
          endpointId,
          eventId: event.id,
          eventType: event.type,
          payload: event.payload,
        }))
      )
      .returning()
    await this.queue.addBulk(
      rows.map((r) => ({
        name: "deliver",
        data: { deliveryId: r.id },
        opts: { ...DELIVERY_JOB_OPTS, jobId: r.id },
      }))
    )
    return rows
  }

  /**
   * Queue `type` for every enabled endpoint subscribed to it. Call after the
   * change is committed. Never throws.
   */
  async emit(type: WebhookEventType, object: unknown): Promise<void> {
    try {
      const endpoints = await this.db
        .select({ id: webhookEndpoints.id })
        .from(webhookEndpoints)
        .where(
          and(
            this.scope(),
            eq(webhookEndpoints.enabled, true),
            arrayContains(webhookEndpoints.events, [type])
          )
        )
      if (endpoints.length === 0) return
      if (!(await this.entitlements.hasFeature("developerApi"))) return
      await this.enqueue(
        endpoints.map((e) => e.id),
        this.envelope(type, object)
      )
    } catch (err) {
      this.logger.error({ err, type }, "Couldn't queue webhook event")
    }
  }

  /** Daily: forget deliveries older than 30 days (all workspaces). */
  async prune(): Promise<number> {
    const rows = await this.db
      .delete(webhookDeliveries)
      .where(sql`${webhookDeliveries.createdAt} < now() - interval '30 days'`)
      .returning({ id: webhookDeliveries.id })
    return rows.length
  }
}
