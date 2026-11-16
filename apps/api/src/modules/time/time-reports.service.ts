import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from "@nestjs/common"
import {
  amountForSeconds,
  type DetailedReport,
  fromMinorUnits,
  type ReportGroup,
  type ReportGroupRow,
  secondsToHours,
  type SummaryReport,
  type Tag,
  type TimeEntry,
} from "@workspace/contracts"

import { RequestContext } from "../../common/context/request-context.js"
import { localParts } from "../../common/time-zone.js"
import { addDays } from "../documents/party-snapshot.js"
import { RateBook, RatesService } from "../rates/rates.service.js"
import { WorkspaceProfileService } from "../workspace/workspace-profile.service.js"
import {
  type ReportFilter,
  TimeRepository,
  type TimeEntryWithRefs,
} from "./time.repository.js"

export interface ReportQuery {
  from: string
  to: string
  memberId?: string[]
  projectId?: string[]
  clientId?: string[]
  tagId?: string[]
  withoutProject?: "true"
  billable?: "true" | "false"
  q?: string
}

const MAX_DAYS = 366

/**
 * Time reports (Clockify's Summary / Detailed / Weekly). Without `time.read`
 * a member only ever sees their own time. Amounts are billable hours × the
 * resolved hourly rate (invoiced time at its invoiced rate), per currency;
 * costs (tracked hours × member cost rates) need `rate.read`.
 */
@Injectable()
export class TimeReportsService {
  constructor(
    private readonly repo: TimeRepository,
    private readonly profile: WorkspaceProfileService,
    private readonly ctx: RequestContext,
    private readonly rates: RatesService
  ) {}

  /** Billable rate and cost rate of one report row. */
  private price(r: Row, book: RateBook, withCost: boolean) {
    const rate =
      !r.billable || !r.currency || r.projectBilling !== "hourly"
        ? null
        : r.invoiced && r.billedRate !== null
          ? r.billedRate
          : book.rate({
              billing: r.projectBilling,
              currency: r.currency,
              projectRate: r.hourlyRate,
              taskRate: r.taskRate,
              memberId: r.memberId,
            })
    const cost =
      withCost && r.currency ? book.cost(r.memberId, r.currency) : null
    return {
      rate: rate === null ? null : { currency: r.currency!, rate },
      cost: cost === null ? null : { currency: r.currency!, rate: cost },
    }
  }

  private filter(q: ReportQuery): ReportFilter {
    if (q.from > q.to)
      throw new BadRequestException("`from` must be on or before `to`")
    if (dayCount(q.from, q.to) > MAX_DAYS)
      throw new BadRequestException("Reports cover at most one year")
    let memberIds = q.memberId
    if (!this.ctx.permissions.has("time.read")) {
      if (memberIds?.some((id) => id !== this.ctx.memberId))
        throw new ForbiddenException("You can only report on your own time")
      memberIds = [this.ctx.memberId]
    }
    return {
      from: q.from,
      to: q.to,
      memberIds,
      projectIds: q.projectId,
      clientIds: q.clientId,
      tagIds: q.tagId,
      withoutProject: q.withoutProject === "true",
      billable: q.billable === undefined ? undefined : q.billable === "true",
      q: q.q || undefined,
    }
  }

  async summary(
    q: ReportQuery & { groupBy?: ReportGroup }
  ): Promise<SummaryReport> {
    const f = this.filter(q)
    const groupBy = q.groupBy ?? "project"
    const days = Array.from({ length: dayCount(f.from, f.to) }, (_, i) =>
      addDays(f.from, i)
    )
    const dayIndex = new Map(days.map((d, i) => [d, i]))
    const [rows, book] = await Promise.all([
      this.repo.reportRows(f),
      this.rates.book(),
    ])
    const withCost = this.ctx.permissions.has("rate.read")
    const tagsByEntry = new Map<string, Tag[]>()
    if (groupBy === "tag") {
      for (const { entryId, ...t } of await this.repo.tagLinks(
        rows.map((r) => r.id)
      )) {
        tagsByEntry.set(entryId, [
          ...(tagsByEntry.get(entryId) ?? []),
          { ...t, color: (t.color as Tag["color"]) ?? null },
        ])
      }
    }

    const total = new Acc(days.length)
    const groups = new Map<string, { row: Acc; meta: GroupMeta }>()
    for (const r of rows) {
      const seconds = r.seconds ?? 0
      const i = dayIndex.get(r.entryDate) ?? 0
      const { rate, cost } = this.price(r, book, withCost)
      total.add(seconds, r.billable, i, rate, cost)
      for (const meta of groupMetas(groupBy, r, tagsByEntry.get(r.id))) {
        const k = String(meta.key)
        const g = groups.get(k) ?? { row: new Acc(days.length), meta }
        g.row.add(seconds, r.billable, i, rate, cost)
        groups.set(k, g)
      }
    }

    const groupRows: ReportGroupRow[] = [...groups.values()].map(
      ({ row, meta }) => ({
        key: meta.key,
        label: meta.label,
        detail: meta.detail,
        seconds: row.seconds,
        billableSeconds: row.billable,
        amounts: row.amounts(),
        costs: row.costs(),
        byDay: row.byDay,
      })
    )
    groupRows.sort((a, b) =>
      groupBy === "date"
        ? a.label.localeCompare(b.label)
        : b.seconds - a.seconds || a.label.localeCompare(b.label)
    )
    return {
      from: f.from,
      to: f.to,
      days,
      totalSeconds: total.seconds,
      billableSeconds: total.billable,
      amounts: total.amounts(),
      costs: total.costs(),
      byDay: days.map((date, i) => ({
        date,
        seconds: total.byDay[i]!,
        billableSeconds: total.byDayBillable[i]!,
      })),
      groups: groupRows,
    }
  }

  async detailed(
    q: ReportQuery & { page: number; pageSize: number; sort?: string }
  ): Promise<DetailedReport> {
    const r = await this.repo.detailed(this.filter(q), q)
    return {
      items: r.items.map((e) => this.toDto(e)),
      total: r.total,
      page: q.page,
      pageSize: q.pageSize,
      totalSeconds: r.seconds,
      billableSeconds: r.billableSeconds,
    }
  }

  /** Detailed report as CSV (all matching rows, up to 50,000). */
  async detailedCsv(q: ReportQuery & { sort?: string }): Promise<string> {
    const { timezone } = await this.profile.get()
    const r = await this.repo.detailed(this.filter(q), null)
    const [rates, book] = await Promise.all([
      this.repo.reportRows(this.filter(q), 50_000),
      this.rates.book(),
    ])
    const rateById = new Map(rates.map((x) => [x.id, x]))
    const withCost = this.ctx.permissions.has("rate.read")
    const header = [
      "Date",
      "Start Time",
      "End Date",
      "End Time",
      "Duration (h)",
      "Duration (decimal)",
      "Member",
      "Client",
      "Project",
      "Task",
      "Description",
      "Tags",
      "Billable",
      "Hourly Rate",
      "Amount",
      ...(withCost ? ["Cost Rate", "Cost"] : []),
      "Currency",
      "Invoice",
    ]
    const lines = [header]
    for (const e of r.items) {
      const start = localParts(e.startedAt, timezone)
      const end = localParts(e.endedAt!, timezone)
      const seconds = e.durationSeconds ?? 0
      const p = rateById.get(e.id)
      const priced = p ? this.price(p, book, withCost) : null
      const hourly = priced?.rate?.rate ?? null
      const cost = priced?.cost?.rate ?? null
      const cur = p?.currency ?? ""
      const fmt = (v: number) => fromMinorUnits(v, cur)
      lines.push([
        e.entryDate,
        start.time,
        end.date,
        end.time,
        hms(seconds),
        secondsToHours(seconds).toFixed(2),
        e.memberName,
        e.clientName ?? "",
        e.projectName ?? "",
        e.taskTitle ?? "",
        e.description ?? "",
        e.tags.map((t) => t.name).join(", "),
        e.billable ? "Yes" : "No",
        hourly !== null ? fmt(hourly) : "",
        hourly !== null ? fmt(amountForSeconds(seconds, hourly)) : "",
        ...(withCost
          ? [
              cost !== null ? fmt(cost) : "",
              cost !== null ? fmt(amountForSeconds(seconds, cost)) : "",
            ]
          : []),
        cur,
        e.invoiceNumber ?? "",
      ])
    }
    // BOM so Excel opens UTF-8 correctly.
    return "﻿" + lines.map((l) => l.map(csvCell).join(",")).join("\r\n")
  }

  private toDto(e: TimeEntryWithRefs): TimeEntry {
    return {
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
      tags: e.tags.map((t) => ({
        id: t.id,
        name: t.name,
        color: (t.color as Tag["color"]) ?? null,
      })),
      invoiceId: e.invoiceId,
      invoiceNumber: e.invoiceNumber,
      isRunning: e.endedAt === null,
      isMine: e.memberId === this.ctx.memberId,
    }
  }
}

type GroupMeta = { key: string | null; label: string; detail: string | null }

type Row = Awaited<ReturnType<TimeRepository["reportRows"]>>[number]

function groupMetas(by: ReportGroup, r: Row, tags?: Tag[]): GroupMeta[] {
  switch (by) {
    case "project":
      return [
        {
          key: r.projectId,
          label: r.projectName ?? "No project",
          detail: r.clientName,
        },
      ]
    case "client":
      return [
        { key: r.clientId, label: r.clientName ?? "No client", detail: null },
      ]
    case "member":
      return [{ key: r.memberId, label: r.memberName, detail: null }]
    case "task":
      return [
        {
          key: r.taskId ?? (r.projectId ? `none:${r.projectId}` : null),
          label: r.taskTitle ?? "No task",
          detail: r.projectName,
        },
      ]
    case "date":
      return [{ key: r.entryDate, label: r.entryDate, detail: null }]
    case "tag":
      // An entry with several tags counts towards each of them.
      return tags?.length
        ? tags.map((t) => ({ key: t.id, label: t.name, detail: null }))
        : [{ key: null, label: "No tag", detail: null }]
  }
}

/** Running totals for one report row. */
class Acc {
  seconds = 0
  billable = 0
  byDay: number[]
  byDayBillable: number[]
  private billed = new Map<string, Map<number, number>>()
  private costed = new Map<string, Map<number, number>>()

  constructor(days: number) {
    this.byDay = new Array(days).fill(0)
    this.byDayBillable = new Array(days).fill(0)
  }

  add(
    seconds: number,
    billable: boolean,
    day: number,
    rate: { currency: string; rate: number } | null,
    cost: { currency: string; rate: number } | null = null
  ) {
    this.seconds += seconds
    this.byDay[day]! += seconds
    if (billable) {
      this.billable += seconds
      this.byDayBillable[day]! += seconds
    }
    if (rate) tally(this.billed, rate, seconds)
    if (cost) tally(this.costed, cost, seconds)
  }

  amounts() {
    return total(this.billed)
  }

  costs() {
    return total(this.costed)
  }
}

type Tally = Map<string, Map<number, number>>

function tally(
  t: Tally,
  r: { currency: string; rate: number },
  seconds: number
) {
  const byRate = t.get(r.currency) ?? new Map<number, number>()
  byRate.set(r.rate, (byRate.get(r.rate) ?? 0) + seconds)
  t.set(r.currency, byRate)
}

/** Seconds per (currency, rate) → money per currency, largest first. */
function total(t: Tally) {
  return [...t.entries()]
    .map(([currency, byRate]) => ({
      currency,
      amount: [...byRate.entries()].reduce(
        (s, [rate, sec]) => s + amountForSeconds(sec, rate),
        0
      ),
    }))
    .sort((a, b) => b.amount - a.amount)
}

function dayCount(from: string, to: string) {
  return (
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      86_400_000 +
    1
  )
}

function hms(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

/** Quote when needed; neutralise spreadsheet formulas (CSV injection). */
export function csvCell(v: string) {
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}
