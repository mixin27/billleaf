import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common"
import {
  type CreateTimeEntryInput,
  type Invoice,
  type ProjectTimeSummary,
  secondsToHours,
  type StartTimerInput,
  type TimeEntry,
  type TimeEntryList,
  type UpdateTimeEntryInput,
} from "@workspace/contracts"

import { RequestContext } from "../../common/context/request-context.js"
import { AuditService } from "../../iam/audit/audit.service.js"
import { todayIn } from "../documents/party-snapshot.js"
import { InvoicesService } from "../invoices/invoices.service.js"
import { ProjectsService } from "../projects/projects.service.js"
import { WorkspaceProfileService } from "../workspace/workspace-profile.service.js"
import { TimeRepository, type TimeEntryWithRefs } from "./time.repository.js"

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
    private readonly audit: AuditService
  ) {}

  private can(
    p: "time.track" | "time.read" | "time.manage" | "invoice.create"
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
    billable: e.billable,
    invoiceId: e.invoiceId,
    invoiceNumber: e.invoiceNumber,
    isRunning: e.endedAt === null,
    isMine: e.memberId === this.ctx.memberId,
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
      memberId,
      billable: q.billable === undefined ? undefined : q.billable === "true",
      uninvoiced: q.uninvoiced === "true",
    })
    const finished = rows.filter((r) => r.durationSeconds !== null)
    return {
      items: rows.map(this.toDto),
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
      input.projectId,
      input.taskId ?? null
    )
    const now = new Date()
    const entryDate = await this.localDate(now)
    const memberName = (await this.repo.memberName(this.ctx.memberId)) ?? ""
    try {
      const id = await this.repo.database.transaction(async (tx) => {
        const running = await this.repo.findRunning(this.ctx.memberId, tx)
        if (running) await this.stopEntry(tx, running, now)
        return this.repo.insert(tx, {
          projectId: input.projectId,
          taskId: input.taskId ?? null,
          memberId: this.ctx.memberId,
          memberName,
          description: input.description ?? null,
          entryDate,
          startedAt: now,
          endedAt: null,
          durationSeconds: null,
          billable: project.billing !== "non_billable",
        })
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
      input.projectId,
      input.taskId ?? null
    )
    const { startedAt, endedAt, entryDate } = await this.resolveSpan(input)
    const id = await this.repo.insert(this.repo.database, {
      projectId: input.projectId,
      taskId: input.taskId ?? null,
      memberId,
      memberName,
      description: input.description ?? null,
      entryDate,
      startedAt,
      endedAt,
      durationSeconds: Math.round(
        (endedAt.getTime() - startedAt.getTime()) / 1000
      ),
      billable: input.billable ?? project.billing !== "non_billable",
    })
    return this.toDto((await this.repo.findById(id))!)
  }

  async update(id: string, input: UpdateTimeEntryInput): Promise<TimeEntry> {
    const entry = await this.require(id)
    this.assertCanWrite(entry.memberId)
    if (entry.invoiceId) {
      throw new ConflictException({
        message: `Already invoiced on ${entry.invoiceNumber ?? "a draft invoice"}`,
        code: "time_entry_invoiced",
      })
    }
    const projectId = input.projectId ?? entry.projectId
    const taskId =
      input.taskId === undefined
        ? input.projectId
          ? null
          : entry.taskId
        : input.taskId
    await this.validateTarget(projectId, taskId)
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
      Object.assign(values, {
        ...span,
        durationSeconds: Math.round(
          (span.endedAt.getTime() - span.startedAt.getTime()) / 1000
        ),
      })
    }
    await this.repo.update(this.repo.database, id, values)
    return this.toDto((await this.repo.findById(id))!)
  }

  async remove(id: string) {
    const entry = await this.require(id)
    this.assertCanWrite(entry.memberId)
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
    const s = await this.repo.summary(projectId)
    return {
      totalSeconds: s.total,
      billableSeconds: s.billable,
      unbilledSeconds: s.unbilled,
      unbilledAmount:
        project.billing === "hourly" && project.hourlyRate !== null
          ? unbilledAmountFor(s.unbilled, project.hourlyRate)
          : null,
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
    if (project.billing !== "hourly" || project.hourlyRate === null) {
      throw new BadRequestException({
        message: "Set an hourly rate on the project first",
        code: "no_hourly_rate",
      })
    }
    const entries = await this.repo.unbilled(projectId, entryIds)
    if (entries.length === 0)
      throw new BadRequestException({
        message: "No unbilled time to invoice",
        code: "no_unbilled_time",
      })

    const profile = await this.profile.get()
    const lines = groupLines(entries, project.name).map((g) => ({
      description: g.description,
      quantity: Math.max(0.01, secondsToHours(g.seconds)),
      unitPrice: project.hourlyRate!,
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
      return { startedAt, endedAt, entryDate: await this.localDate(startedAt) }
    }
    if (input.entryDate && input.durationMinutes) {
      // Duration-only entries are anchored at noon UTC of their date.
      const startedAt = new Date(`${input.entryDate}T12:00:00Z`)
      return {
        startedAt,
        endedAt: new Date(startedAt.getTime() + input.durationMinutes * 60_000),
        entryDate: input.entryDate,
      }
    }
    throw new BadRequestException(
      "Give a start and end time, or a date and duration"
    )
  }

  private async validateTarget(projectId: string, taskId: string | null) {
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

/** Amount for unbilled seconds at an hourly rate (matches invoice line math). */
export function unbilledAmountFor(seconds: number, hourlyRate: number) {
  return Math.round(secondsToHours(seconds) * hourlyRate)
}

/** One invoice line per task (entries without a task share a line). */
export function groupLines(
  entries: Pick<
    TimeEntryWithRefs,
    "taskId" | "taskTitle" | "durationSeconds" | "entryDate"
  >[],
  projectName: string
) {
  const groups = new Map<
    string,
    { title: string; seconds: number; from: string; to: string }
  >()
  for (const e of entries) {
    const key = e.taskId ?? "__general__"
    const g = groups.get(key) ?? {
      title: e.taskTitle ?? projectName,
      seconds: 0,
      from: e.entryDate,
      to: e.entryDate,
    }
    g.seconds += e.durationSeconds ?? 0
    if (e.entryDate < g.from) g.from = e.entryDate
    if (e.entryDate > g.to) g.to = e.entryDate
    groups.set(key, g)
  }
  return [...groups.values()].map((g) => ({
    description: `${g.title} (${g.from === g.to ? g.from : `${g.from} – ${g.to}`})`,
    seconds: g.seconds,
  }))
}
