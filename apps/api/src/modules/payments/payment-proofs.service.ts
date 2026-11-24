import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common"
import {
  type ConfirmPaymentProofInput,
  formatMoney,
  PAYMENT_METHOD_FOR_ACCOUNT,
  type PaymentProof,
  type PaymentProofList,
  type PaymentProofStatus,
  type PortalPaymentProof,
  type SubmitPaymentProofInput,
} from "@workspace/contracts"
import {
  clients,
  invoices,
  member,
  paymentAccounts,
  paymentProofs,
  user,
} from "@workspace/db"
import {
  paymentProofRejectedEmail,
  paymentProofSubmittedEmail,
} from "@workspace/emails"
import { and, asc, count, desc, eq, type SQL } from "drizzle-orm"

import { RequestContext } from "../../common/context/request-context.js"
import { offsetOf, orderBy, type PageArgs } from "../../common/pagination.js"
import { ENV, type Env } from "../../core/config/env.js"
import { InjectDb, type Database } from "../../core/database/database.module.js"
import { AuditService } from "../../iam/audit/audit.service.js"
import { MailService } from "../../mail/mail.service.js"
import { FilesService } from "../files/files.service.js"
import { PortalLinksService } from "../portal/portal-links.service.js"
import { WorkspaceProfileService } from "../workspace/workspace-profile.service.js"
import { PaymentsService } from "./payments.service.js"
import { DomainEvents } from "../events/domain-events.service.js"

const PROOF_MAX_BYTES = 2 * 1024 * 1024
const MAX_PENDING_PER_INVOICE = 3

type ProofRow = typeof paymentProofs.$inferSelect

/**
 * Client "I've paid" submissions (screenshot + details) from the client
 * portal. A member reviews each one: confirming records the payment and
 * receipt through the normal payment path; rejecting tells the client why.
 */
@Injectable()
export class PaymentProofsService {
  private readonly logger = new Logger(PaymentProofsService.name)

  constructor(
    @InjectDb() private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly ctx: RequestContext,
    private readonly files: FilesService,
    private readonly payments: PaymentsService,
    private readonly profile: WorkspaceProfileService,
    private readonly mail: MailService,
    private readonly portalLinks: PortalLinksService,
    private readonly audit: AuditService,
    private readonly events: DomainEvents
  ) {}

  private scope(): SQL {
    return eq(paymentProofs.workspaceId, this.ctx.workspaceId)
  }

  private select() {
    return this.db
      .select({
        proof: paymentProofs,
        invoiceNumber: invoices.number,
        clientName: clients.name,
        accountLabel: paymentAccounts.label,
        accountKind: paymentAccounts.kind,
      })
      .from(paymentProofs)
      .innerJoin(invoices, eq(invoices.id, paymentProofs.invoiceId))
      .innerJoin(clients, eq(clients.id, paymentProofs.clientId))
      .leftJoin(
        paymentAccounts,
        eq(paymentAccounts.id, paymentProofs.paymentAccountId)
      )
  }

  private static toDto(r: {
    proof: ProofRow
    invoiceNumber: string | null
    clientName: string
    accountLabel: string | null
    accountKind: "bank" | "mobile_wallet" | "other" | null
  }): PaymentProof {
    const p = r.proof
    return {
      id: p.id,
      invoiceId: p.invoiceId,
      invoiceNumber: r.invoiceNumber,
      clientId: p.clientId,
      clientName: r.clientName,
      amount: p.amount,
      currency: p.currency,
      paidOn: p.paidOn,
      paymentAccountId: p.paymentAccountId,
      paymentAccountLabel: r.accountLabel,
      paymentAccountKind: r.accountKind,
      reference: p.reference,
      note: p.note,
      hasFile: Boolean(p.fileId),
      fileUrl: null,
      status: p.status,
      rejectionReason: p.rejectionReason,
      paymentId: p.paymentId,
      reviewedAt: p.reviewedAt?.toISOString() ?? null,
      submittedEmail: p.submittedEmail,
      createdAt: p.createdAt.toISOString(),
    }
  }

  private async withUrl(
    rows: {
      proof: ProofRow
      invoiceNumber: string | null
      clientName: string
      accountLabel: string | null
      accountKind: "bank" | "mobile_wallet" | "other" | null
    }[]
  ): Promise<PaymentProof[]> {
    return Promise.all(
      rows.map(async (r) => ({
        ...PaymentProofsService.toDto(r),
        fileUrl: await this.files.url(r.proof.fileId),
      }))
    )
  }

  // ── Client portal ───────────────────────────────────

  /**
   * Store a client's proof for an invoice. The caller (PortalService) has
   * already checked the invoice belongs to the signed-in client.
   */
  async submit(
    invoice: {
      id: string
      clientId: string
      number: string
      currency: string
      amountDue: number
      status: string
    },
    input: SubmitPaymentProofInput & { amount: number },
    file: { filename: string; body: Buffer },
    meta: { email: string; ip?: string; userAgent?: string }
  ): Promise<void> {
    if (invoice.status === "void" || invoice.amountDue <= 0)
      throw new ConflictException({
        message: "Nothing is due on this invoice",
        code: "nothing_due",
      })
    if (input.amount > invoice.amountDue)
      throw new BadRequestException({
        message: `That's more than the amount due (${formatMoney({ amount: invoice.amountDue, currency: invoice.currency })})`,
        code: "overpayment",
      })
    const [pending] = await this.db
      .select({ n: count() })
      .from(paymentProofs)
      .where(
        and(
          this.scope(),
          eq(paymentProofs.invoiceId, invoice.id),
          eq(paymentProofs.status, "pending")
        )
      )
    if ((pending?.n ?? 0) >= MAX_PENDING_PER_INVOICE)
      throw new ConflictException({
        message:
          "There are already payments waiting for review on this invoice",
        code: "too_many_pending",
      })
    if (input.paymentAccountId) {
      const [acc] = await this.db
        .select({ id: paymentAccounts.id })
        .from(paymentAccounts)
        .where(
          and(
            eq(paymentAccounts.workspaceId, this.ctx.workspaceId),
            eq(paymentAccounts.id, input.paymentAccountId)
          )
        )
        .limit(1)
      if (!acc) throw new BadRequestException("Unknown payment method")
    }
    const stored = await this.files.uploadImage(
      "payment_proof",
      file.filename,
      file.body,
      PROOF_MAX_BYTES
    )
    const [row] = await this.db
      .insert(paymentProofs)
      .values({
        workspaceId: this.ctx.workspaceId,
        invoiceId: invoice.id,
        clientId: invoice.clientId,
        amount: input.amount,
        currency: invoice.currency,
        paidOn: input.paidOn,
        paymentAccountId: input.paymentAccountId ?? null,
        reference: input.reference ?? null,
        note: input.note ?? null,
        fileId: stored.id,
        submittedEmail: meta.email,
        ipAddress: meta.ip?.slice(0, 100) ?? null,
        userAgent: meta.userAgent?.slice(0, 500) ?? null,
      })
      .returning({ id: paymentProofs.id })
    await this.audit.record("payment_proof.submitted", {
      resourceType: "payment_proof",
      resourceId: row!.id,
      metadata: { invoiceId: invoice.id, amount: input.amount, via: "portal" },
    })
    await this.events.publish("payment_proof.submitted", {
      id: row!.id,
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
      clientId: invoice.clientId,
      amount: input.amount,
      currency: invoice.currency,
      paidOn: input.paidOn,
      reference: input.reference ?? null,
      note: input.note ?? null,
      status: "pending",
    })
    await this.notifyBusiness(invoice, input.amount, input.reference ?? null)
  }

  /** The client's own proofs for an invoice (portal view). */
  async forInvoice(
    invoiceId: string,
    clientId: string
  ): Promise<PortalPaymentProof[]> {
    const rows = await this.db
      .select()
      .from(paymentProofs)
      .where(
        and(
          this.scope(),
          eq(paymentProofs.invoiceId, invoiceId),
          eq(paymentProofs.clientId, clientId)
        )
      )
      .orderBy(desc(paymentProofs.createdAt))
    return rows.map((p) => ({
      id: p.id,
      amount: p.amount,
      currency: p.currency,
      paidOn: p.paidOn,
      reference: p.reference,
      status: p.status,
      rejectionReason: p.rejectionReason,
      createdAt: p.createdAt.toISOString(),
    }))
  }

  /** Business email, else the workspace owners. Never fails the request. */
  private async notifyBusiness(
    invoice: { id: string; clientId: string; number: string; currency: string },
    amount: number,
    reference: string | null
  ) {
    try {
      const profile = await this.profile.get()
      const [client] = await this.db
        .select({ name: clients.name })
        .from(clients)
        .where(eq(clients.id, invoice.clientId))
        .limit(1)
      const to = profile.email
        ? [profile.email]
        : (
            await this.db
              .select({ email: user.email })
              .from(member)
              .innerJoin(user, eq(user.id, member.userId))
              .where(
                and(
                  eq(member.organizationId, this.ctx.workspaceId),
                  eq(member.role, "owner")
                )
              )
          ).map((r) => r.email)
      for (const address of to)
        await this.mail.send(
          paymentProofSubmittedEmail({
            to: address,
            clientName: client?.name ?? "A client",
            invoiceNumber: invoice.number,
            amount: formatMoney(
              { amount, currency: invoice.currency },
              profile.locale
            ),
            reference,
            url: `${this.env.WEB_URL}/${encodeURIComponent(profile.slug)}/invoices/${invoice.id}`,
          })
        )
    } catch (err) {
      this.logger.error({ err }, "Failed to send payment proof notice")
    }
  }

  // ── Members ─────────────────────────────────────────

  async list(
    q: PageArgs & { status?: PaymentProofStatus; invoiceId?: string }
  ): Promise<PaymentProofList> {
    const filters: SQL[] = [this.scope()]
    if (q.status) filters.push(eq(paymentProofs.status, q.status))
    if (q.invoiceId) filters.push(eq(paymentProofs.invoiceId, q.invoiceId))
    const where = and(...filters)
    const [rows, [total]] = await Promise.all([
      this.select()
        .where(where)
        .orderBy(
          ...orderBy(
            q.sort,
            {
              createdAt: paymentProofs.createdAt,
              amount: paymentProofs.amount,
              paidOn: paymentProofs.paidOn,
            },
            paymentProofs.id
          )
        )
        .limit(q.pageSize)
        .offset(offsetOf(q.page, q.pageSize)),
      this.db.select({ n: count() }).from(paymentProofs).where(where),
    ])
    return {
      items: await this.withUrl(rows),
      total: total?.n ?? 0,
      page: q.page,
      pageSize: q.pageSize,
    }
  }

  async get(id: string): Promise<PaymentProof> {
    const [row] = await this.select()
      .where(and(this.scope(), eq(paymentProofs.id, id)))
      .limit(1)
    if (!row) throw new NotFoundException("Payment proof not found")
    return (await this.withUrl([row]))[0]!
  }

  /** The screenshot bytes (members only). */
  async file(id: string) {
    const [row] = await this.db
      .select({ fileId: paymentProofs.fileId })
      .from(paymentProofs)
      .where(and(this.scope(), eq(paymentProofs.id, id)))
      .limit(1)
    if (!row?.fileId) throw new NotFoundException("No screenshot")
    return this.files.read(row.fileId)
  }

  /** Pending proofs for the dashboard: total and the oldest few. */
  async pendingSummary() {
    const where = and(this.scope(), eq(paymentProofs.status, "pending"))
    const [rows, [total]] = await Promise.all([
      this.select().where(where).orderBy(asc(paymentProofs.createdAt)).limit(5),
      this.db.select({ n: count() }).from(paymentProofs).where(where),
    ])
    return {
      count: total?.n ?? 0,
      items: rows.map((r) => ({
        id: r.proof.id,
        invoiceId: r.proof.invoiceId,
        invoiceNumber: r.invoiceNumber,
        clientName: r.clientName,
        amount: r.proof.amount,
        currency: r.proof.currency,
        createdAt: r.proof.createdAt.toISOString(),
      })),
    }
  }

  /**
   * Record the payment (and receipt) from a proof, in one transaction with
   * the proof's status change. The proof row is locked, so a double click
   * can't record the payment twice.
   */
  async confirm(
    id: string,
    input: ConfirmPaymentProofInput
  ): Promise<PaymentProof> {
    const paymentId = await this.db.transaction(async (tx) => {
      const [p] = await tx
        .select({ proof: paymentProofs, accountKind: paymentAccounts.kind })
        .from(paymentProofs)
        .leftJoin(
          paymentAccounts,
          eq(paymentAccounts.id, paymentProofs.paymentAccountId)
        )
        .where(and(this.scope(), eq(paymentProofs.id, id)))
        .for("update", { of: paymentProofs })
        .limit(1)
      if (!p) throw new NotFoundException("Payment proof not found")
      if (p.proof.status !== "pending")
        throw new ConflictException({
          message: `This payment was already ${p.proof.status}`,
          code: "proof_already_reviewed",
        })
      const paymentId = await this.payments.recordInTx(tx, p.proof.invoiceId, {
        amount: input.amount ?? p.proof.amount,
        paidOn: input.paidOn ?? p.proof.paidOn,
        method:
          input.method ??
          (p.accountKind
            ? PAYMENT_METHOD_FOR_ACCOUNT[p.accountKind]
            : "bank_transfer"),
        reference: input.reference ?? p.proof.reference,
        notes: p.proof.note,
      })
      await tx
        .update(paymentProofs)
        .set({
          status: "confirmed",
          paymentId,
          reviewedByUserId: this.ctx.userId,
          reviewedAt: new Date(),
        })
        .where(eq(paymentProofs.id, id))
      return paymentId
    })
    await this.audit.record("payment_proof.confirmed", {
      resourceType: "payment_proof",
      resourceId: id,
      metadata: { paymentId },
    })
    await this.payments.afterRecorded(paymentId)
    if (input.sendReceipt !== false) {
      const proof = await this.get(id)
      try {
        await this.payments.sendReceipt(paymentId, { to: proof.submittedEmail })
      } catch (err) {
        this.logger.warn(`Receipt for proof ${id} not sent: ${String(err)}`)
      }
    }
    return this.get(id)
  }

  async reject(id: string, reason: string): Promise<PaymentProof> {
    const [row] = await this.db
      .update(paymentProofs)
      .set({
        status: "rejected",
        rejectionReason: reason,
        reviewedByUserId: this.ctx.userId,
        reviewedAt: new Date(),
      })
      .where(
        and(
          this.scope(),
          eq(paymentProofs.id, id),
          eq(paymentProofs.status, "pending")
        )
      )
      .returning()
    if (!row) {
      await this.get(id) // 404 if missing
      throw new ConflictException({
        message: "This payment was already reviewed",
        code: "proof_already_reviewed",
      })
    }
    await this.audit.record("payment_proof.rejected", {
      resourceType: "payment_proof",
      resourceId: id,
      metadata: { reason },
    })
    const proof = await this.get(id)
    try {
      const profile = await this.profile.get()
      await this.mail.send(
        paymentProofRejectedEmail({
          to: row.submittedEmail,
          workspaceName: profile.name,
          invoiceNumber: proof.invoiceNumber ?? "",
          amount: formatMoney(
            { amount: row.amount, currency: row.currency },
            profile.locale
          ),
          reason,
          url: await this.portalLinks.documentLink(
            row.clientId,
            row.submittedEmail,
            `/invoices/${row.invoiceId}`
          ),
        })
      )
    } catch (err) {
      this.logger.error({ err }, "Failed to send payment proof rejection")
    }
    return proof
  }
}
