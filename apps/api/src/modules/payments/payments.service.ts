import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common"
import {
  formatMoney,
  PAYMENT_METHOD_LABELS,
  type Payment,
  type PaymentList,
  type PaymentStatus,
  type RecordPaymentInput,
} from "@workspace/contracts"
import { documentEmail } from "@workspace/emails"

import { type PageArgs } from "../../common/pagination.js"
import type { Transaction } from "@workspace/db"

import { RequestContext } from "../../common/context/request-context.js"
import { AuditService } from "../../iam/audit/audit.service.js"
import { MailService } from "../../mail/mail.service.js"
import { PortalLinksService } from "../portal/portal-links.service.js"
import { ClientsRepository } from "../clients/clients.repository.js"
import { DocumentNumberingService } from "../documents/document-numbering.service.js"
import { renderDocumentPdf } from "../documents/document-pdf.js"
import {
  formatDocDate,
  partySnapshot,
  todayIn,
} from "../documents/party-snapshot.js"
import { InvoicesRepository } from "../invoices/invoices.repository.js"
import { WorkspaceProfileService } from "../workspace/workspace-profile.service.js"
import {
  PaymentsRepository,
  type PaymentWithRefs,
} from "./payments.repository.js"
import { WebhooksService } from "../webhooks/webhooks.service.js"
import { InvoicesService } from "../invoices/invoices.service.js"

export function toPaymentDto(p: PaymentWithRefs): Payment {
  return {
    id: p.id,
    invoiceId: p.invoiceId,
    invoiceNumber: p.invoiceNumber,
    clientId: p.clientId,
    clientName: p.clientName,
    amount: p.amount,
    currency: p.currency,
    paidOn: p.paidOn,
    method: p.method,
    reference: p.reference,
    notes: p.notes,
    status: p.status,
    refundedAt: p.refundedAt?.toISOString() ?? null,
    refundReason: p.refundReason,
    receiptId: p.receipt?.id ?? null,
    receiptNumber: p.receipt?.number ?? null,
    receiptLastSentAt: p.receipt?.lastSentAt?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
  }
}

/**
 * Payments against issued invoices. Recording and refunding lock the invoice
 * row (SELECT … FOR UPDATE) so concurrent payments can't overpay, and keep
 * invoices.amount_paid in sync inside the same transaction. Every payment
 * gets a receipt numbered in that transaction.
 */
@Injectable()
export class PaymentsService {
  constructor(
    private readonly repo: PaymentsRepository,
    private readonly invoices: InvoicesRepository,
    private readonly clients: ClientsRepository,
    private readonly profile: WorkspaceProfileService,
    private readonly numbering: DocumentNumberingService,
    private readonly ctx: RequestContext,
    private readonly mail: MailService,
    private readonly portalLinks: PortalLinksService,
    private readonly audit: AuditService,
    private readonly invoicesService: InvoicesService,
    private readonly webhooks: WebhooksService
  ) {}

  async list(
    query: PageArgs & {
      invoiceId?: string
      clientId?: string
      status?: PaymentStatus
      q?: string
    }
  ): Promise<PaymentList> {
    const { items, total } = await this.repo.list(query)
    return {
      items: items.map(toPaymentDto),
      total,
      page: query.page,
      pageSize: query.pageSize,
    }
  }

  async get(id: string): Promise<Payment> {
    return toPaymentDto(await this.require(id))
  }

  /**
   * Record a payment inside the caller's transaction (locks the invoice,
   * checks the balance, numbers the receipt). Returns the payment id.
   * Used by `record` and by confirming a client's proof of payment.
   */
  async recordInTx(
    tx: Transaction,
    invoiceId: string,
    input: RecordPaymentInput
  ): Promise<string> {
    const profile = await this.profile.get()
    const invoice = await this.invoices.findById(invoiceId, tx, {
      forUpdate: true,
    })
    if (!invoice) throw new NotFoundException("Invoice not found")
    if (invoice.status !== "issued") {
      throw new ConflictException(
        "Payments can only be recorded on issued invoices"
      )
    }
    const due = invoice.total - invoice.amountPaid - invoice.amountCredited
    if (due <= 0)
      throw new ConflictException({
        message: "This invoice is already paid",
        code: "invoice_paid",
      })
    if (input.amount > due) {
      throw new BadRequestException({
        message: `Amount exceeds the balance due (${formatMoney({ amount: due, currency: invoice.currency }, profile.locale)})`,
        code: "overpayment",
      })
    }
    const client = await this.clients.findById(invoice.clientId)

    const payment = await this.repo.insertPayment(tx, {
      invoiceId,
      clientId: invoice.clientId,
      amount: input.amount,
      currency: invoice.currency,
      paidOn: input.paidOn ?? todayIn(profile.timezone),
      method: input.method ?? "bank_transfer",
      reference: input.reference ?? null,
      notes: input.notes ?? null,
      recordedBy: this.ctx.userId,
    })
    await this.invoices.update(tx, invoiceId, {
      amountPaid: invoice.amountPaid + input.amount,
    })
    await this.repo.insertReceipt(tx, {
      paymentId: payment.id,
      number: await this.numbering.next(tx, "receipt"),
      balanceAfter: due - input.amount,
      clientSnapshot:
        invoice.clientSnapshot ??
        (client
          ? partySnapshot(client)
          : { name: invoice.clientName, addressLines: [] }),
      issuerSnapshot: invoice.issuerSnapshot ?? partySnapshot(profile),
    })
    return payment.id
  }

  async record(invoiceId: string, input: RecordPaymentInput): Promise<Payment> {
    const paymentId = await this.repo.database.transaction((tx) =>
      this.recordInTx(tx, invoiceId, input)
    )
    await this.audit.record("payment.recorded", {
      resourceType: "payment",
      resourceId: paymentId,
      metadata: { invoiceId, amount: input.amount },
    })
    return this.afterRecorded(paymentId)
  }

  /**
   * Webhooks for a just-committed payment: `payment.recorded`, plus
   * `invoice.paid` when it settled the invoice.
   */
  async afterRecorded(paymentId: string): Promise<Payment> {
    const payment = await this.get(paymentId)
    await this.webhooks.emit("payment.recorded", payment)
    const invoice = await this.invoicesService
      .get(payment.invoiceId)
      .catch(() => null)
    if (invoice && invoice.amountDue <= 0)
      await this.webhooks.emit("invoice.paid", invoice)
    return payment
  }

  async refund(id: string, reason: string): Promise<Payment> {
    await this.repo.database.transaction(async (tx) => {
      const payment = await this.repo.findById(id, tx, { forUpdate: true })
      if (!payment) throw new NotFoundException("Payment not found")
      if (payment.status === "refunded")
        throw new ConflictException("Payment was already refunded")
      const invoice = await this.invoices.findById(payment.invoiceId, tx, {
        forUpdate: true,
      })
      if (!invoice) throw new NotFoundException("Invoice not found")

      await this.repo.updatePayment(tx, id, {
        status: "refunded",
        refundedAt: new Date(),
        refundReason: reason,
      })
      await this.invoices.update(tx, invoice.id, {
        amountPaid: Math.max(0, invoice.amountPaid - payment.amount),
      })
      if (payment.receipt)
        await this.repo.updateReceipt(tx, payment.receipt.id, {
          voidedAt: new Date(),
        })
    })
    await this.audit.record("payment.refunded", {
      resourceType: "payment",
      resourceId: id,
      metadata: { reason },
    })
    return this.get(id)
  }

  async receiptPdf(
    paymentId: string
  ): Promise<{ filename: string; content: Buffer }> {
    const payment = await this.require(paymentId)
    const receipt = payment.receipt
    if (!receipt) throw new NotFoundException("This payment has no receipt")
    const profile = await this.profile.get()
    const content = await renderDocumentPdf({
      title: "Receipt",
      number: receipt.number,
      stamp: receipt.voidedAt ? "REFUNDED" : "PAID",
      meta: [
        { label: "Receipt", value: receipt.number },
        {
          label: "Paid on",
          value: formatDocDate(payment.paidOn, profile.locale),
        },
        { label: "Method", value: PAYMENT_METHOD_LABELS[payment.method] },
        ...(payment.invoiceNumber
          ? [{ label: "Invoice", value: payment.invoiceNumber }]
          : []),
      ],
      issuer: receipt.issuerSnapshot,
      recipient: receipt.clientSnapshot,
      recipientLabel: "Received from",
      currency: payment.currency,
      locale: profile.locale,
      lines: [
        {
          description:
            `Payment for invoice ${payment.invoiceNumber ?? ""}${payment.reference ? ` (ref. ${payment.reference})` : ""}`.trim(),
          quantity: 1,
          unitPrice: payment.amount,
          taxRateBps: 0,
          amount: payment.amount,
        },
      ],
      subtotal: payment.amount,
      taxTotal: 0,
      total: payment.amount,
      totals: [
        { label: "Amount received", amount: payment.amount, bold: true },
        { label: "Balance remaining", amount: receipt.balanceAfter },
      ],
      notes:
        payment.status === "refunded"
          ? `Refunded: ${payment.refundReason ?? ""}`
          : payment.notes,
      ...(await this.profile.documentBranding()),
    })
    return { filename: `${receipt.number}.pdf`, content }
  }

  async sendReceipt(
    paymentId: string,
    opts: { to?: string; message?: string | null }
  ): Promise<Payment> {
    const payment = await this.require(paymentId)
    if (!payment.receipt)
      throw new NotFoundException("This payment has no receipt")
    if (payment.status === "refunded")
      throw new ConflictException("Refunded payments' receipts can't be sent")
    let to = opts.to
    if (!to) {
      const [client, contacts] = await Promise.all([
        this.clients.findById(payment.clientId),
        this.clients.listContacts(payment.clientId),
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
    const { filename, content } = await this.receiptPdf(paymentId)
    await this.mail.send(
      documentEmail({
        to,
        portalUrl: await this.portalLinks.documentLink(
          payment.clientId,
          to,
          `/invoices/${payment.invoiceId}`
        ),
        kind: "Receipt",
        number: payment.receipt.number,
        workspaceName: profile.name,
        amount: formatMoney(
          { amount: payment.amount, currency: payment.currency },
          profile.locale
        ),
        dueOrValid: formatDocDate(payment.paidOn, profile.locale),
        message: opts.message,
        replyTo: profile.email,
        pdf: { filename, contentBase64: content.toString("base64") },
      })
    )
    await this.repo.updateReceipt(this.repo.database, payment.receipt.id, {
      lastSentAt: new Date(),
      lastSentTo: to,
    })
    await this.audit.record("receipt.sent", {
      resourceType: "payment",
      resourceId: paymentId,
      metadata: { to },
    })
    return this.get(paymentId)
  }

  private async require(id: string) {
    const payment = await this.repo.findById(id)
    if (!payment) throw new NotFoundException("Payment not found")
    return payment
  }
}
