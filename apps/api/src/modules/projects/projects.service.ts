import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common"
import type {
  CreateProjectInput,
  CreateTaskInput,
  Project,
  ProjectList,
  ProjectStatus,
  Task,
  UpdateProjectInput,
  UpdateTaskInput,
} from "@workspace/contracts"

import { type PageArgs } from "../../common/pagination.js"
import { AuditService } from "../../iam/audit/audit.service.js"
import { ClientsRepository } from "../clients/clients.repository.js"
import { todayIn } from "../documents/party-snapshot.js"
import { QuotesService } from "../quotes/quotes.service.js"
import { WorkspaceProfileService } from "../workspace/workspace-profile.service.js"
import {
  ProjectsRepository,
  type ProjectWithRefs,
  type TaskRow,
} from "./projects.repository.js"
import { positionAfter, renumber } from "./task-position.js"

export function toProjectDto(p: ProjectWithRefs, today: string): Project {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    status: p.status,
    clientId: p.clientId,
    clientName: p.clientName,
    quoteId: p.quoteId,
    quoteNumber: p.quoteNumber,
    billing: p.billing,
    currency: p.currency,
    budgetAmount: p.budgetAmount,
    hourlyRate: p.hourlyRate,
    estimateMinutes: p.estimateMinutes,
    estimateAmount: p.estimateAmount,
    trackedSeconds: p.trackedSeconds,
    startDate: p.startDate,
    dueDate: p.dueDate,
    isOverdue: p.status === "active" && p.dueDate !== null && p.dueDate < today,
    taskCounts: p.taskCounts,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  }
}

export function toTaskDto(t: TaskRow): Task {
  return {
    id: t.id,
    projectId: t.projectId,
    title: t.title,
    notes: t.notes,
    status: t.status,
    position: t.position,
    dueDate: t.dueDate,
    assigneeMemberId: t.assigneeMemberId,
    assigneeName: t.assigneeName,
    hourlyRate: t.hourlyRate,
    completedAt: t.completedAt?.toISOString() ?? null,
    createdAt: t.createdAt.toISOString(),
  }
}

/** Projects and their tasks. Inputs are parsed by the Zod pipe. */
@Injectable()
export class ProjectsService {
  constructor(
    private readonly repo: ProjectsRepository,
    private readonly clients: ClientsRepository,
    private readonly quotes: QuotesService,
    private readonly profile: WorkspaceProfileService,
    private readonly audit: AuditService
  ) {}

  private async today() {
    return todayIn((await this.profile.get()).timezone)
  }

  async list(
    query: PageArgs & {
      status?: ProjectStatus
      clientId?: string
      q?: string
    }
  ): Promise<ProjectList> {
    const [{ items, total }, today] = await Promise.all([
      this.repo.list(query),
      this.today(),
    ])
    return {
      items: items.map((p) => toProjectDto(p, today)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    }
  }

  async get(id: string): Promise<Project> {
    return toProjectDto(await this.require(id), await this.today())
  }

  async create(
    input: CreateProjectInput,
    quoteId: string | null = null
  ): Promise<Project> {
    const client = input.clientId
      ? await this.activeClient(input.clientId)
      : null
    const profile = await this.profile.get()
    const billing = input.billing ?? "hourly"
    const id = await this.repo.create({
      name: input.name,
      description: input.description ?? null,
      clientId: client?.id ?? null,
      quoteId,
      billing,
      currency: input.currency ?? client?.currency ?? profile.defaultCurrency,
      budgetAmount: billing === "fixed" ? (input.budgetAmount ?? null) : null,
      hourlyRate: billing === "hourly" ? (input.hourlyRate ?? null) : null,
      estimateMinutes: input.estimateMinutes ?? null,
      // A money estimate measures billable amounts, so only hourly projects have one.
      estimateAmount:
        billing === "hourly" ? (input.estimateAmount ?? null) : null,
      startDate: input.startDate ?? null,
      dueDate: input.dueDate ?? null,
    })
    await this.audit.record("project.created", {
      resourceType: "project",
      resourceId: id,
    })
    return this.get(id)
  }

  /** Accepted quote → fixed-price project budgeted at the quote total. */
  async createFromQuote(quoteId: string): Promise<Project> {
    const quote = await this.quotes.get(quoteId)
    if (quote.status !== "accepted")
      throw new ConflictException("Only accepted quotes can start a project")
    const existing = await this.repo.findByQuote(quoteId)
    if (existing) {
      throw new ConflictException({
        message: "A project already exists for this quote",
        code: "quote_has_project",
      })
    }
    return this.create(
      {
        name: quote.title ?? `${quote.clientName} — ${quote.number}`,
        clientId: quote.clientId,
        billing: "fixed",
        currency: quote.currency,
        budgetAmount: quote.total,
        description: quote.notes,
      },
      quoteId
    )
  }

  async update(id: string, input: UpdateProjectInput): Promise<Project> {
    const project = await this.require(id)
    if (input.clientId && input.clientId !== project.clientId)
      await this.activeClient(input.clientId)
    const billing = input.billing ?? project.billing
    // Keep only the amount that matches the billing type.
    const values = { ...(input as object) } as Record<string, unknown>
    if (
      input.billing !== undefined ||
      input.budgetAmount !== undefined ||
      input.hourlyRate !== undefined
    ) {
      values.budgetAmount =
        billing === "fixed"
          ? (input.budgetAmount ?? project.budgetAmount)
          : null
      values.hourlyRate =
        billing === "hourly" ? (input.hourlyRate ?? project.hourlyRate) : null
    }
    if (billing !== "hourly") values.estimateAmount = null
    const start = (
      input.startDate === undefined ? project.startDate : input.startDate
    ) as string | null
    const due = (
      input.dueDate === undefined ? project.dueDate : input.dueDate
    ) as string | null
    if (start && due && start > due)
      throw new BadRequestException(
        "Due date must be on or after the start date"
      )
    await this.repo.update(id, values)
    if (input.status && input.status !== project.status) {
      await this.audit.record("project.status_changed", {
        resourceType: "project",
        resourceId: id,
        metadata: { from: project.status, to: input.status },
      })
    }
    return this.get(id)
  }

  async remove(id: string): Promise<void> {
    await this.require(id)
    if (await this.repo.hasTimeEntries(id)) {
      throw new ConflictException({
        message: "This project has tracked time. Archive it instead.",
        code: "project_has_time",
      })
    }
    await this.repo.delete(id)
    await this.audit.record("project.deleted", {
      resourceType: "project",
      resourceId: id,
    })
  }

  // ── tasks ───────────────────────────────────────────────────────────────

  async listTasks(projectId: string): Promise<Task[]> {
    await this.require(projectId)
    return (await this.repo.listTasks(projectId)).map(toTaskDto)
  }

  async createTask(projectId: string, input: CreateTaskInput): Promise<Task> {
    await this.require(projectId)
    if (input.assigneeMemberId) await this.requireMember(input.assigneeMemberId)
    const status = input.status ?? "todo"
    const { max } = await this.repo.columnBounds(projectId, status)
    const id = await this.repo.insertTask({
      projectId,
      title: input.title,
      notes: input.notes ?? null,
      status,
      position: (max ?? 0) + 1024,
      dueDate: input.dueDate ?? null,
      assigneeMemberId: input.assigneeMemberId ?? null,
      hourlyRate: input.hourlyRate ?? null,
      completedAt: status === "done" ? new Date() : null,
    })
    return toTaskDto((await this.repo.findTask(projectId, id))!)
  }

  async updateTask(
    projectId: string,
    taskId: string,
    input: UpdateTaskInput
  ): Promise<Task> {
    await this.require(projectId)
    const task = await this.repo.findTask(projectId, taskId)
    if (!task) throw new NotFoundException("Task not found")
    if (input.assigneeMemberId) await this.requireMember(input.assigneeMemberId)

    const { afterTaskId, ...fields } = input
    const values: Record<string, unknown> = { ...fields }
    const status = input.status ?? task.status
    if (input.status && input.status !== task.status) {
      values.completedAt = input.status === "done" ? new Date() : null
    }
    if (
      afterTaskId !== undefined ||
      (input.status && input.status !== task.status)
    ) {
      let column = await this.repo.column(projectId, status)
      // undefined = append to the end; null = move to the top.
      const target = (col: { id: string }[]) =>
        afterTaskId === undefined
          ? (col.filter((c) => c.id !== taskId).at(-1)?.id ?? null)
          : afterTaskId
      let position = positionAfter(column, target(column), taskId)
      if (position === null) {
        // Neighbours too close: renumber the column, then place again.
        for (const p of renumber(column.filter((c) => c.id !== taskId))) {
          await this.repo.updateTask(projectId, p.id, { position: p.position })
        }
        column = await this.repo.column(projectId, status)
        position = positionAfter(column, target(column), taskId)!
      }
      values.position = position
    }
    await this.repo.updateTask(projectId, taskId, values)
    return toTaskDto((await this.repo.findTask(projectId, taskId))!)
  }

  async deleteTask(projectId: string, taskId: string): Promise<void> {
    await this.require(projectId)
    if (!(await this.repo.deleteTask(projectId, taskId)))
      throw new NotFoundException("Task not found")
  }

  private async require(id: string) {
    const project = await this.repo.findById(id)
    if (!project) throw new NotFoundException("Project not found")
    return project
  }

  private async requireMember(memberId: string) {
    if (!(await this.repo.isWorkspaceMember(memberId)))
      throw new BadRequestException(
        "Assignee is not a member of this workspace"
      )
  }

  private async activeClient(clientId: string) {
    const client = await this.clients.findById(clientId)
    if (!client) throw new BadRequestException("Client not found")
    if (client.archivedAt)
      throw new BadRequestException("Restore the client first")
    return client
  }
}
