import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common"
import {
  type CreateCreditNoteInput,
  type CreditNote,
  type CreditNoteList,
  type CreditNoteSummary,
  discountLabel,
  documentTotals,
  formatMoney,
  type ListCreditNotesQuery,
  type PartySnapshot,
  splitCredit,
} from "@workspace/contracts"
import { documentEmail } from "@workspace/emails"
import {
  clients,
  creditNoteLines,
  creditNotes,
  invoices,
  type Transaction,
} from "@workspace/db"
import { and, asc, count, eq, ilike, or, type SQL, sql } from "drizzle-orm"

import { RequestContext } from "../../common/context/request-context.js"
import { offsetOf, orderBy, type PageArgs } from "../../common/pagination.js"
import { InjectDb, type Database } from "../../core/database/database.module.js"
import { AuditService } from "../../iam/audit/audit.service.js"
import { MailService } from "../../mail/mail.service.js"
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
  formatDocDate,
  partySnapshot,
  todayIn,
} from "../documents/party-snapshot.js"
import { InvoicesRepository } from "../invoices/invoices.repository.js"
import { InvoicesService } from "../invoices/invoices.service.js"
import { PortalLinksService } from "../portal/portal-links.service.js"
import { WebhooksService } from "../webhooks/webhooks.service.js"
import { WorkspaceProfileService } from "../workspace/workspace-profile.service.js"

const escapeLike = (v: string) => v.replace(/[\\%_]/g, (c) => `\\${c}`)

type Row = typeof creditNotes.$inferSelect & {
  clientName: string
  invoiceNumber: string | null
}

/**
 * Credit notes against issued invoices: issued straight away (gap-free
 * CN-0001), never edited, voidable. Issuing lowers the invoice's balance
 * (`amount_credited`) by the part still owed; the rest is a refund due.
 */
@Injectable()
export class CreditNotesService {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly ctx: RequestContext,
    private readonly invoicesRepo: InvoicesRepository,
    private readonly invoices: InvoicesService,
    private readonly clients: ClientsRepository,
    private readonly numbering: DocumentNumberingService,
    private readonly profile: WorkspaceProfileService,
    private readonly mail: MailService,
    private readonly portalLinks: PortalLinksService,
    private readonly audit: AuditService,
    private readonly webhooks: WebhooksService
  ) {}

  private scope(): SQL {
    return eq(creditNotes.workspaceId, this.ctx.workspaceId)
  }

  private select(tx: Database | Transaction = this.db) {
    return tx
      .select({
        note: creditNotes,
        clientName: clients.name,
        invoiceNumber: invoices.number,
      })
      .from(creditNotes)
      .innerJoin(clients, eq(clients.id, creditNotes.clientId))
      .innerJoin(invoices, eq(invoices.id, creditNotes.invoiceId))
  }

  private static flatten(r: {
    note: typeof creditNotes.$inferSelect
    clientName: string
    invoiceNumber: string | null
  }): Row {
    return {
      ...r.note,
      clientName: r.clientName,
      invoiceNumber: r.invoiceNumber,
    }
  }

  private toSummary(n: Row): CreditNoteSummary {
    return {
      id: n.id,
      number: n.number,
      status: n.status,
      invoiceId: n.invoiceId,
      invoiceNumber: n.invoiceNumber,
      clientId: n.clientId,
      clientName: n.clientName,
      issueDate: n.issueDate,
      reason: n.reason,
      currency: n.currency,
      subtotal: n.subtotal,
      discount: discountOf(n),
      discountTotal: n.discountTotal,
      taxTotal: n.taxTotal,
      total: n.total,
      appliedAmount: n.appliedAmount,
      refundAmount: n.refundAmount,
      createdAt: n.createdAt.toISOString(),
    }
  }

  async list(
    q: PageArgs & Omit<ListCreditNotesQuery, "page" | "pageSize" | "sort">
  ): Promise<CreditNoteList> {
    const w: SQL[] = [this.scope()]
    if (q.status) w.push(eq(creditNotes.status, q.status))
    if (q.clientId) w.push(eq(creditNotes.clientId, q.clientId))
    if (q.invoiceId) w.push(eq(creditNotes.invoiceId, q.invoiceId))
    if (q.q) {
      const like = `%${escapeLike(q.q)}%`
      w.push(
        or(
          ilike(creditNotes.number, like),
          ilike(invoices.number, like),
          ilike(clients.name, like),
          ilike(creditNotes.reason, like)
        )!
      )
    }
    const where = and(...w)
    const [rows, [total]] = await Promise.all([
      this.select()
        .where(where)
        .orderBy(
          ...orderBy(
            q.sort,
            {
              number: creditNotes.number,
              issueDate: creditNotes.issueDate,
              total: creditNotes.total,
              createdAt: creditNotes.createdAt,
            },
            creditNotes.id
          )
        )
        .limit(q.pageSize)
        .offset(offsetOf(q.page, q.pageSize)),
      this.db
        .select({ n: count() })
        .from(creditNotes)
        .innerJoin(clients, eq(clients.id, creditNotes.clientId))
        .innerJoin(invoices, eq(invoices.id, creditNotes.invoiceId))
        .where(where),
    ])
    return {
      items: rows.map((r) => this.toSummary(CreditNotesService.flatten(r))),
      total: total?.n ?? 0,
      page: q.page,
      pageSize: q.pageSize,
    }
  }

  private async require(id: string): Promise<Row> {
    const [row] = await this.select()
      .where(and(this.scope(), eq(creditNotes.id, id)))
      .limit(1)
    if (!row) throw new NotFoundException("Credit note not found")
    return CreditNotesService.flatten(row)
  }

  async get(id: string): Promise<CreditNote> {
    const n = await this.require(id)
    const lines = await this.db
      .select()
      .from(creditNoteLines)
      .where(
        and(
          eq(creditNoteLines.workspaceId, this.ctx.workspaceId),
          eq(creditNoteLines.creditNoteId, id)
        )
      )
      .orderBy(asc(creditNoteLines.position))
    return {
      ...this.toSummary(n),
      lines: lines.map(toLineItem),
      voidedAt: n.voidedAt?.toISOString() ?? null,
      voidReason: n.voidReason,
      lastSentAt: n.lastSentAt?.toISOString() ?? null,
      lastSentTo: n.lastSentTo,
      clientSnapshot: n.clientSnapshot ?? null,
      issuerSnapshot: n.issuerSnapshot ?? null,
    }
  }

  async create(
    invoiceId: string,
    input: CreateCreditNoteInput
  ): Promise<CreditNote> {
    const profile = await this.profile.get()
    const today = todayIn(profile.timezone)
    const issueDate = input.issueDate ?? today
    if (issueDate > today)
      throw new BadRequestException("The date can't be in the future")

    const id = await this.db.transaction(async (tx) => {
      const invoice = await this.invoicesRepo.findById(invoiceId, tx, {
        forUpdate: true,
      })
      if (!invoice) throw new NotFoundException("Invoice not found")
      if (invoice.status !== "issued")
        throw new ConflictException({
          message: "Only issued invoices can be credited",
          code: "invoice_not_issued",
        })
      if (issueDate < invoice.issueDate)
        throw new BadRequestException(
          "The credit note can't be dated before the invoice"
        )

      // A full credit copies the invoice's lines and its discount; credited
      // lines are entered as they should be credited.
      const lines: ParsedLine[] = input.full
        ? (await this.invoicesRepo.lines(invoiceId, tx)).map(toLineInput)
        : (input.lines as ParsedLine[])
      const discount = input.full ? discountOf(invoice) : null
      const totals = documentTotals(lines, discount)
      if (totals.total <= 0)
        throw new BadRequestException("The credit must be more than zero")
      // Already credited = applied to the balance + refunds of issued notes.
      const [issued] = await tx
        .select({
          sum: sql<string>`coalesce(sum(${creditNotes.total}), 0)`,
        })
        .from(creditNotes)
        .where(
          and(
            this.scope(),
            eq(creditNotes.invoiceId, invoiceId),
            eq(creditNotes.status, "issued")
          )
        )
      const alreadyCredited = Number(issued?.sum ?? 0)
      const left = invoice.total - alreadyCredited
      if (totals.total > left)
        throw new BadRequestException({
          message: `Only ${formatMoney({ amount: Math.max(0, left), currency: invoice.currency }, profile.locale)} of this invoice is left to credit`,
          code: "credit_exceeds_invoice",
        })
      const { applied, refund } = splitCredit({
        credit: totals.total,
        total: invoice.total,
        amountPaid: invoice.amountPaid,
        amountCredited: invoice.amountCredited,
      })

      const client = invoice.clientSnapshot
        ? null
        : await this.clients.findById(invoice.clientId)
      const recipient: PartySnapshot =
        invoice.clientSnapshot ??
        (client
          ? partySnapshot(client)
          : { name: invoice.clientName, addressLines: [] })

      const [note] = await tx
        .insert(creditNotes)
        .values({
          workspaceId: this.ctx.workspaceId,
          invoiceId,
          clientId: invoice.clientId,
          number: await this.numbering.next(tx, "credit_note"),
          issueDate,
          reason: input.reason,
          currency: invoice.currency,
          ...discountColumns(discount),
          ...totals,
          appliedAmount: applied,
          refundAmount: refund,
          clientSnapshot: recipient,
          issuerSnapshot: invoice.issuerSnapshot ?? partySnapshot(profile),
        })
        .returning({ id: creditNotes.id })
      await tx.insert(creditNoteLines).values(
        toLineValues(lines, discount).map((l) => ({
          ...l,
          workspaceId: this.ctx.workspaceId,
          creditNoteId: note!.id,
        }))
      )
      await this.invoicesRepo.update(tx, invoiceId, {
        amountCredited: invoice.amountCredited + applied,
      })
      return note!.id
    })

    await this.audit.record("credit_note.issued", {
      resourceType: "credit_note",
      resourceId: id,
      metadata: { invoiceId, reason: input.reason },
    })
    const created = await this.get(id)
    await this.webhooks.emit("credit_note.issued", created)
    return created
  }

  async void(id: string, reason: string): Promise<CreditNote> {
    await this.db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(creditNotes)
        .where(and(this.scope(), eq(creditNotes.id, id)))
        .for("update")
        .limit(1)
      if (!row) throw new NotFoundException("Credit note not found")
      if (row.status !== "issued")
        throw new ConflictException("This credit note is already void")
      const invoice = await this.invoicesRepo.findById(row.invoiceId, tx, {
        forUpdate: true,
      })
      await tx
        .update(creditNotes)
        .set({ status: "void", voidedAt: new Date(), voidReason: reason })
        .where(eq(creditNotes.id, id))
      if (invoice)
        await this.invoicesRepo.update(tx, invoice.id, {
          amountCredited: Math.max(
            0,
            invoice.amountCredited - row.appliedAmount
          ),
        })
    })
    await this.audit.record("credit_note.voided", {
      resourceType: "credit_note",
      resourceId: id,
      metadata: { reason },
    })
    return this.get(id)
  }

  async pdf(id: string): Promise<{ filename: string; content: Buffer }> {
    const n = await this.get(id)
    const profile = await this.profile.get()
    const money = (amount: number) => ({ amount })
    const content = await renderDocumentPdf({
      title: "Credit note",
      number: n.number,
      stamp: n.status === "void" ? "VOID" : null,
      meta: [
        { label: "Credit note", value: n.number },
        { label: "Date", value: formatDocDate(n.issueDate, profile.locale) },
        { label: "Invoice", value: n.invoiceNumber ?? "—" },
      ],
      issuer: n.issuerSnapshot ?? partySnapshot(profile),
      recipient: n.clientSnapshot ?? { name: n.clientName, addressLines: [] },
      recipientLabel: "Credit to",
      currency: n.currency,
      locale: profile.locale,
      lines: n.lines,
      subtotal: n.subtotal,
      taxTotal: n.taxTotal,
      total: n.total,
      totals: [
        { label: "Subtotal", ...money(n.subtotal) },
        ...(n.discountTotal > 0
          ? [
              {
                label:
                  n.discount?.type === "percent"
                    ? `Discount (${discountLabel(n.discount)})`
                    : "Discount",
                ...money(-n.discountTotal),
              },
            ]
          : []),
        { label: "Tax", ...money(n.taxTotal) },
        { label: "Total credit", ...money(n.total), bold: true },
        ...(n.appliedAmount > 0
          ? [
              {
                label: `Applied to ${n.invoiceNumber ?? "invoice"}`,
                ...money(n.appliedAmount),
              },
            ]
          : []),
        ...(n.refundAmount > 0
          ? [{ label: "Refund due to you", ...money(n.refundAmount) }]
          : []),
      ],
      notes: `Reason: ${n.reason}`,
      ...(await this.profile.documentBranding()),
    })
    return { filename: `${n.number}.pdf`, content }
  }

  async send(
    id: string,
    opts: { to?: string; message?: string | null }
  ): Promise<CreditNote> {
    const n = await this.get(id)
    if (n.status !== "issued")
      throw new ConflictException("Void credit notes can't be sent")
    const to = opts.to ?? (await this.invoices.defaultRecipient(n.clientId))
    if (!to)
      throw new BadRequestException({
        message:
          "This client has no email address. Add one or enter a recipient.",
        code: "no_recipient",
      })
    const profile = await this.profile.get()
    const { filename, content } = await this.pdf(id)
    await this.mail.send(
      documentEmail({
        to,
        portalUrl: await this.portalLinks.documentLink(
          n.clientId,
          to,
          `/invoices/${n.invoiceId}`
        ),
        kind: "Credit note",
        number: n.number,
        workspaceName: profile.name,
        amount: formatMoney(
          { amount: n.total, currency: n.currency },
          profile.locale
        ),
        dueOrValid: n.invoiceNumber ?? undefined,
        message: opts.message,
        replyTo: profile.email,
        pdf: { filename, contentBase64: content.toString("base64") },
      })
    )
    await this.db
      .update(creditNotes)
      .set({ lastSentAt: new Date(), lastSentTo: to })
      .where(and(this.scope(), eq(creditNotes.id, id)))
    await this.audit.record("credit_note.sent", {
      resourceType: "credit_note",
      resourceId: id,
      metadata: { to },
    })
    return this.get(id)
  }
}
