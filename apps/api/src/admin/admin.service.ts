import { InjectQueue } from "@nestjs/bullmq"
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common"
import { AuthService } from "@thallesp/nestjs-better-auth"
import {
  ADMIN_QUEUES,
  type AdminJob,
  type AdminOverview,
  type AdminUser,
  type AdminUserSummary,
  type AdminWorkspace,
  type AdminWorkspaceSummary,
  effectivePlan,
  type PlanKey,
} from "@workspace/contracts"
import {
  billingEvents,
  clients,
  files,
  invoices,
  member,
  organization,
  session,
  user,
  workspaceProfiles,
  workspaceSubscriptions,
} from "@workspace/db"
import type { Job, Queue } from "bullmq"
import {
  and,
  count,
  desc,
  eq,
  gte,
  ilike,
  isNotNull,
  isNull,
  max,
  or,
  sql,
  sum,
  type SQL,
} from "drizzle-orm"
import { randomUUID } from "node:crypto"

import { BillingService } from "../billing/billing.service.js"
import { RequestContext } from "../common/context/request-context.js"
import { offsetOf, orderBy } from "../common/pagination.js"
import { InjectDb, type Database } from "../core/database/database.module.js"
import { QUEUES } from "../core/queue/queue.module.js"
import { AuditService } from "../iam/audit/audit.service.js"
import { SubscriptionPaymentsService } from "../billing/manual/subscription-payments.service.js"
import { AdminAccessService } from "./admin-access.service.js"

const escapeLike = (v: string) => v.replace(/[\\%_]/g, (c) => `\\${c}`)
const iso = (d: Date | null | undefined) => d?.toISOString() ?? null

type SubRow = typeof workspaceSubscriptions.$inferSelect

function planOf(sub: SubRow | null | undefined): PlanKey {
  return effectivePlan(
    sub
      ? {
          planKey: sub.planKey as PlanKey,
          status: sub.status,
          currentPeriodEnd: sub.currentPeriodEnd,
          cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
          provider: sub.provider,
        }
      : null
  )
}

/**
 * The platform admin portal (Billleaf staff): workspaces, users, jobs.
 * Every change is audited with the admin as actor and a reason.
 */
@Injectable()
export class AdminService {
  private readonly queues: Record<(typeof ADMIN_QUEUES)[number], Queue>

  constructor(
    @InjectDb() private readonly db: Database,
    private readonly ctx: RequestContext,
    private readonly audit: AuditService,
    private readonly billing: BillingService,
    private readonly payments: SubscriptionPaymentsService,
    private readonly access: AdminAccessService,
    private readonly auth: AuthService,
    @InjectQueue(QUEUES.email) email: Queue,
    @InjectQueue(QUEUES.recurring) recurring: Queue,
    @InjectQueue(QUEUES.billing) billingQueue: Queue
  ) {
    this.queues = { email, recurring, billing: billingQueue }
  }

  // ── Overview ────────────────────────────────────────

  async overview(): Promise<AdminOverview> {
    const weekAgo = new Date(Date.now() - 7 * 86_400_000)
    const monthAgo = new Date(Date.now() - 30 * 86_400_000)
    const twelveWeeks = new Date(Date.now() - 12 * 7 * 86_400_000)
    const [[users], [workspaces], [active], subs, orgs, signups, failed] =
      await Promise.all([
        this.db
          .select({
            total: count(),
            verified: sql<number>`count(*) filter (where ${user.emailVerified})::int`,
            recent: sql<number>`count(*) filter (where ${user.createdAt} >= ${weekAgo})::int`,
          })
          .from(user),
        this.db.select({ n: count() }).from(organization),
        this.db
          .select({
            n: sql<number>`count(distinct ${session.activeOrganizationId})::int`,
          })
          .from(session)
          .where(gte(session.updatedAt, monthAgo)),
        this.db.select().from(workspaceSubscriptions),
        this.db.select({ id: organization.id }).from(organization),
        this.db
          .select({
            week: sql<string>`to_char(date_trunc('week', ${user.createdAt}), 'YYYY-MM-DD')`,
            n: count(),
          })
          .from(user)
          .where(gte(user.createdAt, twelveWeeks))
          .groupBy(sql`1`),
        Promise.all(
          ADMIN_QUEUES.map(async (queue) => ({
            queue,
            count:
              (await this.queues[queue].getJobCounts("failed")).failed ?? 0,
          }))
        ),
      ])
    const subByWs = new Map(subs.map((s) => [s.workspaceId, s]))
    const plans = new Map<PlanKey, number>()
    for (const o of orgs) {
      const p = planOf(subByWs.get(o.id))
      plans.set(p, (plans.get(p) ?? 0) + 1)
    }
    const byWeek = new Map(signups.map((s) => [s.week, s.n]))
    const monday = (d: Date) => {
      const x = new Date(
        Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
      )
      x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7))
      return x
    }
    const start = monday(new Date())
    const signupsByWeek = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(start)
      d.setUTCDate(d.getUTCDate() - 7 * (11 - i))
      const week = d.toISOString().slice(0, 10)
      return { week, count: byWeek.get(week) ?? 0 }
    })
    return {
      users: {
        total: users?.total ?? 0,
        verified: users?.verified ?? 0,
        last7Days: users?.recent ?? 0,
      },
      workspaces: { total: workspaces?.n ?? 0, active30Days: active?.n ?? 0 },
      plans: (["free", "pro", "team"] as const).map((planKey) => ({
        planKey,
        count: plans.get(planKey) ?? 0,
      })),
      signupsByWeek,
      failedJobs: failed,
      pendingPayments: await this.payments.pendingCount(),
    }
  }

  // ── Workspaces ──────────────────────────────────────

  private ownerJoin() {
    // One owner row per workspace (the earliest).
    return this.db
      .select({
        organizationId: member.organizationId,
        name: sql<string>`(array_agg(${user.name} order by ${member.createdAt}))[1]`.as(
          "owner_name"
        ),
        email:
          sql<string>`(array_agg(${user.email} order by ${member.createdAt}))[1]`.as(
            "owner_email"
          ),
      })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(eq(member.role, "owner"))
      .groupBy(member.organizationId)
      .as("owners")
  }

  async workspaces(q: {
    page: number
    pageSize: number
    sort?: string
    q?: string
    plan?: PlanKey
  }) {
    const owners = this.ownerJoin()
    const memberCounts = this.db
      .select({ organizationId: member.organizationId, n: count().as("n") })
      .from(member)
      .groupBy(member.organizationId)
      .as("member_counts")
    const filters: SQL[] = []
    if (q.q) {
      const like = `%${escapeLike(q.q)}%`
      filters.push(
        or(
          ilike(organization.name, like),
          ilike(organization.slug, like),
          ilike(owners.email, like)
        )!
      )
    }
    const rows = await this.db
      .select({
        org: organization,
        ownerName: owners.name,
        ownerEmail: owners.email,
        members: memberCounts.n,
        sub: workspaceSubscriptions,
      })
      .from(organization)
      .leftJoin(owners, eq(owners.organizationId, organization.id))
      .leftJoin(memberCounts, eq(memberCounts.organizationId, organization.id))
      .leftJoin(
        workspaceSubscriptions,
        eq(workspaceSubscriptions.workspaceId, organization.id)
      )
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(
        ...orderBy(
          q.sort,
          {
            createdAt: organization.createdAt,
            name: sql`lower(${organization.name})`,
          },
          organization.id,
          [sql`${organization.createdAt} desc`]
        )
      )
    // The effective plan is derived in code, so filter and page after it.
    const all: AdminWorkspaceSummary[] = rows
      .map((r) => ({
        id: r.org.id,
        name: r.org.name,
        slug: r.org.slug,
        createdAt: r.org.createdAt.toISOString(),
        owner: r.ownerEmail
          ? { name: r.ownerName ?? "", email: r.ownerEmail }
          : null,
        members: Number(r.members ?? 0),
        effectivePlanKey: planOf(r.sub),
        currentPeriodEnd: iso(r.sub?.currentPeriodEnd),
      }))
      .filter((w) => !q.plan || w.effectivePlanKey === q.plan)
    const from = offsetOf(q.page, q.pageSize)
    return {
      items: all.slice(from, from + q.pageSize),
      total: all.length,
      page: q.page,
      pageSize: q.pageSize,
    }
  }

  async workspace(id: string): Promise<AdminWorkspace> {
    const [org] = await this.db
      .select()
      .from(organization)
      .where(eq(organization.id, id))
      .limit(1)
    if (!org) throw new NotFoundException("Workspace not found")
    const monthStart = `${new Date().toISOString().slice(0, 7)}-01`
    const [
      members,
      [profile],
      [sub],
      [activeClients],
      [issued],
      [storage],
      events,
    ] = await Promise.all([
      this.db
        .select({
          userId: user.id,
          name: user.name,
          email: user.email,
          role: member.role,
          joinedAt: member.createdAt,
        })
        .from(member)
        .innerJoin(user, eq(user.id, member.userId))
        .where(eq(member.organizationId, id))
        .orderBy(member.createdAt),
      this.db
        .select()
        .from(workspaceProfiles)
        .where(eq(workspaceProfiles.workspaceId, id))
        .limit(1),
      this.db
        .select()
        .from(workspaceSubscriptions)
        .where(eq(workspaceSubscriptions.workspaceId, id))
        .limit(1),
      this.db
        .select({ n: count() })
        .from(clients)
        .where(and(eq(clients.workspaceId, id), isNull(clients.archivedAt))),
      this.db
        .select({ n: count() })
        .from(invoices)
        .where(
          and(
            eq(invoices.workspaceId, id),
            isNotNull(invoices.number),
            gte(invoices.issueDate, monthStart)
          )
        ),
      this.db
        .select({ bytes: sum(files.size) })
        .from(files)
        .where(eq(files.workspaceId, id)),
      this.db
        .select()
        .from(billingEvents)
        .where(eq(billingEvents.workspaceId, id))
        .orderBy(desc(billingEvents.occurredAt))
        .limit(20),
    ])
    const owner = members.find((m) => m.role === "owner")
    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      createdAt: org.createdAt.toISOString(),
      owner: owner ? { name: owner.name, email: owner.email } : null,
      members: members.length,
      effectivePlanKey: planOf(sub),
      currentPeriodEnd: iso(sub?.currentPeriodEnd),
      profile: {
        email: profile?.email ?? null,
        country: profile?.country ?? null,
        defaultCurrency: profile?.defaultCurrency ?? "USD",
        timezone: profile?.timezone ?? "UTC",
      },
      memberList: members.map((m) => ({
        ...m,
        joinedAt: m.joinedAt.toISOString(),
      })),
      usage: {
        activeClients: activeClients?.n ?? 0,
        invoicesThisMonth: issued?.n ?? 0,
        storageMb:
          Math.ceil((Number(storage?.bytes ?? 0) / 1_048_576) * 10) / 10,
      },
      subscription: {
        planKey: (sub?.planKey as PlanKey) ?? "free",
        effectivePlanKey: planOf(sub),
        status: (sub?.status ??
          "active") as AdminWorkspace["subscription"]["status"],
        interval: (sub?.interval ??
          null) as AdminWorkspace["subscription"]["interval"],
        cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false,
        currentPeriodEnd: iso(sub?.currentPeriodEnd),
        provider: sub?.provider ?? null,
      },
      billingEvents: events.map((e) => ({
        id: e.id,
        provider: e.provider,
        type: e.type,
        occurredAt: e.occurredAt.toISOString(),
        processedAt: iso(e.processedAt),
        error: e.error,
      })),
    }
  }

  /**
   * Set a workspace's plan by hand: comp, correction, or a payment taken
   * outside the app. Goes through the billing event pipeline (idempotent,
   * ordered, audited) as provider "manual".
   */
  async setPlan(
    workspaceId: string,
    input: {
      planKey: PlanKey
      interval: "month" | "year"
      periodEnd?: string | null
      reason: string
    }
  ) {
    await this.workspace(workspaceId) // 404
    const periodEnd = input.periodEnd
      ? new Date(`${input.periodEnd}T23:59:59Z`)
      : null
    if (periodEnd && periodEnd.getTime() < Date.now())
      throw new BadRequestException("The end date must be in the future")
    const free = input.planKey === "free"
    await this.billing.applyDirect({
      id: `admin-${randomUUID()}`,
      provider: "manual",
      type: free ? "subscription.canceled" : "subscription.updated",
      occurredAt: new Date(),
      workspaceId,
      customerId: null,
      subscriptionId: free ? null : `manual_${workspaceId}`,
      planKey: input.planKey,
      interval: input.interval,
      status: free ? "canceled" : "active",
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: Boolean(periodEnd),
      raw: { by: this.ctx.userId, reason: input.reason },
    })
    await this.audit.record("admin.workspace_plan_set", {
      workspaceId,
      resourceType: "workspace",
      resourceId: workspaceId,
      metadata: {
        planKey: input.planKey,
        interval: input.interval,
        periodEnd: input.periodEnd ?? null,
        reason: input.reason,
      },
    })
    return this.workspace(workspaceId)
  }

  // ── Users ───────────────────────────────────────────

  private summarize(
    u: typeof user.$inferSelect,
    lastSeenAt: Date | null,
    workspaces: number
  ): AdminUserSummary {
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      emailVerified: u.emailVerified,
      twoFactorEnabled: Boolean(u.twoFactorEnabled),
      isPlatformAdmin: this.access.isAdminEmail(u.email),
      banned: Boolean(u.banned),
      banReason: u.banReason ?? null,
      banExpires: iso(u.banExpires),
      createdAt: u.createdAt.toISOString(),
      lastSeenAt: iso(lastSeenAt),
      workspaces,
    }
  }

  async users(q: {
    page: number
    pageSize: number
    sort?: string
    q?: string
    banned?: "true"
  }) {
    const lastSeen = this.db
      .select({ userId: session.userId, at: max(session.updatedAt).as("at") })
      .from(session)
      .groupBy(session.userId)
      .as("last_seen")
    const memberships = this.db
      .select({ userId: member.userId, n: count().as("n") })
      .from(member)
      .groupBy(member.userId)
      .as("memberships")
    const filters: SQL[] = []
    if (q.q) {
      const like = `%${escapeLike(q.q)}%`
      filters.push(or(ilike(user.name, like), ilike(user.email, like))!)
    }
    if (q.banned) filters.push(eq(user.banned, true))
    const where = filters.length ? and(...filters) : undefined
    const [rows, [total]] = await Promise.all([
      this.db
        .select({ u: user, at: lastSeen.at, n: memberships.n })
        .from(user)
        .leftJoin(lastSeen, eq(lastSeen.userId, user.id))
        .leftJoin(memberships, eq(memberships.userId, user.id))
        .where(where)
        .orderBy(
          ...orderBy(
            q.sort,
            {
              createdAt: user.createdAt,
              name: sql`lower(${user.name})`,
              email: sql`lower(${user.email})`,
            },
            user.id,
            [sql`${user.createdAt} desc`]
          )
        )
        .limit(q.pageSize)
        .offset(offsetOf(q.page, q.pageSize)),
      this.db.select({ n: count() }).from(user).where(where),
    ])
    return {
      items: rows.map((r) => this.summarize(r.u, r.at, Number(r.n ?? 0))),
      total: total?.n ?? 0,
      page: q.page,
      pageSize: q.pageSize,
    }
  }

  private async requireUser(id: string) {
    const [u] = await this.db
      .select()
      .from(user)
      .where(eq(user.id, id))
      .limit(1)
    if (!u) throw new NotFoundException("User not found")
    return u
  }

  async user(id: string): Promise<AdminUser> {
    const u = await this.requireUser(id)
    const [memberships, sessions] = await Promise.all([
      this.db
        .select({
          workspaceId: organization.id,
          name: organization.name,
          slug: organization.slug,
          role: member.role,
        })
        .from(member)
        .innerJoin(organization, eq(organization.id, member.organizationId))
        .where(eq(member.userId, id)),
      this.db
        .select()
        .from(session)
        .where(eq(session.userId, id))
        .orderBy(desc(session.updatedAt))
        .limit(20),
    ])
    const lastSeen = sessions[0]?.updatedAt ?? null
    return {
      ...this.summarize(u, lastSeen, memberships.length),
      memberships,
      sessions: sessions.map((s) => ({
        id: s.id,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
        expiresAt: s.expiresAt.toISOString(),
        ipAddress: s.ipAddress ?? null,
        userAgent: s.userAgent ?? null,
        impersonatedBy: s.impersonatedBy ?? null,
      })),
    }
  }

  /** Admins can't act on themselves or on other platform admins. */
  private assertTargetable(u: typeof user.$inferSelect) {
    if (u.id === this.ctx.userId)
      throw new BadRequestException("You can't do that to your own account")
    if (this.access.isAdminEmail(u.email))
      throw new ConflictException({
        message:
          "That's a platform admin; change PLATFORM_ADMIN_EMAILS instead",
        code: "target_is_admin",
      })
  }

  async ban(id: string, reason: string, expiresAt?: string | null) {
    const u = await this.requireUser(id)
    this.assertTargetable(u)
    await this.db.transaction(async (tx) => {
      await tx
        .update(user)
        .set({
          banned: true,
          banReason: reason,
          banExpires: expiresAt ? new Date(expiresAt) : null,
        })
        .where(eq(user.id, id))
      await tx.delete(session).where(eq(session.userId, id))
    })
    await this.audit.record("admin.user_banned", {
      resourceType: "user",
      resourceId: id,
      metadata: { email: u.email, reason, expiresAt: expiresAt ?? null },
    })
    return this.user(id)
  }

  async unban(id: string, reason: string) {
    const u = await this.requireUser(id)
    await this.db
      .update(user)
      .set({ banned: false, banReason: null, banExpires: null })
      .where(eq(user.id, id))
    await this.audit.record("admin.user_unbanned", {
      resourceType: "user",
      resourceId: id,
      metadata: { email: u.email, reason },
    })
    return this.user(id)
  }

  async revokeSessions(id: string, reason: string) {
    const u = await this.requireUser(id)
    this.assertTargetable(u)
    const removed = await this.db
      .delete(session)
      .where(eq(session.userId, id))
      .returning({ id: session.id })
    await this.audit.record("admin.user_sessions_revoked", {
      resourceType: "user",
      resourceId: id,
      metadata: { email: u.email, reason, sessions: removed.length },
    })
    return this.user(id)
  }

  async resendVerification(id: string) {
    const u = await this.requireUser(id)
    if (u.emailVerified)
      throw new ConflictException({
        message: "This email is already verified",
        code: "already_verified",
      })
    await this.auth.api.sendVerificationEmail({ body: { email: u.email } })
    await this.audit.record("admin.verification_resent", {
      resourceType: "user",
      resourceId: id,
      metadata: { email: u.email },
    })
  }

  /**
   * Record why, then allow exactly one Better Auth impersonate call from
   * this admin for this user within two minutes.
   */
  async startImpersonation(id: string, reason: string) {
    const u = await this.requireUser(id)
    this.assertTargetable(u)
    if (u.banned)
      throw new ConflictException({
        message: "Unban the user before signing in as them",
        code: "target_banned",
      })
    await this.access.allowNextImpersonation(this.ctx.userId, id)
    await this.audit.record("admin.impersonation_started", {
      resourceType: "user",
      resourceId: id,
      metadata: { email: u.email, reason },
    })
    return { userId: id }
  }

  // ── Jobs ────────────────────────────────────────────

  private summarizeJob(queue: (typeof ADMIN_QUEUES)[number], j: Job): AdminJob {
    const data = (j.data ?? {}) as Record<string, unknown>
    const summary =
      queue === "email"
        ? `${String(data.subject ?? "Email")} → ${String(data.to ?? "?")}`
        : queue === "billing"
          ? `Billing event ${String(data.eventRowId ?? "")}`.trim()
          : j.name
    return {
      id: String(j.id),
      queue,
      name: j.name,
      attemptsMade: j.attemptsMade,
      failedReason: j.failedReason ?? null,
      createdAt: new Date(j.timestamp).toISOString(),
      finishedAt: j.finishedOn ? new Date(j.finishedOn).toISOString() : null,
      summary,
    }
  }

  async jobs(q: {
    queue?: (typeof ADMIN_QUEUES)[number]
    state: "failed" | "delayed" | "waiting" | "active" | "completed"
  }) {
    const queues = q.queue ? [q.queue] : [...ADMIN_QUEUES]
    const lists = await Promise.all(
      queues.map(async (name) =>
        (await this.queues[name].getJobs([q.state], 0, 49, false)).map((j) =>
          this.summarizeJob(name, j)
        )
      )
    )
    const counts = await Promise.all(
      ADMIN_QUEUES.map(async (queue) => {
        const c = await this.queues[queue].getJobCounts(
          "failed",
          "waiting",
          "active",
          "delayed"
        )
        return {
          queue,
          failed: c.failed ?? 0,
          waiting: c.waiting ?? 0,
          active: c.active ?? 0,
          delayed: c.delayed ?? 0,
        }
      })
    )
    return {
      items: lists
        .flat()
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 100),
      counts,
    }
  }

  private async job(queue: (typeof ADMIN_QUEUES)[number], id: string) {
    const j = await this.queues[queue].getJob(id)
    if (!j) throw new NotFoundException("Job not found")
    return j
  }

  async retryJob(queue: (typeof ADMIN_QUEUES)[number], id: string) {
    const j = await this.job(queue, id)
    if (!(await j.isFailed()))
      throw new ConflictException({
        message: "Only failed jobs can be retried",
        code: "job_not_failed",
      })
    await j.retry()
    await this.audit.record("admin.job_retried", {
      resourceType: "job",
      resourceId: `${queue}:${id}`,
    })
  }

  async removeJob(queue: (typeof ADMIN_QUEUES)[number], id: string) {
    const j = await this.job(queue, id)
    await j.remove()
    await this.audit.record("admin.job_removed", {
      resourceType: "job",
      resourceId: `${queue}:${id}`,
    })
  }
}
