import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common"
import {
  type CreateInvoiceInput,
  documentTotals,
  formatMoney,
  type Invoice,
  type InvoiceDisplayStatus,
  type InvoiceList,
  invoiceState,
  type InvoiceSummary,
  type PartySnapshot,
  type UpdateInvoiceInput,
} from "@workspace/contracts"
import { documentEmail, invoiceReminderEmail } from "@workspace/emails"

import { type PageArgs } from "../../common/pagination.js"
import { EntitlementsService } from "../../billing/entitlements.service.js"
import { UsageService } from "../../billing/usage.service.js"
import { AuditService } from "../../iam/audit/audit.service.js"
import { MailService } from "../../mail/mail.service.js"
import { paymentAccountLines } from "../payment-accounts/payment-account-lines.js"
import { PaymentAccountsService } from "../payment-accounts/payment-accounts.service.js"
import { PortalLinksService } from "../portal/portal-links.service.js"
import { ClientsRepository } from "../clients/clients.repository.js"
import { DocumentNumberingService } from "../documents/document-numbering.service.js"
import { renderDocumentPdf } from "../documents/document-pdf.js"
import {
  discountColumns,
  discountOf,
  type ParsedLine,
  toLineInput,
  toLineItem,
  toLineValues,
} from "../documents/line-values.js"
import {
  addDays,
  formatDocDate,
  partySnapshot,
  todayIn,
} from "../documents/party-snapshot.js"
import { QuotesService } from "../quotes/quotes.service.js"
import { WorkspaceProfileService } from "../workspace/workspace-profile.service.js"
import {
  type InvoiceLineRow,
  InvoicesRepository,
  type InvoiceWithRefs,
} from "./invoices.repository.js"
import { WebhooksService } from "../webhooks/webhooks.service.js"

export function toInvoiceSummary(
  inv: InvoiceWithRefs,
  today: string
): InvoiceSummary {
  return {
    id: inv.id,
    number: inv.number,
    status: inv.status,
    ...invoiceState(inv, today),
    title: inv.title,
    clientId: inv.clientId,
    clientName: inv.clientName,
    quoteId: inv.quoteId,
    currency: inv.currency,
    issueDate: inv.issueDate,
    dueDate: inv.dueDate,
    subtotal: inv.subtotal,
    discount: discountOf(inv),
    discountTotal: inv.discountTotal,
    taxTotal: inv.taxTotal,
    total: inv.total,
    amountPaid: inv.amountPaid,
    amountCredited: inv.amountCredited,
    createdAt: inv.createdAt.toISOString(),
    updatedAt: inv.updatedAt.toISOString(),
  }
}

function toInvoice(
  inv: InvoiceWithRefs,
  lines: InvoiceLineRow[],
  today: string,
  reminders: { offsetDays: number; sentTo: string; sentAt: Date }[] = [],
  creditNotes: Invoice["creditNotes"] = []
): Invoice {
  return {
    ...toInvoiceSummary(inv, today),
    quoteNumber: inv.quoteNumber ?? null,
    recurringId: inv.recurringId,
    recurringPeriod: inv.recurringPeriod,
    notes: inv.notes,
    terms: inv.terms,
    lines: lines.map(toLineItem),
    issuedAt: inv.issuedAt?.toISOString() ?? null,
    voidedAt: inv.voidedAt?.toISOString() ?? null,
    voidReason: inv.voidReason,
    lastSentAt: inv.lastSentAt?.toISOString() ?? null,
    lastSentTo: inv.lastSentTo,
    remindersPaused: inv.remindersPaused,
    reminders: reminders.map((r) => ({
      offsetDays: r.offsetDays,
      sentTo: r.sentTo,
      sentAt: r.sentAt.toISOString(),
    })),
    clientSnapshot: inv.clientSnapshot ?? null,
    issuerSnapshot: inv.issuerSnapshot ?? null,
    creditNotes,
  }
}

/**
 * Invoice lifecycle: draft → issued → void. Issuing assigns the gap-free
 * number and freezes snapshots; issued invoices are immutable. Payment state
 * comes from `amountPaid` (Payments module). Inputs are parsed by the Zod pipe.
 */
@Injectable()
export class InvoicesService {
  constructor(
    private readonly repo: InvoicesRepository,
    private readonly clients: ClientsRepository,
    private readonly quotes: QuotesService,
    private readonly profile: WorkspaceProfileService,
    private readonly numbering: DocumentNumberingService,
    private readonly mail: MailService,
    private readonly portalLinks: PortalLinksService,
    private readonly audit: AuditService,
    private readonly entitlements: EntitlementsService,
    private readonly usage: UsageService,
    private readonly paymentAccounts: PaymentAccountsService,
    private readonly webhooks: WebhooksService
  ) {}

  /**
   * "How to pay" for an issued invoice with a balance: the workspace's
   * active payment accounts for its currency (with QR images for the PDF).
   */
  private async howToPay(invoice: Invoice, withQr: boolean) {
    if (invoice.status !== "issued" || invoice.amountDue <= 0) return []
    const rows = await this.paymentAccounts.forCurrency(invoice.currency)
    return Promise.all(
      rows.map(async (r) => ({
        label: r.label,
        lines: paymentAccountLines(r),
        qr: withQr ? await this.paymentAccounts.qrImage(r) : null,
      }))
    )
  }

  private async today() {
    return todayIn((await this.profile.get()).timezone)
  }

  async list(
    query: PageArgs & {
      status?: InvoiceDisplayStatus
      clientId?: string
      q?: string
    }
  ): Promise<InvoiceList> {
    const today = await this.today()
    const { items, total } = await this.repo.list({ ...query, today })
    return {
      items: items.map((i) => toInvoiceSummary(i, today)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    }
  }

  async get(id: string): Promise<Invoice> {
    const invoice = await this.require(id)
    const [lines, today, reminders, credits] = await Promise.all([
      this.repo.lines(id),
      this.today(),
      this.repo.reminders(id),
      this.repo.creditNotes(id),
    ])
    return toInvoice(invoice, lines, today, reminders, credits)
  }

  async create(
    input: CreateInvoiceInput,
    origin: {
      quoteId?: string | null
      recurringId?: string
      recurringPeriod?: string
    } = {}
  ): Promise<Invoice> {
    const quoteId = origin.quoteId ?? null
    const client = await this.activeClient(input.clientId)
    const profile = await this.profile.get()
    const issueDate = input.issueDate ?? todayIn(profile.timezone)
    const terms = client.paymentTermsDays ?? profile.paymentTermsDays
    const discount = input.discount ?? null
    const lines = toLineValues((input.lines ?? []) as ParsedLine[], discount)
    const id = await this.repo.create(
      {
        clientId: client.id,
        quoteId,
        recurringId: origin.recurringId ?? null,
        recurringPeriod: origin.recurringPeriod ?? null,
        title: input.title ?? null,
        currency: input.currency ?? client.currency ?? profile.defaultCurrency,
        issueDate,
        dueDate:
          input.dueDate === undefined
            ? addDays(issueDate, terms)
            : input.dueDate,
        notes: input.notes ?? null,
        terms: input.terms ?? null,
        ...discountColumns(discount),
        ...documentTotals(lines, discount),
      },
      lines
    )
    await this.audit.record("invoice.created", {
      resourceType: "invoice",
      resourceId: id,
      metadata: quoteId
        ? { quoteId }
        : origin.recurringId
          ? { recurringId: origin.recurringId, period: origin.recurringPeriod }
          : undefined,
    })
    return this.get(id)
  }

  /** Accepted quote → draft invoice with the same client, currency and lines. */
  async createFromQuote(quoteId: string): Promise<Invoice> {
    const quote = await this.quotes.get(quoteId)
    if (quote.status !== "accepted") {
      throw new ConflictException(
        "Only accepted quotes can be converted to invoices"
      )
    }
    const existing = await this.repo.findByQuote(quoteId)
    if (existing) {
      throw new ConflictException({
        message: `Already converted to ${existing.number ?? "a draft invoice"}`,
        code: "quote_already_converted",
      })
    }
    try {
      return await this.create(
        {
          clientId: quote.clientId,
          title: quote.title,
          currency: quote.currency,
          notes: quote.notes,
          terms: quote.terms,
          discount: quote.discount,
          lines: quote.lines.map(
            ({ description, quantity, unitPrice, taxRateBps }) => ({
              description,
              quantity,
              unitPrice,
              taxRateBps,
            })
          ),
        },
        { quoteId }
      )
    } catch (e) {
      // Unique (quote_id) lost a race with a concurrent conversion.
      if ((e as { cause?: { code?: string } }).cause?.code === "23505") {
        throw new ConflictException({
          message: "Quote was already converted",
          code: "quote_already_converted",
        })
      }
      throw e
    }
  }

  async update(id: string, input: UpdateInvoiceInput): Promise<Invoice> {
    await this.repo.database.transaction(async (tx) => {
      const invoice = await this.repo.findById(id, tx, { forUpdate: true })
      if (!invoice) throw new NotFoundException("Invoice not found")
      if (invoice.status !== "draft") {
        throw new ConflictException(
          "Issued invoices cannot be edited. Void it and duplicate instead."
        )
      }
      if (input.clientId && input.clientId !== invoice.clientId)
        await this.activeClient(input.clientId)
      const { lines: inputLines, discount: inputDiscount, ...fields } = input
      // New lines or a new discount: recompute every line's tax and the totals.
      const recompute = inputLines !== undefined || inputDiscount !== undefined
      const discount =
        inputDiscount !== undefined ? inputDiscount : discountOf(invoice)
      const lines = recompute
        ? toLineValues(
            (inputLines as ParsedLine[] | undefined) ??
              (await this.repo.lines(id, tx)).map(toLineInput),
            discount
          )
        : undefined
      await this.repo.update(
        tx,
        id,
        {
          ...(fields as object),
          ...(lines
            ? {
                ...discountColumns(discount),
                ...documentTotals(lines, discount),
              }
            : {}),
        },
        lines
      )
    })
    return this.get(id)
  }

  async issue(id: string): Promise<Invoice> {
    const profile = await this.profile.get()
    // Soft limit: concurrent issues may overshoot by a few, never block drafts.
    await this.entitlements.assertWithinLimit(
      "invoicesPerMonth",
      await this.usage.invoicesPerMonth(profile.timezone)
    )
    await this.repo.database.transaction(async (tx) => {
      const invoice = await this.repo.findById(id, tx, { forUpdate: true })
      if (!invoice) throw new NotFoundException("Invoice not found")
      if (invoice.status !== "draft")
        throw new ConflictException("Invoice has already been issued")
      const lines = await this.repo.lines(id, tx)
      if (lines.length === 0)
        throw new BadRequestException("Add at least one line before issuing")
      if (invoice.total <= 0)
        throw new BadRequestException("Invoice total must be greater than zero")
      const client = await this.clients.findById(invoice.clientId)
      if (!client)
        throw new BadRequestException("The invoice's client no longer exists")

      const number = await this.numbering.next(tx, "invoice")
      const terms = client.paymentTermsDays ?? profile.paymentTermsDays
      await this.repo.update(tx, id, {
        number,
        status: "issued",
        issuedAt: new Date(),
        dueDate: invoice.dueDate ?? addDays(invoice.issueDate, terms),
        clientSnapshot: partySnapshot(client),
        issuerSnapshot: partySnapshot(profile),
      })
    })
    await this.audit.record("invoice.issued", {
      resourceType: "invoice",
      resourceId: id,
    })
    const issued = await this.get(id)
    await this.webhooks.emit("invoice.issued", issued)
    return issued
  }

  async void(id: string, reason: string): Promise<Invoice> {
    await this.repo.database.transaction(async (tx) => {
      const invoice = await this.repo.findById(id, tx, { forUpdate: true })
      if (!invoice) throw new NotFoundException("Invoice not found")
      if (invoice.status !== "issued")
        throw new ConflictException("Only issued invoices can be voided")
      if (invoice.amountPaid > 0) {
        throw new ConflictException({
          message:
            "This invoice has payments. Refund or void them before voiding the invoice.",
          code: "invoice_has_payments",
        })
      }
      if (await this.repo.hasIssuedCreditNotes(tx, id)) {
        throw new ConflictException({
          message:
            "This invoice has credit notes. Void them before voiding it.",
          code: "invoice_has_credit_notes",
        })
      }
      await this.repo.update(tx, id, {
        status: "void",
        voidedAt: new Date(),
        voidReason: reason,
      })
      await this.repo.releaseTime(tx, id)
      await this.repo.releaseExpenses(tx, id)
    })
    await this.audit.record("invoice.voided", {
      resourceType: "invoice",
      resourceId: id,
      metadata: { reason },
    })
    const voided = await this.get(id)
    await this.webhooks.emit("invoice.voided", voided)
    return voided
  }

  async duplicate(id: string): Promise<Invoice> {
    const source = await this.get(id)
    return this.create({
      clientId: source.clientId,
      title: source.title,
      currency: source.currency,
      notes: source.notes,
      terms: source.terms,
      discount: source.discount,
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
    const invoice = await this.require(id)
    if (invoice.status !== "draft") {
      throw new ConflictException(
        "Issued invoices are part of your records. Void it instead."
      )
    }
    await this.repo.delete(id)
    await this.audit.record("invoice.deleted", {
      resourceType: "invoice",
      resourceId: id,
    })
  }

  async pdf(id: string): Promise<{ filename: string; content: Buffer }> {
    const invoice = await this.get(id)
    const profile = await this.profile.get()
    const client = invoice.clientSnapshot
      ? null
      : await this.clients.findById(invoice.clientId)
    const issuer: PartySnapshot =
      invoice.issuerSnapshot ?? partySnapshot(profile)
    const recipient: PartySnapshot =
      invoice.clientSnapshot ??
      (client
        ? partySnapshot(client)
        : { name: invoice.clientName, addressLines: [] })
    const content = await renderDocumentPdf({
      title: "Invoice",
      number: invoice.number,
      stamp:
        invoice.status === "draft"
          ? "DRAFT"
          : invoice.status === "void"
            ? "VOID"
            : invoice.paymentStatus === "paid"
              ? "PAID"
              : null,
      meta: [
        { label: "Invoice", value: invoice.number ?? "Draft" },
        {
          label: "Issued",
          value: formatDocDate(invoice.issueDate, profile.locale),
        },
        {
          label: "Due",
          value: formatDocDate(invoice.dueDate, profile.locale, "On receipt"),
        },
        ...(invoice.quoteNumber
          ? [{ label: "Quote", value: invoice.quoteNumber }]
          : []),
      ],
      issuer,
      recipient,
      currency: invoice.currency,
      locale: profile.locale,
      lines: invoice.lines,
      subtotal: invoice.subtotal,
      discount: invoice.discount,
      discountTotal: invoice.discountTotal,
      taxTotal: invoice.taxTotal,
      total: invoice.total,
      amountPaid: invoice.amountPaid,
      amountCredited: invoice.amountCredited,
      amountDue: invoice.amountDue,
      notes: invoice.notes,
      terms: invoice.terms,
      paymentInstructions: await this.howToPay(invoice, true),
      ...(await this.profile.documentBranding()),
    })
    return { filename: `${invoice.number ?? "invoice-draft"}.pdf`, content }
  }

  /** Email the PDF to the client (primary contact → client email, or `to`). */
  async send(
    id: string,
    opts: { to?: string; message?: string | null }
  ): Promise<Invoice> {
    const invoice = await this.get(id)
    if (invoice.status !== "issued")
      throw new ConflictException("Issue the invoice before sending it")
    const to = opts.to ?? (await this.defaultRecipient(invoice.clientId))
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
          invoice.clientId,
          to,
          `/invoices/${id}`
        ),
        kind: "Invoice",
        number: invoice.number!,
        workspaceName: profile.name,
        amount: formatMoney(
          { amount: invoice.amountDue, currency: invoice.currency },
          profile.locale
        ),
        dueOrValid: invoice.dueDate
          ? formatDocDate(invoice.dueDate, profile.locale)
          : undefined,
        message: opts.message,
        replyTo: profile.email,
        paymentInstructions: (await this.howToPay(invoice, false)).map((m) =>
          [m.label, ...m.lines].join(" · ")
        ),
        pdf: { filename, contentBase64: content.toString("base64") },
      })
    )
    await this.repo.update(this.repo.database, id, {
      lastSentAt: new Date(),
      lastSentTo: to,
    })
    await this.audit.record("invoice.sent", {
      resourceType: "invoice",
      resourceId: id,
      metadata: { to },
    })
    const sent = await this.get(id)
    await this.webhooks.emit("invoice.sent", sent)
    return sent
  }

  /** Turn automatic payment reminders off or on for one invoice. */
  async setRemindersPaused(id: string, paused: boolean): Promise<Invoice> {
    await this.require(id)
    await this.repo.update(this.repo.database, id, { remindersPaused: paused })
    await this.audit.record(
      paused ? "invoice.reminders_paused" : "invoice.reminders_resumed",
      { resourceType: "invoice", resourceId: id }
    )
    return this.get(id)
  }

  /** Who gets reminders: the last recipient, else the client's email. */
  async reminderRecipient(invoice: {
    clientId: string
    lastSentTo: string | null
  }) {
    return invoice.lastSentTo ?? (await this.defaultRecipient(invoice.clientId))
  }

  /** Email one payment reminder (called by InvoiceRemindersService). */
  async sendReminder(id: string, offsetDays: number, to: string) {
    const invoice = await this.get(id)
    const profile = await this.profile.get()
    await this.mail.send(
      invoiceReminderEmail({
        to,
        workspaceName: profile.name,
        number: invoice.number!,
        amountDue: formatMoney(
          { amount: invoice.amountDue, currency: invoice.currency },
          profile.locale
        ),
        dueDate: formatDocDate(invoice.dueDate, profile.locale),
        offsetDays,
        portalUrl: await this.portalLinks.documentLink(
          invoice.clientId,
          to,
          `/invoices/${id}`
        ),
        paymentInstructions: (await this.howToPay(invoice, false)).map((m) =>
          [m.label, ...m.lines].join(" · ")
        ),
        replyTo: profile.email,
      })
    )
    await this.audit.record("invoice.reminder_sent", {
      resourceType: "invoice",
      resourceId: id,
      metadata: { to, offsetDays },
    })
  }

  /** The client's primary contact email, else the client's email. */
  async defaultRecipient(clientId: string): Promise<string | null> {
    const [client, contacts] = await Promise.all([
      this.clients.findById(clientId),
      this.clients.listContacts(clientId),
    ])
    return (
      contacts.find((c) => c.isPrimary && c.email)?.email ??
      client?.email ??
      contacts.find((c) => c.email)?.email ??
      null
    )
  }

  private async require(id: string) {
    const invoice = await this.repo.findById(id)
    if (!invoice) throw new NotFoundException("Invoice not found")
    return invoice
  }

  private async activeClient(clientId: string) {
    const client = await this.clients.findById(clientId)
    if (!client) throw new BadRequestException("Client not found")
    if (client.archivedAt)
      throw new BadRequestException("Restore the client before invoicing")
    return client
  }
}
