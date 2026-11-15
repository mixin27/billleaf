import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common"
import {
  type AdminSubscriptionPayment,
  type AdminSubscriptionPaymentQuery,
  adminSubscriptionPaymentQuerySchema,
  effectivePlan,
  formatMoney,
  type ManualBillingOptions,
  PLANS,
  type SubmitSubscriptionPaymentInput,
  type SubscriptionPayment,
} from "@workspace/contracts"
import {
  subscriptionApprovedEmail,
  subscriptionPaymentSubmittedEmail,
  subscriptionRejectedEmail,
} from "@workspace/emails"
import {
  member,
  organization,
  platformPaymentAccounts,
  subscriptionPayments,
  user,
  workspaceSubscriptions,
} from "@workspace/db"
import { and, asc, count, desc, eq } from "drizzle-orm"

import { RequestContext } from "../../common/context/request-context.js"
import { ENV, type Env } from "../../core/config/env.js"
import { InjectDb, type Database } from "../../core/database/database.module.js"
import { AuditService } from "../../iam/audit/audit.service.js"
import { MailService } from "../../mail/mail.service.js"
import { BillingService } from "../billing.service.js"
import { addInterval } from "../period.js"
import { PlatformBillingService } from "./platform-billing.service.js"

type Row = typeof subscriptionPayments.$inferSelect

const PROOF_MAX_BYTES = 2 * 1024 * 1024

const iso = (d: Date | null) => d?.toISOString() ?? null

const isUniqueViolation = (err: unknown) =>
  (err as { code?: string })?.code === "23505" ||
  (err as { cause?: { code?: string } })?.cause?.code === "23505"

/**
 * Manual SaaS billing (ADR-0013). A workspace pays Billleaf outside the app,
 * uploads proof (one pending request at a time), and a platform admin
 * approves it, which extends the plan through the billing event pipeline,
 * or rejects it with a note.
 */
@Injectable()
export class SubscriptionPaymentsService {
  private readonly logger = new Logger(SubscriptionPaymentsService.name)

  constructor(
    @InjectDb() private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly ctx: RequestContext,
    private readonly platform: PlatformBillingService,
    private readonly billing: BillingService,
    private readonly mail: MailService,
    private readonly audit: AuditService
  ) {}

  private dto(r: Row, accountLabel: string | null): SubscriptionPayment {
    return {
      id: r.id,
      planKey: r.planKey,
      interval: r.interval,
      currency: r.currency,
      amount: r.amount,
      periods: r.periods,
      paidOn: r.paidOn,
      paymentAccountLabel: accountLabel,
      reference: r.reference,
      note: r.note,
      status: r.status,
      rejectionReason: r.rejectionReason,
      reviewedAt: iso(r.reviewedAt),
      periodStart: iso(r.periodStart),
      periodEnd: iso(r.periodEnd),
      createdAt: r.createdAt.toISOString(),
    }
  }

  // ── Workspace ────────────────────────────────────────────

  async history(): Promise<SubscriptionPayment[]> {
    const rows = await this.db
      .select({ p: subscriptionPayments, label: platformPaymentAccounts.label })
      .from(subscriptionPayments)
      .leftJoin(
        platformPaymentAccounts,
        eq(
          platformPaymentAccounts.id,
          subscriptionPayments.platformPaymentAccountId
        )
      )
      .where(eq(subscriptionPayments.workspaceId, this.ctx.workspaceId))
      .orderBy(desc(subscriptionPayments.createdAt))
      .limit(50)
    return rows.map((r) => this.dto(r.p, r.label))
  }

  async options(): Promise<ManualBillingOptions> {
    const [prices, accounts, history] = await Promise.all([
      this.platform.prices(true),
      this.platform.accounts(true),
      this.history(),
    ])
    return {
      prices,
      accounts,
      pending: history.find((p) => p.status === "pending") ?? null,
    }
  }

  async submit(
    input: SubmitSubscriptionPaymentInput & { periods: number },
    file: { filename: string; body: Buffer },
    meta: { ip?: string; userAgent?: string }
  ): Promise<SubscriptionPayment> {
    const workspaceId = this.ctx.workspaceId
    const price = await this.platform.price(
      input.planKey,
      input.interval,
      input.currency
    )
    if (!price)
      throw new BadRequestException({
        message: "That plan isn't available in this currency",
        code: "price_not_found",
      })
    const account = input.platformPaymentAccountId
      ? await this.platform.accountRow(input.platformPaymentAccountId)
      : null
    if (account && !account.active)
      throw new BadRequestException("That payment method isn't available")
    if (input.paidOn > new Date().toISOString().slice(0, 10))
      throw new BadRequestException("The payment date can't be in the future")

    const [pending] = await this.db
      .select({ id: subscriptionPayments.id })
      .from(subscriptionPayments)
      .where(
        and(
          eq(subscriptionPayments.workspaceId, workspaceId),
          eq(subscriptionPayments.status, "pending")
        )
      )
      .limit(1)
    if (pending) throw this.alreadyPending()

    const fileKey = await this.platform.putImage(
      `subscription-proofs/${workspaceId}`,
      file.body,
      PROOF_MAX_BYTES
    )
    let row: Row
    try {
      ;[row] = (await this.db
        .insert(subscriptionPayments)
        .values({
          workspaceId,
          planKey: input.planKey,
          interval: input.interval,
          currency: input.currency,
          amount: price.amount * input.periods,
          periods: input.periods,
          paidOn: input.paidOn,
          platformPaymentAccountId: account?.id ?? null,
          reference: input.reference ?? null,
          note: input.note ?? null,
          fileKey,
          submittedByUserId: this.ctx.userId,
          ipAddress: meta.ip ?? null,
          userAgent: meta.userAgent?.slice(0, 500) ?? null,
        })
        .returning()) as [Row]
    } catch (err) {
      await this.platform.deleteObject(fileKey)
      if (isUniqueViolation(err)) throw this.alreadyPending()
      throw err
    }
    await this.audit.record("billing.payment_submitted", {
      resourceType: "subscription_payment",
      resourceId: row.id,
      metadata: {
        planKey: row.planKey,
        interval: row.interval,
        periods: row.periods,
        amount: row.amount,
        currency: row.currency,
      },
    })
    await this.notifyAdmins(row)
    return this.dto(row, account?.label ?? null)
  }

  private alreadyPending() {
    return new ConflictException({
      message:
        "You already have a payment waiting for review. We'll email you once it's checked.",
      code: "subscription_payment_pending",
    })
  }

  // ── Platform admin ───────────────────────────────────────

  async adminList(query: AdminSubscriptionPaymentQuery) {
    const q = adminSubscriptionPaymentQuerySchema.parse(query)
    const where = eq(subscriptionPayments.status, q.status)
    const [rows, [total]] = await Promise.all([
      this.db
        .select({
          p: subscriptionPayments,
          label: platformPaymentAccounts.label,
          ws: {
            id: organization.id,
            name: organization.name,
            slug: organization.slug,
          },
          by: { name: user.name, email: user.email },
          sub: workspaceSubscriptions,
        })
        .from(subscriptionPayments)
        .innerJoin(
          organization,
          eq(organization.id, subscriptionPayments.workspaceId)
        )
        .leftJoin(user, eq(user.id, subscriptionPayments.submittedByUserId))
        .leftJoin(
          platformPaymentAccounts,
          eq(
            platformPaymentAccounts.id,
            subscriptionPayments.platformPaymentAccountId
          )
        )
        .leftJoin(
          workspaceSubscriptions,
          eq(
            workspaceSubscriptions.workspaceId,
            subscriptionPayments.workspaceId
          )
        )
        .where(where)
        .orderBy(
          // Pending: oldest first (a queue); reviewed: newest first.
          q.status === "pending"
            ? asc(subscriptionPayments.createdAt)
            : desc(subscriptionPayments.reviewedAt)
        )
        .limit(q.pageSize)
        .offset((q.page - 1) * q.pageSize),
      this.db.select({ n: count() }).from(subscriptionPayments).where(where),
    ])
    const items: AdminSubscriptionPayment[] = await Promise.all(
      rows.map(async (r) => ({
        ...this.dto(r.p, r.label),
        workspace: {
          id: r.ws.id,
          name: r.ws.name,
          slug: r.ws.slug ?? r.ws.id,
        },
        submittedBy: r.by?.email
          ? { name: r.by.name, email: r.by.email }
          : null,
        fileUrl: await this.platform.presign(r.p.fileKey).catch(() => null),
        currentPlanKey: effectivePlan(r.sub),
        currentPeriodEnd: iso(r.sub?.currentPeriodEnd ?? null),
      }))
    )
    return { items, total: total?.n ?? 0, page: q.page, pageSize: q.pageSize }
  }

  async pendingCount() {
    const [r] = await this.db
      .select({ n: count() })
      .from(subscriptionPayments)
      .where(eq(subscriptionPayments.status, "pending"))
    return r?.n ?? 0
  }

  /**
   * Mark approved (only from pending, so a double click gets 409), then
   * extend the plan. Renewing the same plan before it ends stacks onto the
   * current period; anything else starts now.
   */
  async approve(id: string, input: { periods?: number }) {
    const now = new Date()
    const [claimed] = await this.db
      .update(subscriptionPayments)
      .set({
        status: "approved",
        reviewedByUserId: this.ctx.userId,
        reviewedAt: now,
        ...(input.periods ? { periods: input.periods } : {}),
      })
      .where(
        and(
          eq(subscriptionPayments.id, id),
          eq(subscriptionPayments.status, "pending")
        )
      )
      .returning()
    if (!claimed) throw await this.notPending(id)

    const [sub] = await this.db
      .select()
      .from(workspaceSubscriptions)
      .where(eq(workspaceSubscriptions.workspaceId, claimed.workspaceId))
      .limit(1)
    const stack =
      sub?.provider === "manual" &&
      sub.planKey === claimed.planKey &&
      sub.status !== "canceled" &&
      sub.currentPeriodEnd &&
      sub.currentPeriodEnd > now
    const start = stack ? sub!.currentPeriodEnd! : now
    const end = addInterval(start, claimed.interval, claimed.periods)
    await this.db
      .update(subscriptionPayments)
      .set({ periodStart: start, periodEnd: end })
      .where(eq(subscriptionPayments.id, id))

    const wasPaid = effectivePlan(sub ?? null, now) !== "free"
    await this.billing.applyDirect({
      id: `manual-${claimed.id}`,
      provider: "manual",
      type: wasPaid ? "subscription.updated" : "subscription.activated",
      occurredAt: now,
      workspaceId: claimed.workspaceId,
      customerId: null,
      subscriptionId: `manual_${claimed.workspaceId}`,
      planKey: claimed.planKey,
      interval: claimed.interval,
      status: "active",
      currentPeriodEnd: end,
      // Manual plans end unless paid again (then the grace period applies).
      cancelAtPeriodEnd: true,
      raw: { subscriptionPaymentId: claimed.id, by: this.ctx.userId },
    })
    await this.audit.record("admin.subscription_payment_approved", {
      workspaceId: claimed.workspaceId,
      resourceType: "subscription_payment",
      resourceId: claimed.id,
      metadata: {
        planKey: claimed.planKey,
        periods: claimed.periods,
        periodEnd: end.toISOString(),
      },
    })
    await this.notifyOwners(claimed.workspaceId, (to, ws) =>
      subscriptionApprovedEmail({
        to,
        workspaceName: ws.name,
        plan: PLANS[claimed.planKey].name,
        until: end.toISOString().slice(0, 10),
        url: this.billingUrl(ws.slug),
      })
    )
    return this.adminItem(id)
  }

  async reject(id: string, reason: string) {
    const [claimed] = await this.db
      .update(subscriptionPayments)
      .set({
        status: "rejected",
        rejectionReason: reason,
        reviewedByUserId: this.ctx.userId,
        reviewedAt: new Date(),
      })
      .where(
        and(
          eq(subscriptionPayments.id, id),
          eq(subscriptionPayments.status, "pending")
        )
      )
      .returning()
    if (!claimed) throw await this.notPending(id)
    await this.audit.record("admin.subscription_payment_rejected", {
      workspaceId: claimed.workspaceId,
      resourceType: "subscription_payment",
      resourceId: claimed.id,
      metadata: { reason },
    })
    await this.notifyOwners(claimed.workspaceId, (to, ws) =>
      subscriptionRejectedEmail({
        to,
        workspaceName: ws.name,
        plan: PLANS[claimed.planKey].name,
        amount: formatMoney({
          amount: claimed.amount,
          currency: claimed.currency,
        }),
        reason,
        url: this.billingUrl(ws.slug),
      })
    )
    return this.adminItem(id)
  }

  private async adminItem(id: string): Promise<AdminSubscriptionPayment> {
    const [row] = await this.db
      .select({ status: subscriptionPayments.status })
      .from(subscriptionPayments)
      .where(eq(subscriptionPayments.id, id))
    const page = await this.adminList({ status: row!.status, pageSize: 100 })
    const item = page.items.find((i) => i.id === id)
    if (!item) throw new NotFoundException("Payment not found")
    return item
  }

  private async notPending(id: string) {
    const [row] = await this.db
      .select({ status: subscriptionPayments.status })
      .from(subscriptionPayments)
      .where(eq(subscriptionPayments.id, id))
    return row
      ? new ConflictException({
          message: `This payment was already ${row.status}`,
          code: "subscription_payment_reviewed",
        })
      : new NotFoundException("Payment not found")
  }

  // ── Notifications (never fail the request) ───────────────

  private billingUrl(slug: string) {
    return `${this.env.WEB_URL}/${encodeURIComponent(slug)}/settings/billing`
  }

  async ownerEmails(workspaceId: string) {
    const rows = await this.db
      .select({ email: user.email })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(
        and(eq(member.organizationId, workspaceId), eq(member.role, "owner"))
      )
    return rows.map((r) => r.email)
  }

  async notifyOwners(
    workspaceId: string,
    build: (
      to: string,
      ws: { name: string; slug: string }
    ) => Parameters<MailService["send"]>[0]
  ) {
    try {
      const [ws] = await this.db
        .select({ name: organization.name, slug: organization.slug })
        .from(organization)
        .where(eq(organization.id, workspaceId))
      if (!ws) return
      for (const to of await this.ownerEmails(workspaceId))
        await this.mail.send(
          build(to, { name: ws.name, slug: ws.slug ?? workspaceId })
        )
    } catch (err) {
      this.logger.error({ err, workspaceId }, "Couldn't email workspace owners")
    }
  }

  private async notifyAdmins(row: Row) {
    try {
      const [ws] = await this.db
        .select({ name: organization.name })
        .from(organization)
        .where(eq(organization.id, row.workspaceId))
      for (const to of this.env.PLATFORM_ADMIN_EMAILS)
        await this.mail.send(
          subscriptionPaymentSubmittedEmail({
            to,
            workspaceName: ws?.name ?? "A workspace",
            plan: `${PLANS[row.planKey].name} (${row.periods} × ${row.interval})`,
            amount: formatMoney({ amount: row.amount, currency: row.currency }),
            reference: row.reference,
            url: `${this.env.WEB_URL}/admin/approvals`,
          })
        )
    } catch (err) {
      this.logger.error({ err }, "Couldn't email platform admins")
    }
  }
}
