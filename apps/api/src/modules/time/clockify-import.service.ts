import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from "@nestjs/common"
import { type ClockifyImportResult, TAG_COLORS } from "@workspace/contracts"

import { RequestContext } from "../../common/context/request-context.js"
import { zonedToUtc } from "../../common/time-zone.js"
import { AuditService } from "../../iam/audit/audit.service.js"
import { ClientsService } from "../clients/clients.service.js"
import { ProjectsService } from "../projects/projects.service.js"
import { WorkspaceProfileService } from "../workspace/workspace-profile.service.js"
import {
  ClockifyFormatError,
  type DateFormat,
  parseClockifyCsv,
  rowHash,
} from "./clockify-csv.js"
import {
  TimesheetApprovalsService,
  weekOf,
} from "./timesheet-approvals.service.js"
import { TimeRepository, type TimeValues } from "./time.repository.js"

const MAX_ROWS = 50_000
const lower = (v: string | null) => (v ?? "").trim().toLowerCase()

/**
 * Import a Clockify "Detailed report" CSV. A dry run returns what would
 * happen; committing creates missing clients, projects, tasks and tags and
 * inserts the entries. Every row has a fingerprint, so importing the same
 * file again adds nothing. People are matched to members by email; anyone
 * else's time is assigned to the importer.
 */
@Injectable()
export class ClockifyImportService {
  constructor(
    private readonly repo: TimeRepository,
    private readonly clients: ClientsService,
    private readonly projects: ProjectsService,
    private readonly profile: WorkspaceProfileService,
    private readonly ctx: RequestContext,
    private readonly audit: AuditService,
    private readonly approvals: TimesheetApprovalsService
  ) {}

  private can(p: string) {
    return this.ctx.permissions.has(p as never)
  }

  async import(
    file: { filename: string; text: string },
    opts: { dryRun: boolean; dateFormat: DateFormat | "auto" }
  ): Promise<ClockifyImportResult> {
    if (!this.can("time.manage"))
      throw new ForbiddenException("Importing time needs time.manage")

    let parsed: ReturnType<typeof parseClockifyCsv>
    try {
      parsed = parseClockifyCsv(file.text, opts.dateFormat)
    } catch (e) {
      if (e instanceof ClockifyFormatError)
        throw new BadRequestException({
          message: e.message,
          code: "invalid_csv",
        })
      throw e
    }
    if (parsed.rows.length > MAX_ROWS)
      throw new BadRequestException({
        message: `Import at most ${MAX_ROWS.toLocaleString("en")} entries at a time; export a shorter date range`,
        code: "too_many_rows",
      })

    const { timezone } = await this.profile.get()
    const lookups = await this.repo.importLookups()
    const membersByEmail = new Map(
      lookups.members.map((m) => [m.email.toLowerCase(), m])
    )
    const me = lookups.members.find((m) => m.id === this.ctx.memberId)!

    const invalid = [...parsed.invalid]
    type Prepared = {
      row: (typeof parsed.rows)[number]
      startedAt: Date
      endedAt: Date
      seconds: number
      memberId: string
      memberName: string
      hash: string
    }
    const prepared: Prepared[] = []
    const people = new Map<
      string,
      { name: string; email: string | null; matched: boolean; entries: number }
    >()
    const seen = new Set<string>()
    let duplicates = 0

    for (const row of parsed.rows) {
      const startedAt = zonedToUtc(row.startDate, row.startTime, timezone)
      const endedAt = zonedToUtc(row.endDate, row.endTime, timezone)
      const seconds = Math.round(
        (endedAt.getTime() - startedAt.getTime()) / 1000
      )
      if (seconds <= 0) {
        invalid.push({ line: row.line, message: "End is not after start" })
        continue
      }
      if (seconds > 24 * 3600) {
        invalid.push({
          line: row.line,
          message: "Entries can't be longer than 24 hours",
        })
        continue
      }
      const match = row.email ? membersByEmail.get(row.email) : undefined
      const who = row.email ?? lower(row.user)
      const hash = rowHash({
        who,
        startedAt,
        endedAt,
        description: row.description,
        project: row.project,
        client: row.client,
        task: row.task,
      })
      if (seen.has(hash)) {
        duplicates++
        continue
      }
      seen.add(hash)
      const personKey = who || "(unknown)"
      const person = people.get(personKey) ?? {
        name: row.user ?? row.email ?? "Unknown",
        email: row.email,
        matched: Boolean(match),
        entries: 0,
      }
      person.entries++
      people.set(personKey, person)
      prepared.push({
        row,
        startedAt,
        endedAt,
        seconds,
        memberId: match?.id ?? me.id,
        memberName: match?.name ?? me.name,
        hash,
      })
    }

    const existing = await this.repo.existingHashes(prepared.map((p) => p.hash))
    duplicates += existing.size
    const fresh = prepared.filter((p) => !existing.has(p.hash))
    // Weeks already submitted or approved for approval can't take new time.
    const dates = fresh.map((p) => p.row.startDate).sort()
    const locked = await this.approvals.lockedWeeks(
      [...new Set(fresh.map((p) => p.memberId))],
      dates[0] ?? "1970-01-01",
      dates[dates.length - 1] ?? "1970-01-01"
    )
    const toImport = fresh.filter((p) => {
      if (!locked.has(`${p.memberId}|${weekOf(p.row.startDate)}`)) return true
      invalid.push({
        line: p.row.line,
        message: "That week's timesheet is submitted or approved",
      })
      return false
    })

    // ── Resolve names → existing records, or plan to create them.
    const clientIdByName = new Map(
      lookups.clients.map((c) => [lower(c.name), c.id])
    )
    const projectKey = (name: string, clientId: string | null) =>
      `${lower(name)}|${clientId ?? ""}`
    const projectByKey = new Map(
      lookups.projects.map((p) => [projectKey(p.name, p.clientId), p.id])
    )
    const taskByKey = new Map(
      lookups.tasks.map((t) => [`${t.projectId}|${lower(t.title)}`, t.id])
    )
    const tagIdByName = new Map(lookups.tags.map((t) => [lower(t.name), t.id]))

    const newClients = new Map<string, string>()
    const newProjects = new Map<
      string,
      { name: string; clientName: string | null }
    >()
    const newTasks = new Set<string>()
    const newTags = new Map<string, string>()
    for (const { row } of toImport) {
      if (row.client && !clientIdByName.has(lower(row.client)))
        newClients.set(lower(row.client), row.client)
      if (row.project) {
        const cid = row.client
          ? (clientIdByName.get(lower(row.client)) ?? null)
          : null
        const known = projectByKey.has(projectKey(row.project, cid))
        const k = `${lower(row.project)}|${lower(row.client)}`
        if (!known)
          newProjects.set(k, { name: row.project, clientName: row.client })
        if (row.task) {
          const pid = known
            ? projectByKey.get(projectKey(row.project, cid))
            : null
          if (!pid || !taskByKey.has(`${pid}|${lower(row.task)}`))
            newTasks.add(`${k}|${lower(row.task)}`)
        }
      }
      for (const t of row.tags)
        if (!tagIdByName.has(lower(t))) newTags.set(lower(t), t)
    }

    const result: ClockifyImportResult = {
      dryRun: opts.dryRun,
      batchId: null,
      rows: parsed.rows.length + parsed.invalid.length,
      imported: toImport.length,
      duplicates,
      invalid: invalid.sort((a, b) => a.line - b.line).slice(0, 100),
      totalSeconds: toImport.reduce((s, p) => s + p.seconds, 0),
      dateFormat: parsed.dateFormat,
      newClients: [...newClients.values()].sort(),
      newProjects: [...newProjects.values()].sort((a, b) =>
        a.name.localeCompare(b.name)
      ),
      newTasks: newTasks.size,
      newTags: [...newTags.values()].sort(),
      members: [...people.values()].sort((a, b) => b.entries - a.entries),
    }
    if (opts.dryRun || toImport.length === 0) return result

    // ── Commit: create what's missing (through the normal services, so plan
    // limits and audit apply), then insert the entries in one transaction.
    const missing = [
      newClients.size && !this.can("client.create") && "client.create",
      newProjects.size && !this.can("project.create") && "project.create",
      newTasks.size && !this.can("project.update") && "project.update",
    ].filter(Boolean)
    if (missing.length)
      throw new ForbiddenException(
        `This import creates records that need ${missing.join(", ")}`
      )

    for (const [k, name] of newClients)
      clientIdByName.set(
        k,
        (await this.clients.create({ type: "company", name } as never)).id
      )
    const projectIdFor = async (name: string, clientName: string | null) => {
      const cid = clientName ? clientIdByName.get(lower(clientName))! : null
      const key = projectKey(name, cid)
      let id = projectByKey.get(key)
      if (!id) {
        id = (
          await this.projects.create({ name, clientId: cid, billing: "hourly" })
        ).id
        projectByKey.set(key, id)
      }
      return id
    }
    const taskIdFor = async (projectId: string, title: string) => {
      const key = `${projectId}|${lower(title)}`
      let id = taskByKey.get(key)
      if (!id) {
        id = (
          await this.projects.createTask(projectId, { title, status: "done" })
        ).id
        taskByKey.set(key, id)
      }
      return id
    }
    for (const [k, name] of newTags) {
      const created = await this.repo.insertTagIn(this.repo.database, {
        name,
        color: TAG_COLORS[(tagIdByName.size + 1) % TAG_COLORS.length]!,
      })
      if (created) tagIdByName.set(k, created.id)
    }
    if ([...newTags.keys()].some((k) => !tagIdByName.has(k))) {
      // Created concurrently by someone else: pick those up.
      for (const t of await this.repo.listTags())
        tagIdByName.set(lower(t.name), t.id)
    }

    const values: (TimeValues & { tagIds: string[] })[] = []
    for (const p of toImport) {
      const projectId = p.row.project
        ? await projectIdFor(p.row.project, p.row.client)
        : null
      const taskId =
        projectId && p.row.task ? await taskIdFor(projectId, p.row.task) : null
      values.push({
        projectId,
        taskId,
        memberId: p.memberId,
        memberName: p.memberName,
        description: p.row.description,
        entryDate: p.row.startDate,
        startedAt: p.startedAt,
        endedAt: p.endedAt,
        durationSeconds: p.seconds,
        billable: p.row.billable,
        externalHash: p.hash,
        tagIds: p.row.tags
          .map((t) => tagIdByName.get(lower(t)))
          .filter((x): x is string => Boolean(x)),
      })
    }

    const { batchId, inserted } = await this.repo.database.transaction(
      async (tx) => {
        const batchId = await this.repo.createImportBatch(tx, {
          filename: file.filename.slice(0, 255),
          createdByMemberId: this.ctx.memberId,
        })
        const inserted = await this.repo.insertImported(
          tx,
          values.map((v) => ({ ...v, importBatchId: batchId }))
        )
        await this.repo.finishImportBatch(tx, batchId, {
          importedCount: inserted,
          duplicateCount: duplicates + (values.length - inserted),
          invalidCount: invalid.length,
        })
        return { batchId, inserted }
      }
    )
    await this.audit.record("time.imported", {
      resourceType: "time_import_batch",
      resourceId: batchId,
      metadata: { source: "clockify", entries: inserted },
    })
    return {
      ...result,
      batchId,
      imported: inserted,
      duplicates: duplicates + (values.length - inserted),
    }
  }
}
