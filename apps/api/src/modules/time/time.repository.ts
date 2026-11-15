import { Injectable } from "@nestjs/common"
import {
  clients,
  invoices,
  member,
  projects,
  tags,
  tasks,
  timeEntries,
  timeEntryTags,
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
  ne,
  or,
  type SQL,
  sql,
} from "drizzle-orm"

import { RequestContext } from "../../common/context/request-context.js"
import { InjectDb, type Database } from "../../core/database/database.module.js"

export type TimeEntryRow = typeof timeEntries.$inferSelect
export type TagRow = { id: string; name: string; color: string | null }
export type TimeEntryWithRefs = TimeEntryRow & {
  projectName: string | null
  clientName: string | null
  taskTitle: string | null
  memberName: string
  invoiceNumber: string | null
  tags: TagRow[]
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
    return (
      tx
        .select({
          entry: timeEntries,
          projectName: projects.name,
          clientName: clients.name,
          taskTitle: tasks.title,
          memberName: sql<string>`coalesce(${user.name}, ${timeEntries.memberName})`,
          invoiceNumber: invoices.number,
        })
        .from(timeEntries)
        .leftJoin(projects, eq(projects.id, timeEntries.projectId))
        .leftJoin(clients, eq(clients.id, projects.clientId))
        .leftJoin(tasks, eq(tasks.id, timeEntries.taskId))
        // Left joins: entries of members who left keep their name snapshot.
        .leftJoin(member, eq(member.id, timeEntries.memberId))
        .leftJoin(user, eq(user.id, member.userId))
        .leftJoin(invoices, eq(invoices.id, timeEntries.invoiceId))
    )
  }

  private static flatten(r: {
    entry: TimeEntryRow
    projectName: string | null
    clientName: string | null
    taskTitle: string | null
    memberName: string
    invoiceNumber: string | null
  }): Omit<TimeEntryWithRefs, "tags"> {
    return {
      ...r.entry,
      projectName: r.projectName,
      clientName: r.clientName,
      taskTitle: r.taskTitle,
      memberName: r.memberName,
      invoiceNumber: r.invoiceNumber,
    }
  }

  /** Attach each entry's tags (one query for the whole batch). */
  private async withTags(
    rows: Omit<TimeEntryWithRefs, "tags">[],
    tx: Database | Transaction = this.db
  ): Promise<TimeEntryWithRefs[]> {
    if (rows.length === 0) return []
    const links = await tx
      .select({
        entryId: timeEntryTags.entryId,
        id: tags.id,
        name: tags.name,
        color: tags.color,
      })
      .from(timeEntryTags)
      .innerJoin(tags, eq(tags.id, timeEntryTags.tagId))
      .where(
        inArray(
          timeEntryTags.entryId,
          rows.map((r) => r.id)
        )
      )
      .orderBy(asc(sql`lower(${tags.name})`))
    const byEntry = new Map<string, TagRow[]>()
    for (const { entryId, ...tag } of links) {
      byEntry.set(entryId, [...(byEntry.get(entryId) ?? []), tag])
    }
    return rows.map((r) => ({ ...r, tags: byEntry.get(r.id) ?? [] }))
  }

  async list(opts: {
    from: string
    to: string
    projectId?: string
    tagId?: string
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
    if (opts.tagId)
      filters.push(
        sql`exists (select 1 from ${timeEntryTags} where ${timeEntryTags.entryId} = ${timeEntries.id} and ${timeEntryTags.tagId} = ${opts.tagId})`
      )
    if (opts.memberId) filters.push(eq(timeEntries.memberId, opts.memberId))
    if (opts.billable !== undefined)
      filters.push(eq(timeEntries.billable, opts.billable))
    if (opts.uninvoiced) filters.push(isNull(timeEntries.invoiceId))
    const rows = await this.select()
      .where(and(...filters))
      .orderBy(desc(timeEntries.entryDate), desc(timeEntries.startedAt))
      .limit(2000)
    return this.withTags(rows.map(TimeRepository.flatten))
  }

  async findById(
    id: string,
    tx: Database | Transaction = this.db
  ): Promise<TimeEntryWithRefs | null> {
    const [row] = await this.select(tx)
      .where(and(this.scope(), eq(timeEntries.id, id)))
      .limit(1)
    return row
      ? (await this.withTags([TimeRepository.flatten(row)], tx))[0]!
      : null
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
    return row
      ? (await this.withTags([TimeRepository.flatten(row)], tx))[0]!
      : null
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
      .then((rows) => this.withTags(rows.map(TimeRepository.flatten)))
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

  /** Display name of a workspace member (for the entry's name snapshot). */
  async memberName(memberId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ name: user.name })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(
        and(
          eq(member.id, memberId),
          eq(member.organizationId, this.ctx.workspaceId)
        )
      )
      .limit(1)
    return row?.name ?? null
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

  /** Entries by id, scoped to the workspace (for bulk actions). */
  async findMany(ids: string[]): Promise<TimeEntryWithRefs[]> {
    const rows = await this.select().where(
      and(this.scope(), inArray(timeEntries.id, ids))
    )
    return this.withTags(rows.map(TimeRepository.flatten))
  }

  async updateMany(
    tx: Database | Transaction,
    ids: string[],
    values: Partial<TimeValues>
  ) {
    if (ids.length === 0 || Object.keys(values).length === 0) return
    await tx
      .update(timeEntries)
      .set(values)
      .where(and(this.scope(), inArray(timeEntries.id, ids)))
  }

  async deleteMany(ids: string[]) {
    if (ids.length === 0) return
    await this.db
      .delete(timeEntries)
      .where(and(this.scope(), inArray(timeEntries.id, ids)))
  }

  /** Replace (or, with `add`, extend) the tags of entries. */
  async setTags(
    tx: Database | Transaction,
    entryIds: string[],
    tagIds: string[],
    mode: "replace" | "add" = "replace"
  ) {
    if (entryIds.length === 0) return
    if (mode === "replace")
      await tx
        .delete(timeEntryTags)
        .where(inArray(timeEntryTags.entryId, entryIds))
    if (tagIds.length === 0) return
    await tx
      .insert(timeEntryTags)
      .values(
        entryIds.flatMap((entryId) =>
          tagIds.map((tagId) => ({ entryId, tagId }))
        )
      )
      .onConflictDoNothing()
  }

  /** Recent own entries with a description, newest first (for autocomplete). */
  async recentWithDescription(memberId: string, q: string | undefined) {
    const filters: SQL[] = [
      this.scope(),
      eq(timeEntries.memberId, memberId),
      isNotNull(timeEntries.description),
      or(isNull(timeEntries.projectId), ne(projects.status, "archived"))!,
    ]
    if (q) {
      const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
      filters.push(
        or(
          sql`${timeEntries.description} ilike ${like}`,
          sql`${projects.name} ilike ${like}`
        )!
      )
    }
    const rows = await this.select()
      .where(and(...filters))
      .orderBy(desc(timeEntries.startedAt))
      .limit(200)
    return this.withTags(rows.map(TimeRepository.flatten))
  }

  // ── Tags ─────────────────────────────────────────────

  private tagScope(): SQL {
    return eq(tags.workspaceId, this.ctx.workspaceId)
  }

  listTags(): Promise<TagRow[]> {
    return this.db
      .select({ id: tags.id, name: tags.name, color: tags.color })
      .from(tags)
      .where(this.tagScope())
      .orderBy(asc(sql`lower(${tags.name})`))
  }

  async findTag(id: string): Promise<TagRow | null> {
    const [row] = await this.db
      .select({ id: tags.id, name: tags.name, color: tags.color })
      .from(tags)
      .where(and(this.tagScope(), eq(tags.id, id)))
      .limit(1)
    return row ?? null
  }

  /** How many of `ids` are tags of this workspace. */
  async countTags(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0
    const [row] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(tags)
      .where(and(this.tagScope(), inArray(tags.id, ids)))
    return row?.n ?? 0
  }

  async insertTag(values: { name: string; color: string | null }) {
    const [row] = await this.db
      .insert(tags)
      .values({ ...values, workspaceId: this.ctx.workspaceId })
      .returning({ id: tags.id, name: tags.name, color: tags.color })
    return row!
  }

  async updateTag(
    id: string,
    values: { name?: string; color?: string | null }
  ) {
    const [row] = await this.db
      .update(tags)
      .set(values)
      .where(and(this.tagScope(), eq(tags.id, id)))
      .returning({ id: tags.id, name: tags.name, color: tags.color })
    return row ?? null
  }

  async deleteTag(id: string) {
    await this.db.delete(tags).where(and(this.tagScope(), eq(tags.id, id)))
  }
}
