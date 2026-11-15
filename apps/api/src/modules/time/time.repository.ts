import { Injectable } from "@nestjs/common"
import {
  clients,
  invoices,
  member,
  projects,
  tasks,
  timeEntries,
  type Transaction,
  user,
} from "@workspace/db"
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  type SQL,
  sql,
} from "drizzle-orm"

import { RequestContext } from "../../common/context/request-context.js"
import { InjectDb, type Database } from "../../core/database/database.module.js"

export type TimeEntryRow = typeof timeEntries.$inferSelect
export type TimeEntryWithRefs = TimeEntryRow & {
  projectName: string
  clientName: string | null
  taskTitle: string | null
  memberName: string
  invoiceNumber: string | null
}
export type TimeValues = Omit<
  typeof timeEntries.$inferInsert,
  "id" | "workspaceId" | "createdAt" | "updatedAt"
>

@Injectable()
export class TimeRepository {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly ctx: RequestContext
  ) {}

  get database() {
    return this.db
  }

  private scope(): SQL {
    return eq(timeEntries.workspaceId, this.ctx.workspaceId)
  }

  private select(tx: Database | Transaction = this.db) {
    return tx
      .select({
        entry: timeEntries,
        projectName: projects.name,
        clientName: clients.name,
        taskTitle: tasks.title,
        memberName: user.name,
        invoiceNumber: invoices.number,
      })
      .from(timeEntries)
      .innerJoin(projects, eq(projects.id, timeEntries.projectId))
      .leftJoin(clients, eq(clients.id, projects.clientId))
      .leftJoin(tasks, eq(tasks.id, timeEntries.taskId))
      .innerJoin(member, eq(member.id, timeEntries.memberId))
      .innerJoin(user, eq(user.id, member.userId))
      .leftJoin(invoices, eq(invoices.id, timeEntries.invoiceId))
  }

  private static flatten(r: {
    entry: TimeEntryRow
    projectName: string
    clientName: string | null
    taskTitle: string | null
    memberName: string
    invoiceNumber: string | null
  }): TimeEntryWithRefs {
    return {
      ...r.entry,
      projectName: r.projectName,
      clientName: r.clientName,
      taskTitle: r.taskTitle,
      memberName: r.memberName,
      invoiceNumber: r.invoiceNumber,
    }
  }

  async list(opts: {
    from: string
    to: string
    projectId?: string
    memberId?: string
    billable?: boolean
    uninvoiced?: boolean
  }): Promise<TimeEntryWithRefs[]> {
    const filters: SQL[] = [
      this.scope(),
      gte(timeEntries.entryDate, opts.from),
      lte(timeEntries.entryDate, opts.to),
    ]
    if (opts.projectId) filters.push(eq(timeEntries.projectId, opts.projectId))
    if (opts.memberId) filters.push(eq(timeEntries.memberId, opts.memberId))
    if (opts.billable !== undefined)
      filters.push(eq(timeEntries.billable, opts.billable))
    if (opts.uninvoiced) filters.push(isNull(timeEntries.invoiceId))
    const rows = await this.select()
      .where(and(...filters))
      .orderBy(desc(timeEntries.entryDate), desc(timeEntries.startedAt))
      .limit(2000)
    return rows.map(TimeRepository.flatten)
  }

  async findById(
    id: string,
    tx: Database | Transaction = this.db
  ): Promise<TimeEntryWithRefs | null> {
    const [row] = await this.select(tx)
      .where(and(this.scope(), eq(timeEntries.id, id)))
      .limit(1)
    return row ? TimeRepository.flatten(row) : null
  }

  async findRunning(
    memberId: string,
    tx: Database | Transaction = this.db
  ): Promise<TimeEntryWithRefs | null> {
    const [row] = await this.select(tx)
      .where(
        and(
          this.scope(),
          eq(timeEntries.memberId, memberId),
          isNull(timeEntries.endedAt)
        )
      )
      .limit(1)
    return row ? TimeRepository.flatten(row) : null
  }

  async insert(
    tx: Database | Transaction,
    values: TimeValues
  ): Promise<string> {
    const [row] = await tx
      .insert(timeEntries)
      .values({ ...values, workspaceId: this.ctx.workspaceId })
      .returning({ id: timeEntries.id })
    return row!.id
  }

  async update(
    tx: Database | Transaction,
    id: string,
    values: Partial<TimeValues>
  ) {
    await tx
      .update(timeEntries)
      .set(values)
      .where(and(this.scope(), eq(timeEntries.id, id)))
  }

  async delete(id: string) {
    await this.db
      .delete(timeEntries)
      .where(and(this.scope(), eq(timeEntries.id, id)))
  }

  /** Billable, finished, uninvoiced entries of a project (optionally a subset). */
  async unbilled(projectId: string, ids?: string[]) {
    const filters: SQL[] = [
      this.scope(),
      eq(timeEntries.projectId, projectId),
      eq(timeEntries.billable, true),
      isNull(timeEntries.invoiceId),
      isNotNull(timeEntries.endedAt),
    ]
    if (ids) filters.push(inArray(timeEntries.id, ids))
    return this.select()
      .where(and(...filters))
      .orderBy(asc(timeEntries.entryDate))
      .then((rows) => rows.map(TimeRepository.flatten))
  }

  /** Claim entries for an invoice; returns how many were claimed (race-safe). */
  async markInvoiced(ids: string[], invoiceId: string): Promise<number> {
    const rows = await this.db
      .update(timeEntries)
      .set({ invoiceId })
      .where(
        and(
          this.scope(),
          inArray(timeEntries.id, ids),
          isNull(timeEntries.invoiceId)
        )
      )
      .returning({ id: timeEntries.id })
    return rows.length
  }

  async summary(projectId: string) {
    const [row] = await this.db
      .select({
        total: sql<string>`coalesce(sum(${timeEntries.durationSeconds}), 0)`,
        billable: sql<string>`coalesce(sum(${timeEntries.durationSeconds}) filter (where ${timeEntries.billable}), 0)`,
        unbilled: sql<string>`coalesce(sum(${timeEntries.durationSeconds}) filter (where ${timeEntries.billable} and ${timeEntries.invoiceId} is null), 0)`,
      })
      .from(timeEntries)
      .where(
        and(
          this.scope(),
          eq(timeEntries.projectId, projectId),
          isNotNull(timeEntries.endedAt)
        )
      )
    return {
      total: Number(row?.total ?? 0),
      billable: Number(row?.billable ?? 0),
      unbilled: Number(row?.unbilled ?? 0),
    }
  }

  async taskBelongsToProject(taskId: string, projectId: string) {
    const [row] = await this.db
      .select({ id: tasks.id })
      .from(tasks)
      .where(
        and(
          eq(tasks.id, taskId),
          eq(tasks.projectId, projectId),
          eq(tasks.workspaceId, this.ctx.workspaceId)
        )
      )
      .limit(1)
    return Boolean(row)
  }
}
