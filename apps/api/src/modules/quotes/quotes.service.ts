import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common"
import {
  type CreateQuoteInput,
  documentTotals,
  type Quote,
  type QuoteList,
  type QuoteStatus,
  type QuoteSummary,
  type UpdateQuoteInput,
} from "@workspace/contracts"
import { formatMoney, type PartySnapshot } from "@workspace/contracts"
import { documentEmail } from "@workspace/emails"

import { type PageArgs } from "../../common/pagination.js"
import { AuditService } from "../../iam/audit/audit.service.js"
import { MailService } from "../../mail/mail.service.js"
import { PortalLinksService } from "../portal/portal-links.service.js"
import { ClientsRepository } from "../clients/clients.repository.js"
import { DocumentNumberingService } from "../documents/document-numbering.service.js"
import { renderDocumentPdf } from "../documents/document-pdf.js"
import {
  type ParsedLine,
  toLineItem,
  toLineValues,
} from "../documents/line-values.js"
import {
  addDays,
  formatDocDate,
  partySnapshot,
  todayIn,
} from "../documents/party-snapshot.js"
import { WorkspaceProfileService } from "../workspace/workspace-profile.service.js"
import {
  type QuoteLineRow,
  QuotesRepository,
  type QuoteWithClient,
} from "./quotes.repository.js"

const DEFAULT_VALIDITY_DAYS = 30

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
    lines: lines.map(toLineItem),
    sentAt: q.sentAt?.toISOString() ?? null,
    acceptedAt: q.acceptedAt?.toISOString() ?? null,
    declinedAt: q.declinedAt?.toISOString() ?? null,
    respondedByName: q.respondedByName ?? null,
    respondedVia: q.respondedVia ?? null,
    declineReason: q.declineReason ?? null,
    clientSnapshot: q.clientSnapshot ?? null,
    issuerSnapshot: q.issuerSnapshot ?? null,
    invoiceId: q.invoiceId ?? null,
    invoiceNumber: q.invoiceNumber ?? null,
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
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly portalLinks: PortalLinksService
  ) {}

  private async today() {
    return todayIn((await this.profile.get()).timezone)
  }

  async list(
    query: PageArgs & {
      status?: QuoteStatus
      clientId?: string
      q?: string
    }
  ): Promise<QuoteList> {
    const [{ items, total }, today] = await Promise.all([
      this.repo.list(query),
      this.today(),
    ])
    return {
      items: items.map((q) => toQuoteSummary(q, today)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    }
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

  /**
   * Accept or decline a sent quote. Members record it by hand ("manual");
   * the client portal passes the typed name and an optional reason.
   */
  async respond(
    id: string,
    outcome: "accepted" | "declined",
    by: {
      via: "manual" | "portal"
      name?: string | null
      reason?: string | null
      email?: string | null
    } = { via: "manual" }
  ): Promise<Quote> {
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
        respondedByName: by.name ?? null,
        respondedVia: by.via,
        declineReason: outcome === "declined" ? (by.reason ?? null) : null,
      })
    })
    await this.audit.record(`quote.${outcome}`, {
      resourceType: "quote",
      resourceId: id,
      metadata:
        by.via === "portal"
          ? { via: "portal", name: by.name, email: by.email }
          : undefined,
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

  async pdf(id: string): Promise<{ filename: string; content: Buffer }> {
    const quote = await this.get(id)
    const profile = await this.profile.get()
    const client = quote.clientSnapshot
      ? null
      : await this.clients.findById(quote.clientId)
    const issuer: PartySnapshot = quote.issuerSnapshot ?? partySnapshot(profile)
    const recipient: PartySnapshot =
      quote.clientSnapshot ??
      (client
        ? partySnapshot(client)
        : { name: quote.clientName, addressLines: [] })
    const content = await renderDocumentPdf({
      title: "Quote",
      number: quote.number,
      stamp:
        quote.status === "draft"
          ? "DRAFT"
          : quote.status === "declined"
            ? "DECLINED"
            : null,
      meta: [
        { label: "Quote", value: quote.number ?? "Draft" },
        {
          label: "Issued",
          value: formatDocDate(quote.issueDate, profile.locale),
        },
        {
          label: "Valid until",
          value: formatDocDate(quote.validUntil, profile.locale),
        },
      ],
      issuer,
      recipient,
      currency: quote.currency,
      locale: profile.locale,
      lines: quote.lines,
      subtotal: quote.subtotal,
      taxTotal: quote.taxTotal,
      total: quote.total,
      notes: quote.notes,
      terms: quote.terms,
      ...(await this.profile.documentBranding()),
    })
    return { filename: `${quote.number ?? "quote-draft"}.pdf`, content }
  }

  /** Email the PDF of a sent quote (primary contact → client email, or `to`). */
  async email(
    id: string,
    opts: { to?: string; message?: string | null }
  ): Promise<Quote> {
    const quote = await this.get(id)
    if (quote.status === "draft")
      throw new ConflictException("Mark the quote as sent before emailing it")
    let to = opts.to
    if (!to) {
      const [client, contacts] = await Promise.all([
        this.clients.findById(quote.clientId),
        this.clients.listContacts(quote.clientId),
      ])
      to =
        contacts.find((c) => c.isPrimary && c.email)?.email ??
        client?.email ??
        contacts.find((c) => c.email)?.email ??
        undefined
    }
    if (!to) {
      throw new BadRequestException({
        message:
          "This client has no email address. Add one or enter a recipient.",
        code: "no_recipient",
      })
    }
    const profile = await this.profile.get()
    const { filename, content } = await this.pdf(id)
    await this.mail.send(
      documentEmail({
        to,
        portalUrl: await this.portalLinks.documentLink(
          quote.clientId,
          to,
          `/quotes/${id}`
        ),
        kind: "Quote",
        number: quote.number!,
        workspaceName: profile.name,
        amount: formatMoney(
          { amount: quote.total, currency: quote.currency },
          profile.locale
        ),
        dueOrValid: quote.validUntil
          ? formatDocDate(quote.validUntil, profile.locale)
          : undefined,
        message: opts.message,
        replyTo: profile.email,
        pdf: { filename, contentBase64: content.toString("base64") },
      })
    )
    await this.audit.record("quote.emailed", {
      resourceType: "quote",
      resourceId: id,
      metadata: { to },
    })
    return quote
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
