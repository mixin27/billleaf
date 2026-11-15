import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common"
import {
  type CreateQuoteInput,
  documentTotals,
  type LineItemInput,
  lineAmounts,
  type Quote,
  type QuoteList,
  type QuoteStatus,
  type QuoteSummary,
  type UpdateQuoteInput,
} from "@workspace/contracts"

import { AuditService } from "../../iam/audit/audit.service.js"
import { ClientsRepository } from "../clients/clients.repository.js"
import { DocumentNumberingService } from "../documents/document-numbering.service.js"
import { addDays, partySnapshot, todayIn } from "../documents/party-snapshot.js"
import { WorkspaceProfileService } from "../workspace/workspace-profile.service.js"
import {
  type LineValues,
  type QuoteLineRow,
  QuotesRepository,
  type QuoteWithClient,
} from "./quotes.repository.js"

const DEFAULT_VALIDITY_DAYS = 30

type ParsedLine = Required<LineItemInput>

function toLineValues(
  lines: ParsedLine[]
): (LineValues & { taxRateBps: number })[] {
  return lines.map((l, i) => ({
    position: i,
    description: l.description,
    quantity: l.quantity,
    unitPrice: l.unitPrice,
    taxRateBps: l.taxRateBps,
    ...lineAmounts(l),
  }))
}

export function toQuoteSummary(
  q: QuoteWithClient,
  today: string
): QuoteSummary {
  return {
    id: q.id,
    number: q.number,
    status: q.status,
    isExpired:
      q.status === "sent" && q.validUntil !== null && q.validUntil < today,
    title: q.title,
    clientId: q.clientId,
    clientName: q.clientName,
    currency: q.currency,
    issueDate: q.issueDate,
    validUntil: q.validUntil,
    subtotal: q.subtotal,
    taxTotal: q.taxTotal,
    total: q.total,
    createdAt: q.createdAt.toISOString(),
    updatedAt: q.updatedAt.toISOString(),
  }
}

function toQuote(
  q: QuoteWithClient,
  lines: QuoteLineRow[],
  today: string
): Quote {
  return {
    ...toQuoteSummary(q, today),
    notes: q.notes,
    terms: q.terms,
    lines: lines.map((l) => ({
      id: l.id,
      position: l.position,
      description: l.description,
      quantity: Number(l.quantity),
      unitPrice: l.unitPrice,
      taxRateBps: l.taxRateBps,
      amount: l.amount,
      taxAmount: l.taxAmount,
    })),
    sentAt: q.sentAt?.toISOString() ?? null,
    acceptedAt: q.acceptedAt?.toISOString() ?? null,
    declinedAt: q.declinedAt?.toISOString() ?? null,
    clientSnapshot: q.clientSnapshot ?? null,
    issuerSnapshot: q.issuerSnapshot ?? null,
  }
}

/**
 * Quote lifecycle: draft → sent → accepted | declined.
 * Drafts are freely editable; sending assigns the number and freezes
 * client/issuer details. Inputs are already parsed by the Zod pipe.
 */
@Injectable()
export class QuotesService {
  constructor(
    private readonly repo: QuotesRepository,
    private readonly clients: ClientsRepository,
    private readonly profile: WorkspaceProfileService,
    private readonly numbering: DocumentNumberingService,
    private readonly audit: AuditService
  ) {}

  private async today() {
    return todayIn((await this.profile.get()).timezone)
  }

  async list(query: {
    status?: QuoteStatus
    clientId?: string
    q?: string
    cursor?: string
    limit: number
  }): Promise<QuoteList> {
    const [{ items, nextCursor }, today] = await Promise.all([
      this.repo.list(query),
      this.today(),
    ])
    return { items: items.map((q) => toQuoteSummary(q, today)), nextCursor }
  }

  async get(id: string): Promise<Quote> {
    const quote = await this.require(id)
    const [lines, today] = await Promise.all([
      this.repo.lines(id),
      this.today(),
    ])
    return toQuote(quote, lines, today)
  }

  async create(input: CreateQuoteInput): Promise<Quote> {
    const client = await this.activeClient(input.clientId)
    const profile = await this.profile.get()
    const issueDate = input.issueDate ?? todayIn(profile.timezone)
    const lines = toLineValues((input.lines ?? []) as ParsedLine[])
    const id = await this.repo.create(
      {
        clientId: client.id,
        title: input.title ?? null,
        currency: input.currency ?? client.currency ?? profile.defaultCurrency,
        issueDate,
        validUntil:
          input.validUntil === undefined
            ? addDays(issueDate, DEFAULT_VALIDITY_DAYS)
            : input.validUntil,
        notes: input.notes ?? null,
        terms: input.terms ?? null,
        ...documentTotals(lines),
      },
      lines
    )
    await this.audit.record("quote.created", {
      resourceType: "quote",
      resourceId: id,
    })
    return this.get(id)
  }

  async update(id: string, input: UpdateQuoteInput): Promise<Quote> {
    await this.repo.database.transaction(async (tx) => {
      const quote = await this.repo.findById(id, tx, { forUpdate: true })
      if (!quote) throw new NotFoundException("Quote not found")
      if (quote.status !== "draft") {
        throw new ConflictException(
          "Only draft quotes can be edited. Duplicate it instead."
        )
      }
      if (input.clientId && input.clientId !== quote.clientId) {
        await this.activeClient(input.clientId)
      }
      const { lines: inputLines, ...fields } = input
      const lines = inputLines
        ? toLineValues(inputLines as ParsedLine[])
        : undefined
      await this.repo.update(
        tx,
        id,
        { ...(fields as object), ...(lines ? documentTotals(lines) : {}) },
        lines
      )
    })
    return this.get(id)
  }

  /** Assign the number, freeze snapshots and mark as sent (email delivery comes with PDFs). */
  async send(id: string): Promise<Quote> {
    const profile = await this.profile.get()
    await this.repo.database.transaction(async (tx) => {
      const quote = await this.repo.findById(id, tx, { forUpdate: true })
      if (!quote) throw new NotFoundException("Quote not found")
      if (quote.status !== "draft")
        throw new ConflictException("Quote has already been sent")
      const lines = await this.repo.lines(id, tx)
      if (lines.length === 0)
        throw new BadRequestException("Add at least one line before sending")
      const client = await this.clients.findById(quote.clientId)
      if (!client)
        throw new BadRequestException("The quote's client no longer exists")

      const number = await this.numbering.next(tx, "quote")
      await this.repo.update(tx, id, {
        number,
        status: "sent",
        sentAt: new Date(),
        clientSnapshot: partySnapshot(client),
        issuerSnapshot: partySnapshot(profile),
      })
    })
    await this.audit.record("quote.sent", {
      resourceType: "quote",
      resourceId: id,
    })
    return this.get(id)
  }

  async respond(id: string, outcome: "accepted" | "declined"): Promise<Quote> {
    await this.repo.database.transaction(async (tx) => {
      const quote = await this.repo.findById(id, tx, { forUpdate: true })
      if (!quote) throw new NotFoundException("Quote not found")
      if (quote.status !== "sent") {
        throw new ConflictException(`Only sent quotes can be ${outcome}`)
      }
      await this.repo.update(tx, id, {
        status: outcome,
        ...(outcome === "accepted"
          ? { acceptedAt: new Date() }
          : { declinedAt: new Date() }),
      })
    })
    await this.audit.record(`quote.${outcome}`, {
      resourceType: "quote",
      resourceId: id,
    })
    return this.get(id)
  }

  /** New draft with the same client, currency and lines (any status). */
  async duplicate(id: string): Promise<Quote> {
    const source = await this.get(id)
    const issueDate = await this.today()
    const validityDays =
      source.validUntil != null
        ? Math.max(
            1,
            Math.round(
              (Date.parse(source.validUntil) - Date.parse(source.issueDate)) /
                86_400_000
            )
          )
        : DEFAULT_VALIDITY_DAYS
    return this.create({
      clientId: source.clientId,
      title: source.title,
      currency: source.currency,
      issueDate,
      validUntil: addDays(issueDate, validityDays),
      notes: source.notes,
      terms: source.terms,
      lines: source.lines.map(
        ({ description, quantity, unitPrice, taxRateBps }) => ({
          description,
          quantity,
          unitPrice,
          taxRateBps,
        })
      ),
    })
  }

  async remove(id: string): Promise<void> {
    const quote = await this.require(id)
    if (quote.status !== "draft") {
      throw new ConflictException(
        "Sent quotes are part of your records and cannot be deleted"
      )
    }
    await this.repo.delete(id)
    await this.audit.record("quote.deleted", {
      resourceType: "quote",
      resourceId: id,
    })
  }

  private async require(id: string) {
    const quote = await this.repo.findById(id)
    if (!quote) throw new NotFoundException("Quote not found")
    return quote
  }

  private async activeClient(clientId: string) {
    const client = await this.clients.findById(clientId)
    if (!client) throw new BadRequestException("Client not found")
    if (client.archivedAt)
      throw new BadRequestException("Restore the client before quoting")
    return client
  }
}
