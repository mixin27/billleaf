import { InjectQueue } from "@nestjs/bullmq"
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common"
import {
  type BillingInterval,
  type BillingOverview,
  type CheckoutInput,
  effectivePlan,
  isPlanKey,
  type PaidPlanKey,
  subscriptionStatusSchema,
  type TestPortalAction,
  type TestSession,
} from "@workspace/contracts"
import {
  billingEvents,
  organization,
  user,
  workspaceProfiles,
  workspaceSubscriptions,
} from "@workspace/db"
import type { Queue } from "bullmq"
import { and, eq } from "drizzle-orm"

import { RequestContext } from "../common/context/request-context.js"
import { InjectDb, type Database } from "../core/database/database.module.js"
import { QUEUES } from "../core/queue/queue.module.js"
import { AuditService } from "../iam/audit/audit.service.js"
import {
  BILLING_PROVIDER,
  type BillingEvent,
  type BillingProvider,
  type SubscriptionRef,
} from "./providers/billing-provider.js"
import { TestBillingProvider } from "./providers/test-billing.provider.js"
import { UsageService } from "./usage.service.js"

type SubscriptionRow = typeof workspaceSubscriptions.$inferSelect

const addInterval = (from: Date, interval: BillingInterval) => {
  const d = new Date(from)
  if (interval === "year") d.setUTCFullYear(d.getUTCFullYear() + 1)
  else d.setUTCMonth(d.getUTCMonth() + 1)
  return d
}

/**
 * SaaS subscription for the active workspace: overview, checkout, plan
 * changes, provider portal, and the webhook pipeline that keeps
 * `workspace_subscriptions` in sync (store event → apply → retry on failure).
 */
@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name)

  constructor(
    @InjectDb() private readonly db: Database,
    @Inject(BILLING_PROVIDER) private readonly provider: BillingProvider,
    @InjectQueue(QUEUES.billing) private readonly queue: Queue,
    private readonly ctx: RequestContext,
    private readonly usage: UsageService,
    private readonly audit: AuditService
  ) {}

  // ── Workspace-facing ───────────────────────────────────────────────────

  async overview(): Promise<BillingOverview> {
    const [sub, tz] = await Promise.all([
      this.subscription(this.ctx.workspaceId),
      this.timezone(),
    ])
    const planKey = sub && isPlanKey(sub.planKey) ? sub.planKey : "free"
    return {
      planKey,
      effectivePlanKey: effectivePlan(sub),
      status: subscriptionStatusSchema.catch("active").parse(sub?.status),
      interval:
        sub?.interval === "month" || sub?.interval === "year"
          ? sub.interval
          : null,
      cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false,
      currentPeriodEnd: sub?.currentPeriodEnd?.toISOString() ?? null,
      checkoutAvailable: this.provider.available,
      canManage: Boolean(sub?.providerCustomerId),
      provider: this.provider.key,
      usage: await this.usage.all(tz),
    }
  }

  async checkout(input: CheckoutInput): Promise<{ url: string }> {
    this.assertAvailable()
    const sub = await this.subscription(this.ctx.workspaceId)
    if (this.hasLiveSubscription(sub))
      throw new ConflictException({
        message: "You already have a subscription. Switch plans instead.",
        code: "already_subscribed",
      })
    const ws = await this.workspace()
    const [u] = await this.db
      .select({ email: user.email })
      .from(user)
      .where(eq(user.id, this.ctx.userId))
    return this.provider.createCheckout({
      ...ws,
      customerEmail: u!.email,
      planKey: input.planKey,
      interval: input.interval,
    })
  }

  /** Switch plan/interval on an existing paid subscription. */
  async changePlan(input: CheckoutInput): Promise<BillingOverview> {
    this.assertAvailable()
    const sub = await this.subscription(this.ctx.workspaceId)
    if (!this.hasLiveSubscription(sub))
      throw new ConflictException({
        message: "Choose a plan to subscribe first.",
        code: "not_subscribed",
      })
    const ref = await this.ref(sub!)
    await this.provider.changePlan({ ...ref, ...input })
    if (this.provider instanceof TestBillingProvider)
      await this.simulate(sub!, {
        type: "subscription.updated",
        planKey: input.planKey,
        interval: input.interval,
      })
    await this.audit.record("billing.plan_changed", { metadata: { ...input } })
    return this.overview()
  }

  async portal(): Promise<{ url: string }> {
    this.assertAvailable()
    const sub = await this.subscription(this.ctx.workspaceId)
    if (!sub?.providerCustomerId)
      throw new ConflictException({
        message: "There's no subscription to manage yet.",
        code: "not_subscribed",
      })
    return this.provider.createPortalSession(await this.ref(sub))
  }

  // ── Webhooks (no workspace context) ───────────────────────────────────

  /**
   * Verify and store the event (idempotent on provider + event id), then
   * apply it. A failure to apply is recorded and retried by the worker, so
   * the provider always gets a 2xx once the event is safely stored.
   */
  async handleWebhook(
    providerKey: string,
    rawBody: Buffer | undefined,
    headers: Record<string, string | string[] | undefined>
  ): Promise<{ received: true; duplicate: boolean }> {
    // An unavailable provider (e.g. the test provider in production) must
    // never change subscriptions, even with a validly signed payload.
    if (providerKey !== this.provider.key || !this.provider.available)
      throw new NotFoundException("Unknown billing provider")
    if (!rawBody?.length) throw new NotFoundException("Missing body")
    const event = this.provider.parseWebhook(rawBody, headers)
    const [stored] = await this.db
      .insert(billingEvents)
      .values({
        provider: this.provider.key,
        eventId: event.id,
        type: event.type,
        workspaceId: null,
        payload: { event: { ...event, raw: undefined }, raw: event.raw },
        occurredAt: event.occurredAt,
      })
      .onConflictDoNothing()
      .returning({ id: billingEvents.id })
    if (!stored) {
      const [existing] = await this.db
        .select({
          id: billingEvents.id,
          processedAt: billingEvents.processedAt,
        })
        .from(billingEvents)
        .where(
          and(
            eq(billingEvents.provider, this.provider.key),
            eq(billingEvents.eventId, event.id)
          )
        )
        .limit(1)
      if (existing && !existing.processedAt) await this.process(existing.id)
      return { received: true, duplicate: true }
    }
    await this.process(stored.id, event)
    return { received: true, duplicate: false }
  }

  /**
   * Store and apply an event that doesn't come from a provider webhook, e.g.
   * a plan set by a platform admin or an approved manual payment. Goes
   * through the same store → apply path (idempotent on `event.id`).
   */
  async applyDirect(event: BillingEvent & { provider: string }) {
    const [stored] = await this.db
      .insert(billingEvents)
      .values({
        provider: event.provider,
        eventId: event.id,
        type: event.type,
        workspaceId: event.workspaceId,
        payload: { event: { ...event, raw: undefined }, raw: event.raw },
        occurredAt: event.occurredAt,
      })
      .onConflictDoNothing()
      .returning({ id: billingEvents.id })
    if (!stored)
      throw new ConflictException({
        message: "This change was already applied",
        code: "billing_event_duplicate",
      })
    const ok = await this.process(stored.id, event)
    if (!ok)
      throw new Error("Couldn't apply the plan change; it will be retried")
  }

  /** Apply a stored event; on failure record the error and queue a retry. */
  async process(eventRowId: string, parsed?: BillingEvent): Promise<boolean> {
    try {
      const event = parsed ?? (await this.reparse(eventRowId))
      await this.apply(event)
      await this.db
        .update(billingEvents)
        .set({
          processedAt: new Date(),
          error: null,
          workspaceId: event.workspaceId,
        })
        .where(eq(billingEvents.id, eventRowId))
      return true
    } catch (err) {
      this.logger.error({ err, eventRowId }, "Billing event failed")
      await this.db
        .update(billingEvents)
        .set({ error: (err as Error).message })
        .where(eq(billingEvents.id, eventRowId))
      await this.queue.add(
        "apply",
        { eventRowId },
        { jobId: `billing-event-${eventRowId}`, attempts: 8 }
      )
      return false
    }
  }

  /** Worker retry entrypoint: throws so BullMQ backs off and retries. */
  async retry(eventRowId: string) {
    const [row] = await this.db
      .select({ processedAt: billingEvents.processedAt })
      .from(billingEvents)
      .where(eq(billingEvents.id, eventRowId))
    if (!row || row.processedAt) return
    const event = await this.reparse(eventRowId)
    await this.apply(event)
    await this.db
      .update(billingEvents)
      .set({
        processedAt: new Date(),
        error: null,
        workspaceId: event.workspaceId,
      })
      .where(eq(billingEvents.id, eventRowId))
  }

  /** Rebuild the normalised event stored at receipt (already verified). */
  private async reparse(eventRowId: string): Promise<BillingEvent> {
    const [row] = await this.db
      .select()
      .from(billingEvents)
      .where(eq(billingEvents.id, eventRowId))
    if (!row) throw new NotFoundException("Billing event not found")
    const { event, raw } = row.payload as {
      event: Omit<BillingEvent, "raw" | "occurredAt" | "currentPeriodEnd"> & {
        occurredAt: string
        currentPeriodEnd: string | null
      }
      raw: Record<string, unknown>
    }
    return {
      ...event,
      occurredAt: new Date(event.occurredAt),
      currentPeriodEnd: event.currentPeriodEnd
        ? new Date(event.currentPeriodEnd)
        : null,
      raw,
    }
  }

  /** Upsert the subscription; events older than the last applied one are ignored. */
  private async apply(e: BillingEvent) {
    await this.db.transaction(async (tx) => {
      const [ws] = await tx
        .select({ id: organization.id })
        .from(organization)
        .where(eq(organization.id, e.workspaceId))
      if (!ws) throw new Error(`Unknown workspace ${e.workspaceId}`)
      await tx
        .insert(workspaceSubscriptions)
        .values({ workspaceId: e.workspaceId })
        .onConflictDoNothing()
      const [current] = await tx
        .select()
        .from(workspaceSubscriptions)
        .where(eq(workspaceSubscriptions.workspaceId, e.workspaceId))
        .for("update")
      if (current?.lastEventAt && current.lastEventAt > e.occurredAt) return
      await tx
        .update(workspaceSubscriptions)
        .set({
          planKey: e.planKey,
          status: e.type === "subscription.canceled" ? "canceled" : e.status,
          interval: e.interval,
          cancelAtPeriodEnd: e.cancelAtPeriodEnd,
          currentPeriodEnd: e.currentPeriodEnd,
          provider: e.provider ?? this.provider.key,
          providerCustomerId: e.customerId,
          providerSubscriptionId: e.subscriptionId,
          lastEventAt: e.occurredAt,
        })
        .where(eq(workspaceSubscriptions.workspaceId, e.workspaceId))
    })
    await this.audit.record(`billing.${e.type}`, {
      workspaceId: e.workspaceId,
      metadata: {
        planKey: e.planKey,
        status: e.status,
        interval: e.interval,
        eventId: e.id,
      },
    })
  }

  // ── Test provider (local/CI only) ──────────────────────────────────────

  private testProvider(): TestBillingProvider {
    if (
      !(this.provider instanceof TestBillingProvider) ||
      !this.provider.available
    )
      throw new NotFoundException("Test billing is not enabled")
    return this.provider
  }

  private claims(token: string, kind: "checkout" | "portal") {
    const claims = this.testProvider().readSession(token)
    if (claims.kind !== kind || claims.workspaceId !== this.ctx.workspaceId)
      throw new ForbiddenException("This session belongs to another workspace")
    return claims
  }

  async testSession(token: string): Promise<TestSession> {
    const claims = this.testProvider().readSession(token)
    if (claims.workspaceId !== this.ctx.workspaceId)
      throw new ForbiddenException("This session belongs to another workspace")
    const sub = await this.subscription(this.ctx.workspaceId)
    const ws = await this.workspace()
    const current = sub && isPlanKey(sub.planKey) ? sub.planKey : "free"
    return {
      kind: claims.kind,
      planKey: claims.planKey ?? current,
      interval:
        claims.interval ??
        (sub?.interval === "month" || sub?.interval === "year"
          ? sub.interval
          : null),
      workspaceName: ws.workspaceName,
    }
  }

  /** "Pay" on the test checkout page: activates the subscription. */
  async completeTestCheckout(token: string): Promise<BillingOverview> {
    const claims = this.claims(token, "checkout")
    const sub = await this.subscription(this.ctx.workspaceId)
    if (this.hasLiveSubscription(sub))
      throw new ConflictException("Already subscribed")
    const provider = this.testProvider()
    const interval = claims.interval ?? "month"
    const id = this.ctx.workspaceId.slice(0, 8)
    const { rawBody, headers } = provider.delivery({
      type: "subscription.activated",
      data: {
        workspace_id: this.ctx.workspaceId,
        customer_id: `cus_test_${id}`,
        subscription_id: `sub_test_${id}_${Date.now()}`,
        plan: claims.planKey ?? "pro",
        interval,
        status: "active",
        current_period_end: addInterval(new Date(), interval).toISOString(),
        cancel_at_period_end: false,
      },
    })
    await this.handleWebhook(provider.key, rawBody, headers)
    return this.overview()
  }

  /** Actions on the test portal page, delivered as provider webhooks. */
  async testPortalAction(
    token: string,
    action: TestPortalAction
  ): Promise<BillingOverview> {
    this.claims(token, "portal")
    const sub = await this.subscription(this.ctx.workspaceId)
    if (!sub?.providerSubscriptionId)
      throw new ConflictException("No subscription")
    const now = new Date()
    const changes: Parameters<BillingService["simulate"]>[1] =
      action === "cancel"
        ? { type: "subscription.updated", cancelAtPeriodEnd: true }
        : action === "resume"
          ? { type: "subscription.updated", cancelAtPeriodEnd: false }
          : action === "payment_failed"
            ? { type: "subscription.updated", status: "past_due" }
            : action === "payment_recovered"
              ? {
                  type: "subscription.updated",
                  status: "active",
                  currentPeriodEnd: addInterval(
                    now,
                    sub.interval === "year" ? "year" : "month"
                  ),
                }
              : {
                  type: "subscription.canceled",
                  status: "canceled",
                  currentPeriodEnd: now,
                }
    await this.simulate(sub, changes)
    return this.overview()
  }

  private async simulate(
    sub: SubscriptionRow,
    changes: {
      type: BillingEvent["type"]
      planKey?: PaidPlanKey
      interval?: BillingInterval
      status?: BillingEvent["status"]
      cancelAtPeriodEnd?: boolean
      currentPeriodEnd?: Date
    }
  ) {
    const provider = this.testProvider()
    const planKey = changes.planKey ?? (sub.planKey === "team" ? "team" : "pro")
    const { rawBody, headers } = provider.delivery({
      type: changes.type,
      data: {
        workspace_id: sub.workspaceId,
        customer_id:
          sub.providerCustomerId ?? `cus_test_${sub.workspaceId.slice(0, 8)}`,
        subscription_id: sub.providerSubscriptionId ?? "sub_test",
        plan: planKey,
        interval:
          changes.interval ?? (sub.interval === "year" ? "year" : "month"),
        status:
          changes.status ??
          subscriptionStatusSchema.catch("active").parse(sub.status),
        current_period_end:
          (
            changes.currentPeriodEnd ??
            sub.currentPeriodEnd ??
            null
          )?.toISOString() ?? null,
        cancel_at_period_end:
          changes.cancelAtPeriodEnd ?? sub.cancelAtPeriodEnd,
      },
    })
    await this.handleWebhook(provider.key, rawBody, headers)
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  private assertAvailable() {
    if (!this.provider.available)
      throw new ServiceUnavailableException({
        message: "Online billing isn't set up yet. Contact support to upgrade.",
        code: "billing_unavailable",
      })
  }

  /** A paid subscription that is still billed (not canceled). */
  private hasLiveSubscription(sub: SubscriptionRow | null) {
    return Boolean(
      sub?.providerSubscriptionId &&
      sub.planKey !== "free" &&
      sub.status !== "canceled"
    )
  }

  private async subscription(workspaceId: string) {
    const [row] = await this.db
      .select()
      .from(workspaceSubscriptions)
      .where(eq(workspaceSubscriptions.workspaceId, workspaceId))
      .limit(1)
    return row ?? null
  }

  private async workspace() {
    const [ws] = await this.db
      .select({
        id: organization.id,
        slug: organization.slug,
        name: organization.name,
      })
      .from(organization)
      .where(eq(organization.id, this.ctx.workspaceId))
    return {
      workspaceId: ws!.id,
      workspaceSlug: ws!.slug ?? ws!.id,
      workspaceName: ws!.name,
    }
  }

  private async ref(sub: SubscriptionRow): Promise<SubscriptionRef> {
    return {
      ...(await this.workspace()),
      customerId: sub.providerCustomerId,
      subscriptionId: sub.providerSubscriptionId,
    }
  }

  private async timezone() {
    const [p] = await this.db
      .select({ tz: workspaceProfiles.timezone })
      .from(workspaceProfiles)
      .where(eq(workspaceProfiles.workspaceId, this.ctx.workspaceId))
    return p?.tz ?? "UTC"
  }
}
