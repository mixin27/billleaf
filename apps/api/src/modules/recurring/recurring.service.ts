import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common"
import {
  type CreateRecurringInvoiceInput,
  documentTotals,
  nextOccurrence,
  type RecurringInvoice,
  type RecurringList,
  type RecurringStatus,
  type RecurringRunResult,
  type UpdateRecurringInvoiceInput,
} from "@workspace/contracts"

import { type PageArgs } from "../../common/pagination.js"
import { EntitlementsService } from "../../billing/entitlements.service.js"
import { AuditService } from "../../iam/audit/audit.service.js"
import { ClientsRepository } from "../clients/clients.repository.js"
import { addDays, todayIn } from "../documents/party-snapshot.js"
import { InvoicesRepository } from "../invoices/invoices.repository.js"
import { InvoicesService } from "../invoices/invoices.service.js"
import { WorkspaceProfileService } from "../workspace/workspace-profile.service.js"
import {
  RecurringRepository,
  type RecurringRow,
} from "./recurring.repository.js"

/** Max periods generated in one run (catch-up after downtime). */
const MAX_CATCH_UP = 12

const isUniqueViolation = (e: unknown) =>
  (e as { cause?: { code?: string } }).cause?.code === "23505" ||
  (e as { code?: string }).code === "23505"

export function toRecurringDto(r: RecurringRow): RecurringInvoice {
  return {
    id: r.id,
    clientId: r.clientId,
    clientName: r.clientName,
    title: r.title,
    currency: r.currency,
    lines: r.lines,
    total: documentTotals(r.lines).total,
    every: r.every,
    unit: r.unit,
    startDate: r.startDate,
    endDate: r.endDate,
    maxOccurrences: r.maxOccurrences,
    nextRunDate: r.nextRunDate,
    dueDays: r.dueDays,
    mode: r.mode,
    status: r.status,
    notes: r.notes,
    terms: r.terms,
    generatedCount: r.generatedCount,
    lastRunAt: r.lastRunAt?.toISOString() ?? null,
    lastError: r.lastError,
    createdAt: r.createdAt.toISOString(),
  }
}

/** Whether the schedule is finished after generating `count` invoices, given the next date. */
export function isFinished(
  r: { endDate: string | null; maxOccurrences: number | null },
  count: number,
  next: string
) {
  return (
    (r.maxOccurrences !== null && count >= r.maxOccurrences) ||
    (r.endDate !== null && next > r.endDate)
  )
}

@Injectable()
export class RecurringService {
  private readonly logger = new Logger(RecurringService.name)

  constructor(
    private readonly repo: RecurringRepository,
    private readonly invoices: InvoicesService,
    private readonly invoicesRepo: InvoicesRepository,
    private readonly clients: ClientsRepository,
    private readonly profile: WorkspaceProfileService,
    private readonly entitlements: EntitlementsService,
    private readonly audit: AuditService
  ) {}

  private async assertPlan() {
    await this.entitlements.assertFeature("recurringInvoices")
  }

  async list(
    query: PageArgs & { status?: RecurringStatus; q?: string }
  ): Promise<RecurringList> {
    const { items, total } = await this.repo.list(query)
    return {
      items: items.map(toRecurringDto),
      total,
      page: query.page,
      pageSize: query.pageSize,
    }
  }

  async get(id: string): Promise<RecurringInvoice> {
    return toRecurringDto(await this.require(id))
  }

  async history(id: string) {
    await this.require(id)
    return this.repo.generatedInvoices(id)
  }

  async create(input: CreateRecurringInvoiceInput): Promise<RecurringInvoice> {
    await this.assertPlan()
    const client = await this.clients.findById(input.clientId)
    if (!client || client.archivedAt)
      throw new BadRequestException("Choose an active client")
    const profile = await this.profile.get()
    const id = await this.repo.create({
      clientId: client.id,
      title: input.title ?? null,
      currency: input.currency ?? client.currency ?? profile.defaultCurrency,
      lines: (input.lines ?? []).map((l) => ({
        ...l,
        taxRateBps: l.taxRateBps ?? 0,
      })),
      every: input.every ?? 1,
      unit: input.unit ?? "month",
      startDate: input.startDate,
      anchorDay: Number(input.startDate.slice(8, 10)),
      endDate: input.endDate ?? null,
      maxOccurrences: input.maxOccurrences ?? null,
      nextRunDate: input.startDate,
      dueDays: input.dueDays ?? null,
      mode: input.mode ?? "draft",
      notes: input.notes ?? null,
      terms: input.terms ?? null,
    })
    await this.audit.record("recurring.created", {
      resourceType: "recurring_invoice",
      resourceId: id,
    })
    return this.get(id)
  }

  async update(
    id: string,
    input: UpdateRecurringInvoiceInput
  ): Promise<RecurringInvoice> {
    const r = await this.require(id)
    if (r.status === "ended" && input.status)
      throw new ConflictException("This schedule has ended")
    if (input.status === "active") await this.assertPlan()
    const values: Record<string, unknown> = { ...input }
    if (input.lines)
      values.lines = input.lines.map((l) => ({
        ...l,
        taxRateBps: l.taxRateBps ?? 0,
      }))
    if (input.status === "active") values.lastError = null
    await this.repo.update(id, values)
    return this.get(id)
  }

  async remove(id: string) {
    await this.require(id)
    await this.repo.delete(id) // generated invoices keep existing (recurring_id → null)
  }

  /** "Run now": generate the next scheduled period immediately. */
  async runNow(id: string): Promise<RecurringRunResult> {
    await this.assertPlan()
    const r = await this.require(id)
    if (r.status !== "active" || !r.nextRunDate)
      throw new ConflictException("Only active schedules can run")
    const result = await this.generatePeriod(r, r.nextRunDate)
    return { schedule: await this.get(id), ...result }
  }

  /** Generate every due period (worker entrypoint; runs inside the schedule's workspace context). */
  async generateDue(id: string): Promise<number> {
    let generated = 0
    for (let i = 0; i < MAX_CATCH_UP; i++) {
      const r = await this.repo.findById(id)
      if (!r || r.status !== "active" || !r.nextRunDate) break
      const today = todayIn((await this.profile.get()).timezone)
      if (r.nextRunDate > today) break
      if (!(await this.entitlements.hasFeature("recurringInvoices"))) {
        await this.repo.update(id, {
          status: "paused",
          lastError: "Your plan no longer includes recurring invoices",
        })
        break
      }
      await this.generatePeriod(r, r.nextRunDate)
      generated++
    }
    return generated
  }

  /**
   * Create (or find) the invoice for one period, optionally issue + email it,
   * then advance the schedule. Safe to retry: the (recurring_id, period)
   * unique key prevents duplicates and the advance is compare-and-set.
   */
  private async generatePeriod(r: RecurringRow, period: string) {
    let invoiceId: string
    let invoiceNumber: string | null = null
    let sent = false
    let lastError: string | null = null
    try {
      const inv = await this.invoices.create(
        {
          clientId: r.clientId,
          title: r.title,
          currency: r.currency,
          issueDate: period,
          dueDate: r.dueDays !== null ? addDays(period, r.dueDays) : undefined,
          notes: r.notes,
          terms: r.terms,
          lines: r.lines,
        },
        { recurringId: r.id, recurringPeriod: period }
      )
      invoiceId = inv.id
    } catch (e) {
      if (!isUniqueViolation(e)) {
        await this.repo.update(r.id, {
          lastError: (e as Error).message,
          lastRunAt: new Date(),
        })
        throw e
      }
      const existing = await this.invoicesRepo.findByRecurringPeriod(
        r.id,
        period
      )
      if (!existing) throw e
      invoiceId = existing.id
    }

    if (r.mode === "send") {
      try {
        let inv = await this.invoices.get(invoiceId)
        if (inv.status === "draft") inv = await this.invoices.issue(invoiceId)
        invoiceNumber = inv.number
        if (!inv.lastSentAt) {
          await this.invoices.send(invoiceId, {})
          sent = true
        }
      } catch (e) {
        lastError = `Invoice created but not sent: ${(e as Error).message}`
        this.logger.warn(lastError)
      }
    }

    const count = r.generatedCount + 1
    const next = nextOccurrence(period, r.every, r.unit, r.anchorDay)
    const finished = isFinished(r, count, next)
    await this.repo.advance(r.id, period, {
      generatedCount: count,
      nextRunDate: finished ? null : next,
      status: finished ? "ended" : r.status,
      lastRunAt: new Date(),
      lastError,
    })
    await this.audit.record("recurring.generated", {
      resourceType: "invoice",
      resourceId: invoiceId,
      metadata: { recurringId: r.id, period, sent },
    })
    if (!invoiceNumber)
      invoiceNumber = (await this.invoices.get(invoiceId)).number
    return { invoiceId, invoiceNumber, sent }
  }

  private async require(id: string) {
    const r = await this.repo.findById(id)
    if (!r) throw new NotFoundException("Recurring invoice not found")
    return r
  }
}
