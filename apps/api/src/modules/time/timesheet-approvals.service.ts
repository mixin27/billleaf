import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common"
import type {
  TimeRounding,
  ApprovalStatus,
  ListTimesheetApprovalsQuery,
  TimesheetApproval,
  TimesheetApprovalList,
} from "@workspace/contracts"
import {
  member,
  memberRoles,
  organization,
  rolePermissions,
  roles,
  timeEntries,
  timesheetApprovals,
  user,
  workspaceProfiles,
} from "@workspace/db"
import {
  timesheetReviewedEmail,
  timesheetSubmittedEmail,
} from "@workspace/emails"
import {
  and,
  desc,
  eq,
  exists,
  gte,
  inArray,
  isNull,
  lte,
  or,
  type SQL,
  sql,
} from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"

import { EntitlementsService } from "../../billing/entitlements.service.js"
import { RequestContext } from "../../common/context/request-context.js"
import { ENV, type Env } from "../../core/config/env.js"
import { InjectDb, type Database } from "../../core/database/database.module.js"
import { AuditService } from "../../iam/audit/audit.service.js"
import { MailService } from "../../mail/mail.service.js"
import { addDays, todayIn } from "../documents/party-snapshot.js"
import { WebhooksService } from "../webhooks/webhooks.service.js"
import { DomainEvents } from "../events/domain-events.service.js"

/** Monday of the week containing `iso` (YYYY-MM-DD). */
export function weekOf(iso: string): string {
  const day = (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7
  return addDays(iso, -day)
}

const LOCKING: ApprovalStatus[] = ["submitted", "approved"]

const hm = (seconds: number) =>
  `${Math.floor(seconds / 3600)}:${String(Math.round((seconds % 3600) / 60)).padStart(2, "0")}`

const weekLabel = (start: string) => {
  const f = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })
  const end = addDays(start, 6)
  return `${f.format(new Date(`${start}T00:00:00Z`))} – ${f.format(new Date(`${end}T00:00:00Z`))}, ${end.slice(0, 4)}`
}

/**
 * Timesheet approvals (Team plan, workspace setting). Members submit a
 * week; approvers (`time.approve`) approve it or send it back. Submitted
 * and approved weeks lock that member's entries; with approvals on, only
 * approved time can be invoiced. Approvers may approve their own week.
 */
@Injectable()
export class TimesheetApprovalsService {
  private readonly logger = new Logger(TimesheetApprovalsService.name)

  constructor(
    @InjectDb() private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly ctx: RequestContext,
    private readonly entitlements: EntitlementsService,
    private readonly audit: AuditService,
    private readonly webhooks: WebhooksService,
    private readonly events: DomainEvents,
    private readonly mail: MailService
  ) {}

  private scope(): SQL {
    return eq(timesheetApprovals.workspaceId, this.ctx.workspaceId)
  }

  private async settings() {
    const [row] = await this.db
      .select({
        on: workspaceProfiles.timesheetApprovals,
        timezone: workspaceProfiles.timezone,
        roundingMode: workspaceProfiles.timeRoundingMode,
        roundingMinutes: workspaceProfiles.timeRoundingMinutes,
        lockedBefore: workspaceProfiles.timeLockedBefore,
      })
      .from(workspaceProfiles)
      .where(eq(workspaceProfiles.workspaceId, this.ctx.workspaceId))
    return {
      on: row?.on ?? false,
      timezone: row?.timezone ?? "UTC",
      rounding: {
        mode: row?.roundingMode ?? "off",
        minutes: row?.roundingMinutes ?? 15,
      } satisfies TimeRounding,
      lockedBefore: row?.lockedBefore ?? null,
    }
  }

  /** The workspace's rounding rule for invoices and reports. */
  async rounding(): Promise<TimeRounding> {
    return (await this.settings()).rounding
  }

  /** Time dated before this day is locked (null = no locked period). */
  async lockedBefore(): Promise<string | null> {
    return (await this.settings()).lockedBefore
  }

  /** Approvals apply: the setting is on and the plan includes them. */
  async enabled(): Promise<boolean> {
    if (!(await this.settings()).on) return false
    return this.entitlements.hasFeature("timesheetApprovals")
  }

  /** Locking statuses by week start, for members' weeks overlapping a range. */
  async lockedWeeks(
    memberIds: string[],
    from: string,
    to: string
  ): Promise<Map<string, ApprovalStatus>> {
    const out = new Map<string, ApprovalStatus>()
    if (memberIds.length === 0 || !(await this.enabled())) return out
    const rows = await this.db
      .select({
        memberId: timesheetApprovals.memberId,
        weekStart: timesheetApprovals.weekStart,
        status: timesheetApprovals.status,
      })
      .from(timesheetApprovals)
      .where(
        and(
          this.scope(),
          inArray(timesheetApprovals.memberId, memberIds),
          gte(timesheetApprovals.weekStart, weekOf(from)),
          lte(timesheetApprovals.weekStart, to),
          inArray(timesheetApprovals.status, LOCKING)
        )
      )
    for (const r of rows) out.set(`${r.memberId}|${r.weekStart}`, r.status)
    return out
  }

  /**
   * Refuse changes to entries dated in the workspace's locked period (any
   * member), or in a member's submitted or approved week.
   */
  async assertOpen(memberId: string | null, dates: (string | undefined)[]) {
    const ds = dates.filter((d): d is string => Boolean(d))
    if (ds.length === 0) return
    const lockedBefore = await this.lockedBefore()
    if (lockedBefore && ds.some((d) => d < lockedBefore))
      throw new ConflictException({
        message: `Time before ${lockedBefore} is locked. Ask an admin to move the lock date in Settings → General.`,
        code: "time_period_locked",
      })
    if (!memberId) return
    const weeks = [...new Set(ds.map(weekOf))].sort()
    const locked = await this.lockedWeeks(
      [memberId],
      weeks[0]!,
      weeks[weeks.length - 1]!
    )
    for (const w of weeks) {
      const status = locked.get(`${memberId}|${w}`)
      if (!status) continue
      throw new ConflictException({
        message:
          status === "approved"
            ? "This week's timesheet is approved, so its time can't change. Ask an approver to reopen it."
            : "This week's timesheet is waiting for approval. Withdraw it to make changes.",
        code: "timesheet_locked",
      })
    }
  }

  /**
   * SQL condition: the entry can be invoiced under approvals, i.e. it's in
   * an approved week (or its member has left). Null when approvals are off.
   */
  async invoiceableCondition(): Promise<SQL | null> {
    if (!(await this.enabled())) return null
    return or(
      isNull(timeEntries.memberId),
      exists(
        this.db
          .select({ one: sql`1` })
          .from(timesheetApprovals)
          .where(
            and(
              eq(timesheetApprovals.workspaceId, timeEntries.workspaceId),
              eq(timesheetApprovals.memberId, timeEntries.memberId),
              eq(
                timesheetApprovals.weekStart,
                sql`date_trunc('week', ${timeEntries.entryDate})::date`
              ),
              eq(timesheetApprovals.status, "approved")
            )
          )
      )
    )!
  }

  private select() {
    const reviewer = alias(member, "reviewer")
    const reviewerUser = alias(user, "reviewer_user")
    return this.db
      .select({
        a: timesheetApprovals,
        memberName: sql<string>`coalesce(${user.name}, '')`,
        reviewedByName: reviewerUser.name,
      })
      .from(timesheetApprovals)
      .innerJoin(member, eq(member.id, timesheetApprovals.memberId))
      .innerJoin(user, eq(user.id, member.userId))
      .leftJoin(
        reviewer,
        eq(reviewer.id, timesheetApprovals.reviewedByMemberId)
      )
      .leftJoin(reviewerUser, eq(reviewerUser.id, reviewer.userId))
  }

  private toDto(r: {
    a: typeof timesheetApprovals.$inferSelect
    memberName: string
    reviewedByName: string | null
  }): TimesheetApproval {
    return {
      id: r.a.id,
      memberId: r.a.memberId,
      memberName: r.memberName,
      weekStart: r.a.weekStart,
      status: r.a.status,
      totalSeconds: r.a.totalSeconds,
      billableSeconds: r.a.billableSeconds,
      submittedAt: r.a.submittedAt.toISOString(),
      reviewedAt: r.a.reviewedAt?.toISOString() ?? null,
      reviewedByName: r.reviewedByName,
      note: r.a.note,
    }
  }

  private canApprove() {
    return this.ctx.permissions.has("time.approve")
  }

  async get(id: string): Promise<TimesheetApproval> {
    const [row] = await this.select().where(
      and(this.scope(), eq(timesheetApprovals.id, id))
    )
    if (!row) throw new NotFoundException("Timesheet not found")
    return this.toDto(row)
  }

  /** A member's approval for a week, if submitted. */
  async forWeek(
    memberId: string,
    weekStart: string
  ): Promise<TimesheetApproval | null> {
    const [row] = await this.select().where(
      and(
        this.scope(),
        eq(timesheetApprovals.memberId, memberId),
        eq(timesheetApprovals.weekStart, weekStart)
      )
    )
    return row ? this.toDto(row) : null
  }

  /** Approvers see everyone's; others see their own. Newest weeks first. */
  async list(q: ListTimesheetApprovalsQuery): Promise<TimesheetApprovalList> {
    const filters: SQL[] = [this.scope()]
    if (!this.canApprove()) {
      filters.push(eq(timesheetApprovals.memberId, this.ctx.memberId))
    } else if (q.memberId) {
      filters.push(eq(timesheetApprovals.memberId, q.memberId))
    }
    const base = and(...filters)
    if (q.status) filters.push(eq(timesheetApprovals.status, q.status))
    const [rows, [pending], available, settings] = await Promise.all([
      this.select()
        .where(and(...filters))
        .orderBy(
          desc(timesheetApprovals.weekStart),
          desc(timesheetApprovals.submittedAt)
        )
        .limit(200),
      this.db
        .select({ n: sql<number>`count(*)::int` })
        .from(timesheetApprovals)
        .where(and(base, eq(timesheetApprovals.status, "submitted"))),
      this.entitlements.hasFeature("timesheetApprovals"),
      this.settings(),
    ])
    return {
      items: rows.map((r) => this.toDto(r)),
      pendingCount: pending?.n ?? 0,
      available,
      enabled: available && settings.on,
    }
  }

  private async weekTotals(memberId: string, weekStart: string) {
    const [row] = await this.db
      .select({
        total: sql<number>`coalesce(sum(${timeEntries.durationSeconds}), 0)::int`,
        billable: sql<number>`coalesce(sum(${timeEntries.durationSeconds}) filter (where ${timeEntries.billable}), 0)::int`,
        running: sql<number>`count(*) filter (where ${timeEntries.endedAt} is null)::int`,
      })
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.workspaceId, this.ctx.workspaceId),
          eq(timeEntries.memberId, memberId),
          gte(timeEntries.entryDate, weekStart),
          lte(timeEntries.entryDate, addDays(weekStart, 6))
        )
      )
    return {
      total: row?.total ?? 0,
      billable: row?.billable ?? 0,
      running: row?.running ?? 0,
    }
  }

  /** Submit your own week for approval (again, after it was sent back). */
  async submit(anyDate: string): Promise<TimesheetApproval> {
    const p = this.ctx.permissions
    if (!p.has("time.track") && !p.has("time.manage"))
      throw new ForbiddenException("You can't track time")
    const { on, timezone } = await this.settings()
    if (!on || !(await this.entitlements.hasFeature("timesheetApprovals")))
      throw new BadRequestException({
        message: "Timesheet approvals are off in this workspace",
        code: "approvals_off",
      })
    const weekStart = weekOf(anyDate)
    if (weekStart > weekOf(todayIn(timezone)))
      throw new BadRequestException("You can't submit a future week")
    const memberId = this.ctx.memberId
    const totals = await this.weekTotals(memberId, weekStart)
    if (totals.running > 0)
      throw new BadRequestException({
        message: "Stop the running timer before submitting this week",
        code: "timer_running",
      })
    if (totals.total === 0)
      throw new BadRequestException({
        message: "There's no time to submit in this week",
        code: "nothing_to_submit",
      })

    const existing = await this.forWeek(memberId, weekStart)
    if (existing && existing.status !== "rejected")
      throw new ConflictException({
        message:
          existing.status === "approved"
            ? "This week is already approved"
            : "This week is already submitted",
        code: "already_submitted",
      })
    const values = {
      status: "submitted" as const,
      totalSeconds: totals.total,
      billableSeconds: totals.billable,
      submittedAt: new Date(),
      reviewedAt: null,
      reviewedByMemberId: null,
      note: null,
    }
    let id: string
    if (existing) {
      await this.db
        .update(timesheetApprovals)
        .set(values)
        .where(and(this.scope(), eq(timesheetApprovals.id, existing.id)))
      id = existing.id
    } else {
      const [row] = await this.db
        .insert(timesheetApprovals)
        .values({
          ...values,
          workspaceId: this.ctx.workspaceId,
          memberId,
          weekStart,
        })
        .onConflictDoNothing()
        .returning({ id: timesheetApprovals.id })
      if (!row)
        throw new ConflictException({
          message: "This week is already submitted",
          code: "already_submitted",
        })
      id = row.id
    }
    const approval = await this.get(id)
    await this.audit.record("timesheet.submitted", {
      resourceType: "timesheet",
      resourceId: id,
      metadata: { weekStart, seconds: totals.total },
    })
    await this.events.publish("timesheet.submitted", approval)
    await this.notifyApprovers(approval)
    return approval
  }

  /** Take back your own week while it waits for review. */
  async withdraw(anyDate: string): Promise<void> {
    const weekStart = weekOf(anyDate)
    const existing = await this.forWeek(this.ctx.memberId, weekStart)
    if (!existing || existing.status !== "submitted")
      throw new BadRequestException({
        message:
          existing?.status === "approved"
            ? "This week is approved. Ask an approver to reopen it."
            : "This week isn't waiting for approval",
        code: "not_submitted",
      })
    await this.db
      .delete(timesheetApprovals)
      .where(and(this.scope(), eq(timesheetApprovals.id, existing.id)))
    await this.audit.record("timesheet.withdrawn", {
      resourceType: "timesheet",
      resourceId: existing.id,
      metadata: { weekStart },
    })
  }

  async approve(id: string, note?: string): Promise<TimesheetApproval> {
    return this.review(id, "approved", note ?? null)
  }

  /** Send back a submitted week, or reopen an approved one, with a note. */
  async reject(id: string, note: string): Promise<TimesheetApproval> {
    return this.review(id, "rejected", note)
  }

  private async review(
    id: string,
    status: "approved" | "rejected",
    note: string | null
  ): Promise<TimesheetApproval> {
    if (!this.canApprove())
      throw new ForbiddenException("Reviewing timesheets needs time.approve")
    const current = await this.get(id)
    const allowed =
      status === "approved"
        ? current.status === "submitted"
        : current.status !== "rejected"
    if (!allowed)
      throw new ConflictException({
        message:
          status === "approved"
            ? "Only submitted weeks can be approved"
            : "This week is already sent back",
        code: "invalid_status",
      })
    // Approving freezes the totals as they are now.
    const totals =
      status === "approved"
        ? await this.weekTotals(current.memberId, current.weekStart)
        : null
    await this.db
      .update(timesheetApprovals)
      .set({
        status,
        reviewedAt: new Date(),
        reviewedByMemberId: this.ctx.memberId,
        note,
        ...(totals
          ? { totalSeconds: totals.total, billableSeconds: totals.billable }
          : {}),
      })
      .where(and(this.scope(), eq(timesheetApprovals.id, id)))
    const approval = await this.get(id)
    await this.audit.record(`timesheet.${status}`, {
      resourceType: "timesheet",
      resourceId: id,
      metadata: {
        weekStart: approval.weekStart,
        memberId: approval.memberId,
        reopened: current.status === "approved" || undefined,
      },
    })
    await this.webhooks.emit(`timesheet.${status}`, approval)
    if (approval.memberId !== this.ctx.memberId)
      await this.notifyMember(approval, status === "approved")
    return approval
  }

  private async workspace() {
    const [ws] = await this.db
      .select({ name: organization.name, slug: organization.slug })
      .from(organization)
      .where(eq(organization.id, this.ctx.workspaceId))
    return ws
  }

  private timeUrl(slug: string | null, query: string) {
    return `${this.env.WEB_URL}/${encodeURIComponent(slug ?? this.ctx.workspaceId)}/time?${query}`
  }

  /** Email everyone who can approve (owners and time.approve roles), not the submitter. */
  private async notifyApprovers(a: TimesheetApproval) {
    try {
      const ws = await this.workspace()
      if (!ws) return
      const grants = this.db
        .select({ one: sql`1` })
        .from(memberRoles)
        .innerJoin(roles, eq(roles.id, memberRoles.roleId))
        .leftJoin(
          rolePermissions,
          and(
            eq(rolePermissions.roleId, roles.id),
            eq(rolePermissions.permissionKey, "time.approve")
          )
        )
        .where(
          and(
            eq(memberRoles.memberId, member.id),
            or(
              eq(roles.isLocked, true),
              sql`${rolePermissions.roleId} is not null`
            )
          )
        )
      const approvers = await this.db
        .selectDistinct({ email: user.email, memberId: member.id })
        .from(member)
        .innerJoin(user, eq(user.id, member.userId))
        .where(
          and(
            eq(member.organizationId, this.ctx.workspaceId),
            or(eq(member.role, "owner"), exists(grants))
          )
        )
      const url = this.timeUrl(ws.slug, "tab=approvals")
      for (const r of approvers) {
        if (r.memberId === a.memberId) continue
        await this.mail.send(
          timesheetSubmittedEmail({
            to: r.email,
            workspaceName: ws.name,
            memberName: a.memberName,
            week: weekLabel(a.weekStart),
            total: hm(a.totalSeconds),
            url,
          })
        )
      }
    } catch (err) {
      this.logger.error({ err, approvalId: a.id }, "Approvers not emailed")
    }
  }

  private async notifyMember(a: TimesheetApproval, approved: boolean) {
    try {
      const ws = await this.workspace()
      const [m] = await this.db
        .select({ email: user.email })
        .from(member)
        .innerJoin(user, eq(user.id, member.userId))
        .where(eq(member.id, a.memberId))
      if (!ws || !m) return
      await this.mail.send(
        timesheetReviewedEmail({
          to: m.email,
          workspaceName: ws.name,
          reviewerName: a.reviewedByName ?? "An approver",
          week: weekLabel(a.weekStart),
          approved,
          note: a.note,
          url: this.timeUrl(ws.slug, `tab=timesheet&week=${a.weekStart}`),
        })
      )
    } catch (err) {
      this.logger.error({ err, approvalId: a.id }, "Member not emailed")
    }
  }
}
