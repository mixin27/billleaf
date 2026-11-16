import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common"
import {
  type BulkResult,
  type BulkUpdateTimeEntriesInput,
  type CreateTagInput,
  type CreateTimeEntryInput,
  type Invoice,
  type ProjectTimeSummary,
  type SetTimesheetCellInput,
  type Timesheet,
  type TimesheetRow,
  secondsToHours,
  type StartTimerInput,
  type Tag,
  type TimeEntry,
  type TimeEntryList,
  type TimeSuggestion,
  type UpdateRunningInput,
  type UpdateTagInput,
  type UpdateTimeEntryInput,
} from "@workspace/contracts"

import { RequestContext } from "../../common/context/request-context.js"
import { AuditService } from "../../iam/audit/audit.service.js"
import { addDays, todayIn } from "../documents/party-snapshot.js"
import { InvoicesService } from "../invoices/invoices.service.js"
import { ProjectsService } from "../projects/projects.service.js"
import { RatesService } from "../rates/rates.service.js"
import { WorkspaceProfileService } from "../workspace/workspace-profile.service.js"
import { ProjectUsageService } from "./project-usage.service.js"
import { TimesheetApprovalsService } from "./timesheet-approvals.service.js"
import {
  type TagRow,
  TimeRepository,
  type TimeEntryWithRefs,
} from "./time.repository.js"

const isUniqueViolation = (e: unknown) =>
  (e as { cause?: { code?: string } }).cause?.code === "23505" ||
  (e as { code?: string }).code === "23505"

/**
 * Time tracking. Own entries need `time.track`; anyone else's need
 * `time.manage`; seeing others' time needs `time.read`. Invoiced entries are
 * locked until their draft invoice is deleted.
 */
@Injectable()
export class TimeService {
  constructor(
    private readonly repo: TimeRepository,
    private readonly projects: ProjectsService,
    private readonly invoices: InvoicesService,
    private readonly profile: WorkspaceProfileService,
    private readonly ctx: RequestContext,
    private readonly audit: AuditService,
    private readonly rates: RatesService,
    private readonly projectUsage: ProjectUsageService,
    private readonly approvals: TimesheetApprovalsService
  ) {}

  private can(
    p:
      | "time.track"
      | "time.read"
      | "time.manage"
      | "invoice.create"
      | "rate.read"
      | "time.approve"
  ) {
    return this.ctx.permissions.has(p)
  }

  private toDto = (e: TimeEntryWithRefs): TimeEntry => ({
    id: e.id,
    projectId: e.projectId,
    projectName: e.projectName,
    clientName: e.clientName,
    taskId: e.taskId,
    taskTitle: e.taskTitle,
    memberId: e.memberId,
    memberName: e.memberName,
    description: e.description,
    entryDate: e.entryDate,
    startedAt: e.startedAt.toISOString(),
    endedAt: e.endedAt?.toISOString() ?? null,
    durationSeconds: e.durationSeconds,
    hasTimes: e.hasTimes,
    billable: e.billable,
    tags: e.tags.map(toTag),
    invoiceId: e.invoiceId,
    invoiceNumber: e.invoiceNumber,
    isRunning: e.endedAt === null,
    isMine: e.memberId === this.ctx.memberId,
    approvalLocked: false,
  })

  /** May the current member write entries owned by `memberId` (null = former member)? */
  private assertCanWrite(memberId: string | null) {
    const ok =
      memberId === this.ctx.memberId
        ? this.can("time.track") || this.can("time.manage")
        : this.can("time.manage")
    if (!ok) throw new ForbiddenException("You can't change this time entry")
  }

  private async localDate(at: Date) {
    return todayIn((await this.profile.get()).timezone, at)
  }

  async list(q: {
    from: string
    to: string
    projectId?: string
    tagId?: string
    memberId?: string
    billable?: "true" | "false"
    uninvoiced?: "true"
  }): Promise<TimeEntryList> {
    if (q.from > q.to)
      throw new BadRequestException("`from` must be on or before `to`")
    let memberId = q.memberId === "me" ? this.ctx.memberId : q.memberId
    if (!this.can("time.read")) {
      if (memberId && memberId !== this.ctx.memberId)
        throw new ForbiddenException("You can only see your own time")
      memberId = this.ctx.memberId
    }
    const rows = await this.repo.list({
      from: q.from,
      to: q.to,
      projectId: q.projectId,
      tagId: q.tagId,
      memberId,
      billable: q.billable === undefined ? undefined : q.billable === "true",
      uninvoiced: q.uninvoiced === "true",
    })
    const finished = rows.filter((r) => r.durationSeconds !== null)
    const locked = await this.approvals.lockedWeeks(
      [...new Set(rows.map((r) => r.memberId).filter((m) => m !== null))],
      q.from,
      q.to
    )
    return {
      items: rows.map((r) => ({
        ...this.toDto(r),
        approvalLocked: locked.has(`${r.memberId}|${mondayOf(r.entryDate)}`),
      })),
      totalSeconds: finished.reduce((s, r) => s + r.durationSeconds!, 0),
      billableSeconds: finished
        .filter((r) => r.billable)
        .reduce((s, r) => s + r.durationSeconds!, 0),
    }
  }

  async running(): Promise<TimeEntry | null> {
    const e = await this.repo.findRunning(this.ctx.memberId)
    return e ? this.toDto(e) : null
  }

  /** Start a timer, stopping the member's current one first. */
  async start(input: StartTimerInput): Promise<TimeEntry> {
    this.assertCanWrite(this.ctx.memberId)
    const project = await this.validateTarget(
      input.projectId ?? null,
      input.taskId ?? null
    )
    const tagIds = await this.validateTags(input.tagIds)
    const now = new Date()
    const entryDate = await this.localDate(now)
    await this.approvals.assertOpen(this.ctx.memberId, [entryDate])
    const memberName = (await this.repo.memberName(this.ctx.memberId)) ?? ""
    try {
      const id = await this.repo.database.transaction(async (tx) => {
        const running = await this.repo.findRunning(this.ctx.memberId, tx)
        if (running) await this.stopEntry(tx, running, now)
        const id = await this.repo.insert(tx, {
          projectId: input.projectId ?? null,
          taskId: input.taskId ?? null,
          memberId: this.ctx.memberId,
          memberName,
          description: input.description ?? null,
          entryDate,
          startedAt: now,
          endedAt: null,
          durationSeconds: null,
          billable: input.billable ?? defaultBillable(project),
        })
        await this.repo.setTags(tx, [id], tagIds)
        return id
      })
      return this.toDto((await this.repo.findById(id))!)
    } catch (e) {
      if (isUniqueViolation(e))
        throw new ConflictException({
          message: "A timer is already running",
          code: "timer_running",
        })
      throw e
    }
  }

  /** Edit the running timer (description, project, tags, billable, start). */
  async updateRunning(input: UpdateRunningInput): Promise<TimeEntry> {
    const running = await this.repo.findRunning(this.ctx.memberId)
    if (!running)
      throw new ConflictException({
        message: "No timer is running",
        code: "no_timer",
      })
    this.assertCanWrite(running.memberId)
    const { projectId, taskId } = this.nextTarget(running, input)
    await this.validateTarget(projectId, taskId)
    const tagIds =
      input.tagIds === undefined
        ? undefined
        : await this.validateTags(input.tagIds)
    const values: Record<string, unknown> = { projectId, taskId }
    if (input.description !== undefined) values.description = input.description
    if (input.billable !== undefined) values.billable = input.billable
    if (input.startedAt) {
      const startedAt = new Date(input.startedAt)
      const now = Date.now()
      if (startedAt.getTime() > now)
        throw new BadRequestException("The start can't be in the future")
      if (now - startedAt.getTime() > 24 * 3600_000)
        throw new BadRequestException("Timers can't run longer than 24 hours")
      values.startedAt = startedAt
      values.entryDate = await this.localDate(startedAt)
      await this.approvals.assertOpen(running.memberId, [
        values.entryDate as string,
      ])
    }
    await this.repo.database.transaction(async (tx) => {
      await this.repo.update(tx, running.id, values)
      if (tagIds) await this.repo.setTags(tx, [running.id], tagIds)
    })
    return this.toDto((await this.repo.findById(running.id))!)
  }

  /** Start a new timer with the same description, project, task, tags and billable. */
  async continue(id: string): Promise<TimeEntry> {
    const e = await this.require(id)
    return this.start({
      projectId: e.projectId,
      taskId: e.taskId,
      description: e.description ?? undefined,
      billable: e.billable,
      tagIds: e.tags.map((t) => t.id),
    })
  }

  /** Copy a finished entry (same owner and times, never invoiced). */
  async duplicate(id: string): Promise<TimeEntry> {
    const e = await this.require(id)
    this.assertCanWrite(e.memberId)
    if (e.endedAt === null)
      throw new BadRequestException("Stop the timer before duplicating it")
    await this.approvals.assertOpen(e.memberId, [e.entryDate])
    const newId = await this.repo.database.transaction(async (tx) => {
      const newId = await this.repo.insert(tx, {
        projectId: e.projectId,
        taskId: e.taskId,
        memberId: e.memberId,
        memberName: e.memberName,
        description: e.description,
        entryDate: e.entryDate,
        startedAt: e.startedAt,
        endedAt: e.endedAt,
        durationSeconds: e.durationSeconds,
        billable: e.billable,
      })
      await this.repo.setTags(
        tx,
        [newId],
        e.tags.map((t) => t.id)
      )
      return newId
    })
    return this.toDto((await this.repo.findById(newId))!)
  }

  /** Entries of `ids` this member may change; the rest count as skipped. */
  private async writable(ids: string[]) {
    const unique = [...new Set(ids)]
    const found = await this.repo.findMany(unique)
    const dates = found.map((e) => e.entryDate).sort()
    const locked = await this.approvals.lockedWeeks(
      [...new Set(found.map((e) => e.memberId).filter((m) => m !== null))],
      dates[0] ?? "1970-01-01",
      dates[dates.length - 1] ?? "1970-01-01"
    )
    const ok = found.filter((e) => {
      if (e.invoiceId) return false
      if (locked.has(`${e.memberId}|${mondayOf(e.entryDate)}`)) return false
      if (e.memberId !== this.ctx.memberId && !this.can("time.read"))
        return false
      try {
        this.assertCanWrite(e.memberId)
        return true
      } catch {
        return false
      }
    })
    return { ok, skipped: unique.length - ok.length }
  }

  async bulkUpdate(input: BulkUpdateTimeEntriesInput): Promise<BulkResult> {
    if (input.projectId !== undefined || input.taskId !== undefined)
      await this.validateTarget(input.projectId ?? null, input.taskId ?? null)
    const tagIds =
      input.tagIds === undefined
        ? undefined
        : await this.validateTags(input.tagIds)
    const { ok, skipped } = await this.writable(input.ids)
    const values: Record<string, unknown> = {}
    if (input.projectId !== undefined) {
      values.projectId = input.projectId
      values.taskId = input.taskId ?? null
    }
    if (input.billable !== undefined) values.billable = input.billable
    const ids = ok.map((e) => e.id)
    await this.repo.database.transaction(async (tx) => {
      await this.repo.updateMany(tx, ids, values)
      if (tagIds) await this.repo.setTags(tx, ids, tagIds, input.tagMode)
    })
    return { updated: ids.length, skipped }
  }

  async bulkDelete(ids: string[]): Promise<BulkResult> {
    const { ok, skipped } = await this.writable(ids)
    await this.repo.deleteMany(ok.map((e) => e.id))
    return { updated: ok.length, skipped }
  }

  /** Recent distinct description/project/task combos of the member's own time. */
  async suggestions(q?: string): Promise<TimeSuggestion[]> {
    const rows = await this.repo.recentWithDescription(
      this.ctx.memberId,
      q?.trim() || undefined
    )
    const seen = new Set<string>()
    const out: TimeSuggestion[] = []
    for (const e of rows) {
      const key = `${e.description!.toLowerCase()}|${e.projectId}|${e.taskId}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({
        description: e.description!,
        projectId: e.projectId,
        projectName: e.projectName,
        clientName: e.clientName,
        taskId: e.taskId,
        taskTitle: e.taskTitle,
        billable: e.billable,
        tags: e.tags.map(toTag),
      })
      if (out.length === 8) break
    }
    return out
  }

  // ── Tags ─────────────────────────────────────────────
  // Anyone who tracks time can see and create tags; renaming or deleting a
  // workspace-wide tag needs time.manage.

  async listTags(): Promise<Tag[]> {
    return (await this.repo.listTags()).map(toTag)
  }

  async createTag(input: CreateTagInput): Promise<Tag> {
    if (!this.can("time.track") && !this.can("time.manage"))
      throw new ForbiddenException("You can't create tags")
    try {
      return toTag(
        await this.repo.insertTag({
          name: input.name.trim(),
          color: input.color ?? null,
        })
      )
    } catch (e) {
      if (isUniqueViolation(e)) throw tagExists()
      throw e
    }
  }

  async updateTag(id: string, input: UpdateTagInput): Promise<Tag> {
    if (!this.can("time.manage"))
      throw new ForbiddenException("Changing tags needs time.manage")
    try {
      const row = await this.repo.updateTag(id, {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.color !== undefined ? { color: input.color ?? null } : {}),
      })
      if (!row) throw new NotFoundException("Tag not found")
      return toTag(row)
    } catch (e) {
      if (isUniqueViolation(e)) throw tagExists()
      throw e
    }
  }

  async deleteTag(id: string) {
    if (!this.can("time.manage"))
      throw new ForbiddenException("Deleting tags needs time.manage")
    if (!(await this.repo.findTag(id)))
      throw new NotFoundException("Tag not found")
    await this.repo.deleteTag(id)
  }

  private async validateTags(ids: string[] | undefined): Promise<string[]> {
    const unique = [...new Set(ids ?? [])]
    if ((await this.repo.countTags(unique)) !== unique.length)
      throw new BadRequestException("Unknown tag")
    return unique
  }

  /** Project/task after an edit: changing the project clears the task. */
  private nextTarget(
    entry: { projectId: string | null; taskId: string | null },
    input: { projectId?: string | null; taskId?: string | null }
  ) {
    const projectId =
      input.projectId === undefined ? entry.projectId : input.projectId
    const taskId =
      input.taskId === undefined
        ? input.projectId === undefined
          ? entry.taskId
          : null
        : input.taskId
    return { projectId, taskId }
  }

  // ── Timesheet grid ───────────────────────────────────

  /** The member's own week as (project, task) rows × Mon–Sun. */
  async timesheet(anyDate: string, forMemberId?: string): Promise<Timesheet> {
    const memberId = forMemberId ?? this.ctx.memberId
    if (memberId === this.ctx.memberId) {
      if (!this.can("time.track") && !this.can("time.manage"))
        throw new ForbiddenException("You can't track time")
    } else if (!this.can("time.read") && !this.can("time.approve")) {
      throw new ForbiddenException("You can only see your own time")
    }
    const start = mondayOf(anyDate)
    const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
    const [entries, approvalsEnabled, approval] = await Promise.all([
      this.repo.list({ from: days[0]!, to: days[6]!, memberId }),
      this.approvals.enabled(),
      this.approvals.forWeek(memberId, start),
    ])
    const rows = new Map<string, TimesheetRow>()
    for (const e of entries) {
      if (e.durationSeconds === null) continue // running
      const key = `${e.projectId}|${e.taskId}`
      const row = rows.get(key) ?? {
        projectId: e.projectId,
        projectName: e.projectName,
        clientName: e.clientName,
        taskId: e.taskId,
        taskTitle: e.taskTitle,
        seconds: [0, 0, 0, 0, 0, 0, 0],
        lockedSeconds: [0, 0, 0, 0, 0, 0, 0],
      }
      const i = days.indexOf(e.entryDate)
      row.seconds[i]! += e.durationSeconds
      if (e.invoiceId) row.lockedSeconds[i]! += e.durationSeconds
      rows.set(key, row)
    }
    return {
      weekStart: start,
      days,
      approvalsEnabled,
      approval: approvalsEnabled ? approval : null,
      locked:
        approvalsEnabled &&
        (approval?.status === "submitted" || approval?.status === "approved"),
      rows: [...rows.values()].sort(
        (a, b) =>
          (a.projectName ?? "\uffff").localeCompare(
            b.projectName ?? "\uffff"
          ) || (a.taskTitle ?? "").localeCompare(b.taskTitle ?? "")
      ),
    }
  }

  /**
   * Set one cell to a total. More time adds an entry for the difference;
   * less trims or deletes the cell's uninvoiced entries, newest first.
   */
  async setTimesheetCell(input: SetTimesheetCellInput): Promise<Timesheet> {
    this.assertCanWrite(this.ctx.memberId)
    await this.approvals.assertOpen(this.ctx.memberId, [input.date])
    const projectId = input.projectId ?? null
    const taskId = input.taskId ?? null
    const memberName = (await this.repo.memberName(this.ctx.memberId)) ?? ""
    const db = this.repo.database
    let project: Awaited<ReturnType<TimeService["validateTarget"]>> = null
    // Validate up front (outside the transaction) only when adding time.
    const current0 = (
      await this.repo.cellEntries(
        db,
        this.ctx.memberId,
        input.date,
        projectId,
        taskId
      )
    ).reduce((s, e) => s + (e.durationSeconds ?? 0), 0)
    if (input.seconds > current0)
      project = await this.validateTarget(projectId, taskId)

    await db.transaction(async (tx) => {
      const entries = await this.repo.cellEntries(
        tx,
        this.ctx.memberId,
        input.date,
        projectId,
        taskId
      )
      const current = entries.reduce((s, e) => s + (e.durationSeconds ?? 0), 0)
      if (input.seconds === current) return
      if (input.seconds > current) {
        if (!project) project = await this.validateTarget(projectId, taskId)
        const diff = input.seconds - current
        // Duration-only time is anchored at noon UTC of its date.
        const startedAt = new Date(`${input.date}T12:00:00Z`)
        await this.repo.insert(tx, {
          projectId,
          taskId,
          memberId: this.ctx.memberId,
          memberName,
          description: null,
          entryDate: input.date,
          startedAt,
          endedAt: new Date(startedAt.getTime() + diff * 1000),
          durationSeconds: diff,
          hasTimes: false,
          billable: defaultBillable(project),
        })
        return
      }
      const locked = entries
        .filter((e) => e.invoiceId)
        .reduce((s, e) => s + (e.durationSeconds ?? 0), 0)
      if (input.seconds < locked)
        throw new ConflictException({
          message: `${formatHm(locked)} of this is already invoiced, so it can't go below that`,
          code: "time_entry_invoiced",
        })
      let need = current - input.seconds
      const remove: string[] = []
      for (const e of entries) {
        if (need <= 0) break
        if (e.invoiceId) continue
        const d = e.durationSeconds ?? 0
        if (d <= need) {
          remove.push(e.id)
          need -= d
        } else {
          await this.repo.update(tx, e.id, {
            endedAt: new Date(e.endedAt!.getTime() - need * 1000),
            durationSeconds: d - need,
          })
          need = 0
        }
      }
      await this.repo.deleteIn(tx, remove)
    })
    return this.timesheet(input.date)
  }

  async stop(): Promise<TimeEntry> {
    const running = await this.repo.findRunning(this.ctx.memberId)
    if (!running)
      throw new ConflictException({
        message: "No timer is running",
        code: "no_timer",
      })
    await this.stopEntry(this.repo.database, running, new Date())
    return this.toDto((await this.repo.findById(running.id))!)
  }

  private async stopEntry(
    tx: Parameters<TimeRepository["update"]>[0],
    e: TimeEntryWithRefs,
    at: Date
  ) {
    const seconds = Math.max(
      1,
      Math.round((at.getTime() - e.startedAt.getTime()) / 1000)
    )
    await this.repo.update(tx, e.id, { endedAt: at, durationSeconds: seconds })
  }

  async create(input: CreateTimeEntryInput): Promise<TimeEntry> {
    const memberId = input.memberId ?? this.ctx.memberId
    this.assertCanWrite(memberId)
    const memberName = await this.repo.memberName(memberId)
    if (memberName === null) {
      throw new BadRequestException(
        "That person is not a member of this workspace"
      )
    }
    const project = await this.validateTarget(
      input.projectId ?? null,
      input.taskId ?? null
    )
    const tagIds = await this.validateTags(input.tagIds)
    const { startedAt, endedAt, entryDate, hasTimes } =
      await this.resolveSpan(input)
    await this.approvals.assertOpen(memberId, [entryDate])
    const id = await this.repo.database.transaction(async (tx) => {
      const id = await this.repo.insert(tx, {
        projectId: input.projectId ?? null,
        taskId: input.taskId ?? null,
        memberId,
        memberName,
        description: input.description ?? null,
        entryDate,
        startedAt,
        endedAt,
        hasTimes,
        durationSeconds: Math.round(
          (endedAt.getTime() - startedAt.getTime()) / 1000
        ),
        billable: input.billable ?? defaultBillable(project),
      })
      await this.repo.setTags(tx, [id], tagIds)
      return id
    })
    return this.toDto((await this.repo.findById(id))!)
  }

  async update(id: string, input: UpdateTimeEntryInput): Promise<TimeEntry> {
    const entry = await this.require(id)
    this.assertCanWrite(entry.memberId)
    await this.approvals.assertOpen(entry.memberId, [entry.entryDate])
    if (entry.invoiceId) {
      throw new ConflictException({
        message: `Already invoiced on ${entry.invoiceNumber ?? "a draft invoice"}`,
        code: "time_entry_invoiced",
      })
    }
    const { projectId, taskId } = this.nextTarget(entry, input)
    await this.validateTarget(projectId, taskId)
    const tagIds =
      input.tagIds === undefined
        ? undefined
        : await this.validateTags(input.tagIds)
    const values: Record<string, unknown> = {
      projectId,
      taskId,
      ...(input.description !== undefined
        ? { description: input.description }
        : {}),
      ...(input.billable !== undefined ? { billable: input.billable } : {}),
    }
    const timing =
      input.startedAt ||
      input.endedAt ||
      input.entryDate ||
      input.durationMinutes
    if (timing) {
      if (entry.endedAt === null)
        throw new BadRequestException(
          "Stop the timer before changing its times"
        )
      const span = await this.resolveSpan({
        startedAt:
          input.startedAt ??
          (input.entryDate || input.durationMinutes
            ? undefined
            : entry.startedAt.toISOString()),
        endedAt:
          input.endedAt ??
          (input.entryDate || input.durationMinutes
            ? undefined
            : entry.endedAt.toISOString()),
        entryDate: input.entryDate ?? entry.entryDate,
        durationMinutes:
          input.durationMinutes ??
          Math.round((entry.durationSeconds ?? 0) / 60),
      })
      await this.approvals.assertOpen(entry.memberId, [span.entryDate])
      Object.assign(values, {
        ...span,
        durationSeconds: Math.round(
          (span.endedAt.getTime() - span.startedAt.getTime()) / 1000
        ),
      })
    }
    await this.repo.database.transaction(async (tx) => {
      await this.repo.update(tx, id, values)
      if (tagIds) await this.repo.setTags(tx, [id], tagIds)
    })
    return this.toDto((await this.repo.findById(id))!)
  }

  async remove(id: string) {
    const entry = await this.require(id)
    this.assertCanWrite(entry.memberId)
    await this.approvals.assertOpen(entry.memberId, [entry.entryDate])
    if (entry.invoiceId) {
      throw new ConflictException({
        message: `Already invoiced on ${entry.invoiceNumber ?? "a draft invoice"}`,
        code: "time_entry_invoiced",
      })
    }
    await this.repo.delete(id)
  }

  async summary(projectId: string): Promise<ProjectTimeSummary> {
    const project = await this.projects.get(projectId)
    const u = (
      await this.projectUsage.usage([project], { cost: this.can("rate.read") })
    ).get(project.id)!
    return {
      totalSeconds: u.trackedSeconds,
      billableSeconds: u.billableSeconds,
      unbilledSeconds: u.unbilledSeconds,
      unbilledAmount: u.unbilledAmount,
      billableAmount: u.billableAmount,
      unratedSeconds: u.unratedSeconds,
      cost: u.cost,
      uncostedSeconds: u.uncostedSeconds,
      unapprovedSeconds: await this.repo.unapprovedSeconds(
        projectId,
        await this.approvals.invoiceableCondition()
      ),
      currency: project.currency,
    }
  }

  /**
   * Billable, uninvoiced time → a draft invoice for the project's client, one
   * line per task at the project's hourly rate. Entries are claimed
   * atomically; if another request claimed some first, the draft is removed.
   */
  async invoiceFromTime(
    projectId: string,
    entryIds?: string[]
  ): Promise<Invoice> {
    if (!this.can("invoice.create") || !this.can("time.read")) {
      throw new ForbiddenException(
        "Invoicing time needs invoice.create and time.read"
      )
    }
    const project = await this.projects.get(projectId)
    if (!project.clientId)
      throw new BadRequestException(
        "Internal projects have no client to invoice"
      )
    if (project.billing !== "hourly") {
      throw new BadRequestException({
        message: "Only hourly projects can invoice tracked time",
        code: "no_hourly_rate",
      })
    }
    const approved = await this.approvals.invoiceableCondition()
    const entries = await this.repo.unbilled(projectId, entryIds, approved)
    if (entries.length === 0)
      throw new BadRequestException(
        approved
          ? {
              message:
                "No approved, unbilled time to invoice. Time is invoiceable once its week's timesheet is approved.",
              code: "no_approved_time",
            }
          : {
              message: "No unbilled time to invoice",
              code: "no_unbilled_time",
            }
      )

    // Price each entry: task → project → member → workspace default rate.
    const [book, tasks] = await Promise.all([
      this.rates.book(),
      this.projects.listTasks(projectId),
    ])
    const taskRate = new Map(tasks.map((t) => [t.id, t.hourlyRate]))
    const priced = entries.map((e) => ({
      ...e,
      rate: book.rate({
        billing: project.billing,
        currency: project.currency,
        projectRate: project.hourlyRate,
        taskRate: e.taskId ? taskRate.get(e.taskId) : null,
        memberId: e.memberId,
      }),
    }))
    if (priced.some((e) => e.rate === null)) {
      throw new BadRequestException({
        message:
          "Some of this time has no hourly rate. Set one on the project, its tasks, the members or the workspace (Settings → Rates).",
        code: "no_hourly_rate",
      })
    }

    const profile = await this.profile.get()
    const groups = groupLines(
      priced as (TimeEntryWithRefs & { rate: number })[],
      project.name
    )
    const lines = groups.map((g) => ({
      description: g.description,
      quantity: Math.max(0.01, secondsToHours(g.seconds)),
      unitPrice: g.rate,
      taxRateBps: profile.defaultTaxRateBps,
    }))
    const invoice = await this.invoices.create({
      clientId: project.clientId,
      title: `${project.name} — time`,
      currency: project.currency,
      lines,
    })
    const claimed = await this.repo.markInvoiced(
      entries.map((e) => e.id),
      invoice.id
    )
    if (claimed !== entries.length) {
      await this.invoices.remove(invoice.id) // releases any claimed entries (FK set null)
      throw new ConflictException({
        message: "Some of this time was just invoiced elsewhere. Try again.",
        code: "time_already_invoiced",
      })
    }
    for (const g of groups)
      await this.repo.setBilledRate(g.entryIds, invoice.id, g.rate)
    await this.audit.record("time.invoiced", {
      resourceType: "invoice",
      resourceId: invoice.id,
      metadata: { projectId, entries: entries.length },
    })
    return this.invoices.get(invoice.id)
  }

  private async resolveSpan(input: {
    startedAt?: string
    endedAt?: string
    entryDate?: string
    durationMinutes?: number
  }) {
    if (input.startedAt && input.endedAt) {
      const startedAt = new Date(input.startedAt)
      const endedAt = new Date(input.endedAt)
      if (endedAt <= startedAt)
        throw new BadRequestException("End must be after start")
      if (endedAt.getTime() - startedAt.getTime() > 24 * 3600_000)
        throw new BadRequestException("Entries can't be longer than 24 hours")
      return {
        startedAt,
        endedAt,
        entryDate: await this.localDate(startedAt),
        hasTimes: true,
      }
    }
    if (input.entryDate && input.durationMinutes) {
      // Duration-only entries are anchored at noon UTC of their date.
      const startedAt = new Date(`${input.entryDate}T12:00:00Z`)
      return {
        startedAt,
        endedAt: new Date(startedAt.getTime() + input.durationMinutes * 60_000),
        entryDate: input.entryDate,
        hasTimes: false,
      }
    }
    throw new BadRequestException(
      "Give a start and end time, or a date and duration"
    )
  }

  /** Check the project (if any) is open and the task belongs to it. */
  private async validateTarget(
    projectId: string | null,
    taskId: string | null
  ) {
    if (!projectId) {
      if (taskId) throw new BadRequestException("Pick a project for the task")
      return null
    }
    const project = await this.projects.get(projectId)
    if (project.status === "archived")
      throw new BadRequestException("Restore the project to track time on it")
    if (taskId && !(await this.repo.taskBelongsToProject(taskId, projectId))) {
      throw new BadRequestException("That task is not part of the project")
    }
    return project
  }

  private async require(id: string) {
    const entry = await this.repo.findById(id)
    if (!entry) throw new NotFoundException("Time entry not found")
    if (entry.memberId !== this.ctx.memberId && !this.can("time.read"))
      throw new NotFoundException("Time entry not found")
    return entry
  }
}

const toTag = (t: TagRow): Tag => ({
  id: t.id,
  name: t.name,
  color: (t.color as Tag["color"]) ?? null,
})

const tagExists = () =>
  new ConflictException({
    message: "A tag with that name already exists",
    code: "tag_exists",
  })

/** Monday of the week containing `iso`. */
export function mondayOf(iso: string): string {
  const day = (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7
  return addDays(iso, -day)
}

const formatHm = (seconds: number) =>
  `${Math.floor(seconds / 3600)}:${String(Math.round((seconds % 3600) / 60)).padStart(2, "0")}`

/** Time on a non-billable project isn't billable; everything else is. */
const defaultBillable = (project: { billing: string } | null) =>
  project ? project.billing !== "non_billable" : true

/**
 * One invoice line per task and rate (entries without a task share a line;
 * the same task at two rates, e.g. two members, gets two lines).
 */
export function groupLines<
  E extends Pick<
    TimeEntryWithRefs,
    "id" | "taskId" | "taskTitle" | "durationSeconds" | "entryDate"
  > & { rate?: number },
>(entries: E[], projectName: string) {
  const groups = new Map<
    string,
    {
      title: string
      rate: number
      seconds: number
      from: string
      to: string
      entryIds: string[]
    }
  >()
  for (const e of entries) {
    const key = `${e.taskId ?? "__general__"}:${e.rate ?? 0}`
    const g = groups.get(key) ?? {
      title: e.taskTitle ?? projectName,
      rate: e.rate ?? 0,
      seconds: 0,
      from: e.entryDate,
      to: e.entryDate,
      entryIds: [],
    }
    g.seconds += e.durationSeconds ?? 0
    g.entryIds.push(e.id)
    if (e.entryDate < g.from) g.from = e.entryDate
    if (e.entryDate > g.to) g.to = e.entryDate
    groups.set(key, g)
  }
  return [...groups.values()].map((g) => ({
    description: `${g.title} (${g.from === g.to ? g.from : `${g.from} – ${g.to}`})`,
    seconds: g.seconds,
    rate: g.rate,
    entryIds: g.entryIds,
  }))
}
