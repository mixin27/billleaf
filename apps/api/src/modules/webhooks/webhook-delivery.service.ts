import { Inject, Injectable, Logger } from "@nestjs/common"
import {
  WEBHOOK_DELIVERY_HEADER,
  WEBHOOK_DISABLE_AFTER_FAILURES,
  WEBHOOK_EVENT_HEADER,
  WEBHOOK_SIGNATURE_HEADER,
} from "@workspace/contracts"
import { webhookDisabledEmail } from "@workspace/emails"
import {
  member,
  organization,
  user,
  webhookDeliveries,
  webhookEndpoints,
} from "@workspace/db"
import { and, eq, sql } from "drizzle-orm"

import { ENV, type Env } from "../../core/config/env.js"
import { InjectDb, type Database } from "../../core/database/database.module.js"
import { MailService } from "../../mail/mail.service.js"
import {
  assertAllowedUrl,
  postJson,
  signatureHeader,
  UnsafeTargetError,
} from "./safe-http.js"
import { allowPrivateTargets } from "./webhooks.service.js"

export type AttemptResult = "succeeded" | "retry" | "failed" | "skipped"

/**
 * One delivery attempt (worker). Records the outcome on the delivery;
 * returns "retry" when the caller should try again later. A delivery that
 * fails for good counts against its endpoint, which is turned off (and its
 * owners emailed) after WEBHOOK_DISABLE_AFTER_FAILURES in a row.
 */
@Injectable()
export class WebhookDeliveryService {
  private readonly logger = new Logger(WebhookDeliveryService.name)

  constructor(
    @InjectDb() private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly mail: MailService
  ) {}

  async attempt(deliveryId: string, last: boolean): Promise<AttemptResult> {
    const [row] = await this.db
      .select({ delivery: webhookDeliveries, endpoint: webhookEndpoints })
      .from(webhookDeliveries)
      .innerJoin(
        webhookEndpoints,
        eq(webhookEndpoints.id, webhookDeliveries.endpointId)
      )
      .where(eq(webhookDeliveries.id, deliveryId))
    if (!row || row.delivery.status !== "pending") return "skipped"
    const { delivery, endpoint } = row
    if (!endpoint.enabled) {
      await this.finish(deliveryId, {
        status: "failed",
        error: "The webhook is turned off",
      })
      return "skipped"
    }

    const allowPrivate = allowPrivateTargets(this.env)
    const body = JSON.stringify(delivery.payload)
    const started = Date.now()
    let status: number | null = null
    let responseBody: string | null = null
    let error: string | null = null
    let unsafe = false
    try {
      const url = assertAllowedUrl(endpoint.url, allowPrivate)
      const res = await postJson(
        url,
        body,
        {
          "user-agent": "Billleaf-Webhooks/1.0",
          [WEBHOOK_EVENT_HEADER]: delivery.eventType,
          [WEBHOOK_DELIVERY_HEADER]: delivery.id,
          [WEBHOOK_SIGNATURE_HEADER]: signatureHeader(
            endpoint.secret,
            body,
            Math.floor(Date.now() / 1000)
          ),
        },
        { allowPrivate, timeoutMs: 10_000 }
      )
      status = res.status
      responseBody = res.body || null
      if (status < 200 || status >= 300)
        error =
          status >= 300 && status < 400
            ? `Redirected (${status}); redirects aren't followed`
            : `HTTP ${status}`
    } catch (err) {
      unsafe = err instanceof UnsafeTargetError
      error = err instanceof Error ? err.message : String(err)
    }
    const ok = error === null
    const final = ok || last || unsafe
    await this.finish(deliveryId, {
      status: ok ? "succeeded" : final ? "failed" : "pending",
      attempts: delivery.attempts + 1,
      responseStatus: status,
      responseBody,
      error,
      durationMs: Date.now() - started,
      deliveredAt: ok ? new Date() : null,
    })

    if (ok) {
      if (endpoint.consecutiveFailures > 0)
        await this.db
          .update(webhookEndpoints)
          .set({ consecutiveFailures: 0 })
          .where(eq(webhookEndpoints.id, endpoint.id))
      return "succeeded"
    }
    if (!final) return "retry"
    await this.countFailure(endpoint.id)
    return "failed"
  }

  private async finish(
    id: string,
    values: Partial<typeof webhookDeliveries.$inferInsert>
  ) {
    await this.db
      .update(webhookDeliveries)
      .set(values)
      .where(eq(webhookDeliveries.id, id))
  }

  private async countFailure(endpointId: string) {
    const [e] = await this.db
      .update(webhookEndpoints)
      .set({
        consecutiveFailures: sql`${webhookEndpoints.consecutiveFailures} + 1`,
      })
      .where(eq(webhookEndpoints.id, endpointId))
      .returning()
    if (
      !e ||
      !e.enabled ||
      e.consecutiveFailures < WEBHOOK_DISABLE_AFTER_FAILURES
    )
      return
    // Only the request that crosses the line turns it off and emails.
    const [off] = await this.db
      .update(webhookEndpoints)
      .set({
        enabled: false,
        disabledReason: `Turned off after ${e.consecutiveFailures} failed deliveries in a row`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(webhookEndpoints.id, endpointId),
          eq(webhookEndpoints.enabled, true)
        )
      )
      .returning()
    if (off) await this.notifyOwners(off)
  }

  private async notifyOwners(e: typeof webhookEndpoints.$inferSelect) {
    try {
      const [ws] = await this.db
        .select({ name: organization.name, slug: organization.slug })
        .from(organization)
        .where(eq(organization.id, e.workspaceId))
      if (!ws) return
      const owners = await this.db
        .select({ email: user.email })
        .from(member)
        .innerJoin(user, eq(user.id, member.userId))
        .where(
          and(
            eq(member.organizationId, e.workspaceId),
            eq(member.role, "owner")
          )
        )
      const settingsUrl = `${this.env.WEB_URL}/${encodeURIComponent(ws.slug ?? e.workspaceId)}/settings/webhooks`
      for (const o of owners)
        await this.mail.send(
          webhookDisabledEmail({
            to: o.email,
            workspaceName: ws.name,
            url: e.url,
            failures: e.consecutiveFailures,
            settingsUrl,
          })
        )
    } catch (err) {
      this.logger.error({ err, endpointId: e.id }, "Couldn't email owners")
    }
  }
}
