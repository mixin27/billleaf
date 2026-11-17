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
  timeImportBatches,
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

import type { TimeRounding } from "@workspace/contracts"

import { RequestContext } from "../../common/context/request-context.js"
import { offsetOf, orderBy, type PageArgs } from "../../common/pagination.js"
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
/** Filters shared by the reports (ids already narrowed by permission). */
export interface ReportFilter {
  from: string
  to: string
  memberIds?: string[]
  projectIds?: string[]
  clientIds?: string[]
  tagIds?: string[]
  withoutProject?: boolean
  billable?: boolean
  q?: string
}

/**
 * SQL for one entry's seconds after the workspace's rounding rule (see
 * `roundSeconds` in contracts — the same math, for sums in the database).
 */
export function roundedSecondsSql(
  col: SQL | typeof timeEntries.durationSeconds,
  rule: TimeRounding
): SQL {
  if (rule.mode === "off" || rule.minutes <= 0) return sql`${col}`
  const step = rule.minutes * 60
  if (rule.mode === "nearest")
    return sql`(floor(${col}::numeric / ${step} + 0.5) * ${step})::int`
  const fn = rule.mode === "up" ? sql.raw("ceil") : sql.raw("floor")
  return sql`(${fn}(${col}::numeric / ${step}) * ${step})::int`
}

const OFF: TimeRounding = { mode: "off", minutes: 0 }

const escapeLike = (v: string) => v.replace(/[\\%_]/g, (c) => `\\${c}`)
const chunks = <T>(xs: T[], n: number) =>
  Array.from({ length: Math.ceil(xs.length / n) }, (_, i) =>
    xs.slice(i * n, i * n + n)
  )

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
  /** Billable, finished, uninvoiced entries (only `onlyIf`-matching ones, e.g. approved). */
  async unbilled(projectId: string, ids?: string[], onlyIf?: SQL | null) {
    const filters: SQL[] = [
      this.scope(),
      eq(timeEntries.projectId, projectId),
      eq(timeEntries.billable, true),
      isNull(timeEntries.invoiceId),
      isNotNull(timeEntries.endedAt),
    ]
    if (ids) filters.push(inArray(timeEntries.id, ids))
    if (onlyIf) filters.push(onlyIf)
    return this.select()
      .where(and(...filters))
      .orderBy(asc(timeEntries.entryDate))
      .then((rows) => this.withTags(rows.map(TimeRepository.flatten)))
  }

  /** Unbilled billable seconds that don't meet `invoiceable` (0 without it). */
  async unapprovedSeconds(projectId: string, invoiceable: SQL | null) {
    if (!invoiceable) return 0
    const [row] = await this.db
      .select({
        s: sql<number>`coalesce(sum(${timeEntries.durationSeconds}), 0)::int`,
      })
      .from(timeEntries)
      .where(
        and(
          this.scope(),
          eq(timeEntries.projectId, projectId),
          eq(timeEntries.billable, true),
          isNull(timeEntries.invoiceId),
          isNotNull(timeEntries.endedAt),
          sql`not (${invoiceable})`
        )
      )
    return row?.s ?? 0
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

  /** Record the hourly rate claimed entries were invoiced at. */
  async setBilledRate(ids: string[], invoiceId: string, rate: number) {
    await this.db
      .update(timeEntries)
      .set({ billedRate: rate })
      .where(
        and(
          this.scope(),
          inArray(timeEntries.id, ids),
          eq(timeEntries.invoiceId, invoiceId)
        )
      )
  }

  /**
   * Finished time of projects, summed per (project, task, member, billable,
   * invoiced, billed rate): enough to price it with any rate book.
   */
  /** Per-entry sums; `billedSeconds` applies the rounding rule (amounts). */
  async usageRows(projectIds: string[], rule: TimeRounding = OFF) {
    if (projectIds.length === 0) return []
    const rows = await this.db
      .select({
        projectId: timeEntries.projectId,
        taskRate: tasks.hourlyRate,
        memberId: timeEntries.memberId,
        billable: timeEntries.billable,
        invoiced: sql<boolean>`${timeEntries.invoiceId} is not null`,
        billedRate: timeEntries.billedRate,
        seconds: sql<string>`sum(${timeEntries.durationSeconds})`,
        billedSeconds: sql<string>`sum(${roundedSecondsSql(timeEntries.durationSeconds, rule)})`,
      })
      .from(timeEntries)
      .leftJoin(tasks, eq(tasks.id, timeEntries.taskId))
      .where(
        and(
          this.scope(),
          inArray(timeEntries.projectId, projectIds),
          isNotNull(timeEntries.endedAt)
        )
      )
      .groupBy(
        timeEntries.projectId,
        tasks.hourlyRate,
        timeEntries.memberId,
        timeEntries.billable,
        sql`${timeEntries.invoiceId} is not null`,
        timeEntries.billedRate
      )
    return rows.map((r) => ({
      ...r,
      projectId: r.projectId!,
      seconds: Number(r.seconds ?? 0),
      billedSeconds: Number(r.billedSeconds ?? 0),
    }))
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

  // ── Reports ──────────────────────────────────────────

  /** WHERE for report queries (needs `projects` joined for client/q filters). */
  private reportWhere(f: ReportFilter): SQL {
    const w: SQL[] = [
      this.scope(),
      gte(timeEntries.entryDate, f.from),
      lte(timeEntries.entryDate, f.to),
      isNotNull(timeEntries.endedAt),
    ]
    if (f.memberIds) w.push(inArray(timeEntries.memberId, f.memberIds))
    const projectOr: SQL[] = []
    if (f.projectIds?.length)
      projectOr.push(inArray(timeEntries.projectId, f.projectIds))
    if (f.withoutProject) projectOr.push(isNull(timeEntries.projectId))
    if (projectOr.length) w.push(or(...projectOr)!)
    if (f.clientIds?.length) w.push(inArray(projects.clientId, f.clientIds))
    if (f.tagIds?.length)
      w.push(
        sql`exists (select 1 from ${timeEntryTags} where ${timeEntryTags.entryId} = ${timeEntries.id} and ${inArray(timeEntryTags.tagId, f.tagIds)})`
      )
    if (f.billable !== undefined) w.push(eq(timeEntries.billable, f.billable))
    if (f.q) {
      const like = `%${escapeLike(f.q)}%`
      w.push(
        or(
          sql`${timeEntries.description} ilike ${like}`,
          sql`${projects.name} ilike ${like}`
        )!
      )
    }
    return and(...w)!
  }

  /** Lean rows for aggregation (summary/weekly reports), capped. */
  async reportRows(f: ReportFilter, limit = 100_000) {
    return this.db
      .select({
        id: timeEntries.id,
        entryDate: timeEntries.entryDate,
        seconds: timeEntries.durationSeconds,
        billable: timeEntries.billable,
        projectId: timeEntries.projectId,
        projectName: projects.name,
        projectBilling: projects.billing,
        hourlyRate: projects.hourlyRate,
        taskRate: tasks.hourlyRate,
        invoiced: sql<boolean>`${timeEntries.invoiceId} is not null`,
        billedRate: timeEntries.billedRate,
        currency: projects.currency,
        clientId: projects.clientId,
        clientName: clients.name,
        taskId: timeEntries.taskId,
        taskTitle: tasks.title,
        memberId: timeEntries.memberId,
        memberName: sql<string>`coalesce(${user.name}, ${timeEntries.memberName})`,
      })
      .from(timeEntries)
      .leftJoin(projects, eq(projects.id, timeEntries.projectId))
      .leftJoin(clients, eq(clients.id, projects.clientId))
      .leftJoin(tasks, eq(tasks.id, timeEntries.taskId))
      .leftJoin(member, eq(member.id, timeEntries.memberId))
      .leftJoin(user, eq(user.id, member.userId))
      .where(this.reportWhere(f))
      .limit(limit)
  }

  /** Tags of many entries (chunked to keep parameter lists small). */
  async tagLinks(entryIds: string[]) {
    const out: {
      entryId: string
      id: string
      name: string
      color: string | null
    }[] = []
    for (const ids of chunks(entryIds, 5000)) {
      out.push(
        ...(await this.db
          .select({
            entryId: timeEntryTags.entryId,
            id: tags.id,
            name: tags.name,
            color: tags.color,
          })
          .from(timeEntryTags)
          .innerJoin(tags, eq(tags.id, timeEntryTags.tagId))
          .where(inArray(timeEntryTags.entryId, ids)))
      )
    }
    return out
  }

  /** One page of the detailed report, plus totals for the whole filter. */
  async detailed(
    f: ReportFilter,
    page: PageArgs | null,
    rule: TimeRounding = OFF
  ) {
    const dur = roundedSecondsSql(timeEntries.durationSeconds, rule)
    const where = this.reportWhere(f)
    const memberSort = sql`lower(coalesce(${user.name}, ${timeEntries.memberName}))`
    let q = this.select()
      .where(where)
      .orderBy(
        ...orderBy(
          page?.sort,
          {
            date: timeEntries.startedAt,
            duration: timeEntries.durationSeconds,
            description: sql`lower(${timeEntries.description})`,
            project: sql`lower(${projects.name})`,
            member: memberSort,
          },
          timeEntries.id,
          [sql`${timeEntries.startedAt} desc`, sql`${timeEntries.id} desc`]
        )
      )
      .$dynamic()
    q = page
      ? q.limit(page.pageSize).offset(offsetOf(page.page, page.pageSize))
      : q.limit(50_000)
    const [rows, [totals]] = await Promise.all([
      q,
      this.db
        .select({
          total: sql<number>`count(*)::int`,
          seconds: sql<string>`coalesce(sum(${dur}), 0)`,
          billable: sql<string>`coalesce(sum(${dur}) filter (where ${timeEntries.billable}), 0)`,
        })
        .from(timeEntries)
        .leftJoin(projects, eq(projects.id, timeEntries.projectId))
        .where(where),
    ])
    return {
      items: await this.withTags(rows.map(TimeRepository.flatten)),
      total: totals?.total ?? 0,
      seconds: Number(totals?.seconds ?? 0),
      billableSeconds: Number(totals?.billable ?? 0),
    }
  }

  // ── Timesheet ────────────────────────────────────────

  /** A member's finished entries in one timesheet cell, newest first. */
  async cellEntries(
    tx: Database | Transaction,
    memberId: string,
    date: string,
    projectId: string | null,
    taskId: string | null
  ) {
    return tx
      .select({
        id: timeEntries.id,
        startedAt: timeEntries.startedAt,
        endedAt: timeEntries.endedAt,
        durationSeconds: timeEntries.durationSeconds,
        invoiceId: timeEntries.invoiceId,
      })
      .from(timeEntries)
      .where(
        and(
          this.scope(),
          eq(timeEntries.memberId, memberId),
          eq(timeEntries.entryDate, date),
          isNotNull(timeEntries.endedAt),
          projectId
            ? eq(timeEntries.projectId, projectId)
            : isNull(timeEntries.projectId),
          taskId ? eq(timeEntries.taskId, taskId) : isNull(timeEntries.taskId)
        )
      )
      .orderBy(desc(timeEntries.startedAt))
      .for("update")
  }

  async deleteIn(tx: Database | Transaction, ids: string[]) {
    if (ids.length)
      await tx
        .delete(timeEntries)
        .where(and(this.scope(), inArray(timeEntries.id, ids)))
  }

  // ── Import ───────────────────────────────────────────

  /** Everything an import matches against (workspaces are small). */
  async importLookups() {
    const ws = this.ctx.workspaceId
    const [clientRows, projectRows, taskRows, tagRows, memberRows] =
      await Promise.all([
        this.db
          .select({ id: clients.id, name: clients.name })
          .from(clients)
          .where(and(eq(clients.workspaceId, ws), isNull(clients.deletedAt))),
        this.db
          .select({
            id: projects.id,
            name: projects.name,
            clientId: projects.clientId,
            billing: projects.billing,
          })
          .from(projects)
          .where(eq(projects.workspaceId, ws)),
        this.db
          .select({
            id: tasks.id,
            projectId: tasks.projectId,
            title: tasks.title,
          })
          .from(tasks)
          .where(eq(tasks.workspaceId, ws)),
        this.listTags(),
        this.db
          .select({ id: member.id, email: user.email, name: user.name })
          .from(member)
          .innerJoin(user, eq(user.id, member.userId))
          .where(eq(member.organizationId, ws)),
      ])
    return {
      clients: clientRows,
      projects: projectRows,
      tasks: taskRows,
      tags: tagRows,
      members: memberRows,
    }
  }

  /** Which of these fingerprints were imported before. */
  async existingHashes(hashes: string[]): Promise<Set<string>> {
    const found = new Set<string>()
    for (const part of chunks(hashes, 5000)) {
      const rows = await this.db
        .select({ h: timeEntries.externalHash })
        .from(timeEntries)
        .where(and(this.scope(), inArray(timeEntries.externalHash, part)))
      for (const r of rows) found.add(r.h!)
    }
    return found
  }

  async createImportBatch(
    tx: Database | Transaction,
    values: { filename: string; createdByMemberId: string }
  ) {
    const [row] = await tx
      .insert(timeImportBatches)
      .values({
        ...values,
        source: "clockify",
        workspaceId: this.ctx.workspaceId,
      })
      .returning({ id: timeImportBatches.id })
    return row!.id
  }

  async finishImportBatch(
    tx: Database | Transaction,
    id: string,
    counts: {
      importedCount: number
      duplicateCount: number
      invalidCount: number
    }
  ) {
    await tx
      .update(timeImportBatches)
      .set(counts)
      .where(
        and(
          eq(timeImportBatches.id, id),
          eq(timeImportBatches.workspaceId, this.ctx.workspaceId)
        )
      )
  }

  /** Insert imported entries; rows whose fingerprint exists are skipped. */
  async insertImported(
    tx: Database | Transaction,
    values: (TimeValues & { tagIds: string[] })[]
  ): Promise<number> {
    let inserted = 0
    for (const part of chunks(values, 500)) {
      const rows = await tx
        .insert(timeEntries)
        .values(
          part.map(({ tagIds: _t, ...v }) => ({
            ...v,
            workspaceId: this.ctx.workspaceId,
          }))
        )
        .onConflictDoNothing()
        .returning({ id: timeEntries.id, hash: timeEntries.externalHash })
      inserted += rows.length
      const tagsByHash = new Map(part.map((v) => [v.externalHash, v.tagIds]))
      const links = rows.flatMap((r) =>
        (tagsByHash.get(r.hash) ?? []).map((tagId) => ({
          entryId: r.id,
          tagId,
        }))
      )
      if (links.length)
        await tx.insert(timeEntryTags).values(links).onConflictDoNothing()
    }
    return inserted
  }

  async insertTagIn(
    tx: Database | Transaction,
    values: { name: string; color: string | null }
  ) {
    const [row] = await tx
      .insert(tags)
      .values({ ...values, workspaceId: this.ctx.workspaceId })
      .onConflictDoNothing()
      .returning({ id: tags.id, name: tags.name, color: tags.color })
    return row ?? null
  }
}
