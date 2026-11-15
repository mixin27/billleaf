import { Injectable } from "@nestjs/common"
import type { TaskStatus } from "@workspace/contracts"
import {
  clients,
  member,
  projects,
  quotes,
  tasks,
  timeEntries,
  user,
} from "@workspace/db"
import {
  and,
  asc,
  count,
  eq,
  ilike,
  inArray,
  max,
  min,
  or,
  type SQL,
  sql,
} from "drizzle-orm"

import { RequestContext } from "../../common/context/request-context.js"
import { offsetOf, orderBy, type PageArgs } from "../../common/pagination.js"
import { InjectDb, type Database } from "../../core/database/database.module.js"

export type ProjectRow = typeof projects.$inferSelect
export type ProjectWithRefs = ProjectRow & {
  clientName: string | null
  quoteNumber: string | null
  taskCounts: Record<TaskStatus, number>
}
export type TaskRow = typeof tasks.$inferSelect & {
  assigneeName: string | null
}
export type ProjectValues = Omit<
  typeof projects.$inferInsert,
  "id" | "workspaceId" | "createdAt" | "updatedAt"
>

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`)

@Injectable()
export class ProjectsRepository {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly ctx: RequestContext
  ) {}

  private scope(): SQL {
    return eq(projects.workspaceId, this.ctx.workspaceId)
  }

  private async withCounts(
    rows: {
      project: ProjectRow
      clientName: string | null
      quoteNumber: string | null
    }[]
  ): Promise<ProjectWithRefs[]> {
    if (rows.length === 0) return []
    const counts = await this.db
      .select({
        projectId: tasks.projectId,
        status: tasks.status,
        n: sql<number>`count(*)::int`,
      })
      .from(tasks)
      .where(
        inArray(
          tasks.projectId,
          rows.map((r) => r.project.id)
        )
      )
      .groupBy(tasks.projectId, tasks.status)
    return rows.map((r) => {
      const taskCounts = { todo: 0, in_progress: 0, done: 0 }
      for (const c of counts)
        if (c.projectId === r.project.id) taskCounts[c.status] = c.n
      return {
        ...r.project,
        clientName: r.clientName,
        quoteNumber: r.quoteNumber,
        taskCounts,
      }
    })
  }

  private select() {
    return this.db
      .select({
        project: projects,
        clientName: clients.name,
        quoteNumber: quotes.number,
      })
      .from(projects)
      .leftJoin(clients, eq(clients.id, projects.clientId))
      .leftJoin(quotes, eq(quotes.id, projects.quoteId))
  }

  async list(
    opts: PageArgs & {
      status?: ProjectRow["status"]
      clientId?: string
      q?: string
    }
  ): Promise<{ items: ProjectWithRefs[]; total: number }> {
    const filters: SQL[] = [this.scope()]
    if (opts.status) filters.push(eq(projects.status, opts.status))
    if (opts.clientId) filters.push(eq(projects.clientId, opts.clientId))
    if (opts.q) {
      const like = `%${escapeLike(opts.q)}%`
      filters.push(or(ilike(projects.name, like), ilike(clients.name, like))!)
    }
    const where = and(...filters)
    const [rows, [counted]] = await Promise.all([
      this.select()
        .where(where)
        .orderBy(
          ...orderBy(
            opts.sort,
            {
              name: sql`lower(${projects.name})`,
              clientName: sql`lower(${clients.name})`,
              dueDate: projects.dueDate,
              createdAt: projects.createdAt,
            },
            projects.id
          )
        )
        .limit(opts.pageSize)
        .offset(offsetOf(opts.page, opts.pageSize)),
      this.db
        .select({ n: count() })
        .from(projects)
        .leftJoin(clients, eq(clients.id, projects.clientId))
        .where(where),
    ])
    return { items: await this.withCounts(rows), total: counted?.n ?? 0 }
  }

  async findById(id: string): Promise<ProjectWithRefs | null> {
    const rows = await this.select()
      .where(and(this.scope(), eq(projects.id, id)))
      .limit(1)
    return (await this.withCounts(rows))[0] ?? null
  }

  async findByQuote(quoteId: string) {
    const [row] = await this.db
      .select({ id: projects.id })
      .from(projects)
      .where(and(this.scope(), eq(projects.quoteId, quoteId)))
      .limit(1)
    return row ?? null
  }

  async create(values: ProjectValues): Promise<string> {
    const [row] = await this.db
      .insert(projects)
      .values({ ...values, workspaceId: this.ctx.workspaceId })
      .returning({ id: projects.id })
    return row!.id
  }

  async update(id: string, values: Partial<ProjectValues>) {
    await this.db
      .update(projects)
      .set(values)
      .where(and(this.scope(), eq(projects.id, id)))
  }

  async hasTimeEntries(id: string) {
    const [row] = await this.db
      .select({ id: timeEntries.id })
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.workspaceId, this.ctx.workspaceId),
          eq(timeEntries.projectId, id)
        )
      )
      .limit(1)
    return Boolean(row)
  }

  async delete(id: string) {
    await this.db.delete(projects).where(and(this.scope(), eq(projects.id, id)))
  }

  // ── tasks ───────────────────────────────────────────────────────────────

  private taskScope(projectId: string): SQL {
    return and(
      eq(tasks.workspaceId, this.ctx.workspaceId),
      eq(tasks.projectId, projectId)
    )!
  }

  async listTasks(projectId: string): Promise<TaskRow[]> {
    const rows = await this.db
      .select({ task: tasks, assigneeName: user.name })
      .from(tasks)
      .leftJoin(member, eq(member.id, tasks.assigneeMemberId))
      .leftJoin(user, eq(user.id, member.userId))
      .where(this.taskScope(projectId))
      .orderBy(asc(tasks.status), asc(tasks.position))
    return rows.map((r) => ({ ...r.task, assigneeName: r.assigneeName }))
  }

  async findTask(projectId: string, taskId: string): Promise<TaskRow | null> {
    return (
      (await this.listTasks(projectId)).find((t) => t.id === taskId) ?? null
    )
  }

  async columnBounds(projectId: string, status: TaskStatus) {
    const [row] = await this.db
      .select({ min: min(tasks.position), max: max(tasks.position) })
      .from(tasks)
      .where(and(this.taskScope(projectId), eq(tasks.status, status)))
    return { min: row?.min ?? null, max: row?.max ?? null }
  }

  /** Positions of a column in order (for midpoint insertion / renumbering). */
  async column(projectId: string, status: TaskStatus) {
    return this.db
      .select({ id: tasks.id, position: tasks.position })
      .from(tasks)
      .where(and(this.taskScope(projectId), eq(tasks.status, status)))
      .orderBy(asc(tasks.position))
  }

  async insertTask(
    values: Omit<
      typeof tasks.$inferInsert,
      "id" | "workspaceId" | "createdAt" | "updatedAt"
    >
  ) {
    const [row] = await this.db
      .insert(tasks)
      .values({ ...values, workspaceId: this.ctx.workspaceId })
      .returning({ id: tasks.id })
    return row!.id
  }

  async updateTask(
    projectId: string,
    taskId: string,
    values: Partial<typeof tasks.$inferInsert>
  ) {
    await this.db
      .update(tasks)
      .set(values)
      .where(and(this.taskScope(projectId), eq(tasks.id, taskId)))
  }

  async deleteTask(projectId: string, taskId: string) {
    const rows = await this.db
      .delete(tasks)
      .where(and(this.taskScope(projectId), eq(tasks.id, taskId)))
      .returning({ id: tasks.id })
    return rows.length > 0
  }

  async isWorkspaceMember(memberId: string) {
    const [row] = await this.db
      .select({ id: member.id })
      .from(member)
      .where(
        and(
          eq(member.id, memberId),
          eq(member.organizationId, this.ctx.workspaceId)
        )
      )
      .limit(1)
    return Boolean(row)
  }
}
