import { createHash } from "node:crypto"

import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common"
import {
  invoiceState,
  type PortalContract,
  type PortalContractSummary,
  type PortalInvoice,
  type PortalInvoiceSummary,
  type PortalMe,
  type PortalQuote,
  type PortalQuoteSummary,
  type PortalReceipt,
  type PortalWorkspace,
  type SubmitPaymentProofInput,
} from "@workspace/contracts"
import {
  portalResponseEmail,
  portalSignInEmail,
  signedContractEmail,
} from "@workspace/emails"

import { EntitlementsService } from "../../billing/entitlements.service.js"
import { RequestContext } from "../../common/context/request-context.js"
import { ENV, type Env } from "../../core/config/env.js"
import { MailService } from "../../mail/mail.service.js"
import { ContractsService } from "../contracts/contracts.service.js"
import { todayIn } from "../documents/party-snapshot.js"
import { InvoicesService } from "../invoices/invoices.service.js"
import { PaymentAccountsService } from "../payment-accounts/payment-accounts.service.js"
import { PaymentProofsService } from "../payments/payment-proofs.service.js"
import { PaymentsService } from "../payments/payments.service.js"
import { QuotesService } from "../quotes/quotes.service.js"
import { WorkspaceProfileService } from "../workspace/workspace-profile.service.js"
import { portalUrl } from "./portal-links.service.js"
import { PortalRepository } from "./portal.repository.js"
import {
  hashPortalToken,
  newPortalToken,
  SESSION_TTL_MS,
  SIGN_IN_TTL_MS,
} from "./portal-tokens.js"

type Kind = "quote" | "invoice" | "contract" | "payment"
type Meta = { ip?: string; userAgent?: string }

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex")

/**
 * The client portal: clients of a workspace sign in with an emailed link and
 * see their quotes, contracts, invoices and receipts (never drafts). Document
 * reads go through the normal services; this layer checks the document
 * belongs to the signed-in client and narrows the shapes.
 */
@Injectable()
export class PortalService {
  private readonly logger = new Logger(PortalService.name)

  constructor(
    private readonly repo: PortalRepository,
    private readonly ctx: RequestContext,
    @Inject(ENV) private readonly env: Env,
    private readonly mail: MailService,
    private readonly profile: WorkspaceProfileService,
    private readonly entitlements: EntitlementsService,
    private readonly quotes: QuotesService,
    private readonly invoices: InvoicesService,
    private readonly contracts: ContractsService,
    private readonly payments: PaymentsService,
    private readonly paymentAccounts: PaymentAccountsService,
    private readonly paymentProofs: PaymentProofsService
  ) {}

  // ── Public ───────────────────────────────────────────

  /** Branding for the sign-in page; 404 for unknown workspaces. */
  async workspace(slug: string): Promise<PortalWorkspace> {
    const ws = await this.repo.workspaceBySlug(slug)
    if (!ws) throw new NotFoundException("Portal not found")
    this.ctx.set({ workspaceId: ws.id })
    return this.branding()
  }

  private async branding(): Promise<PortalWorkspace> {
    const [profile, branded] = await Promise.all([
      this.profile.get(),
      this.entitlements.hasFeature("customBranding"),
    ])
    return {
      name: profile.name,
      slug: profile.slug,
      logoUrl: branded ? profile.logoUrl : null,
      brandColor: branded ? profile.brandColor : null,
      showBadge: !branded,
      email: profile.email,
    }
  }

  /**
   * Email a sign-in link if `email` belongs to a client (or contact) of the
   * workspace. Always "succeeds" so the form doesn't reveal who's a client.
   */
  async requestSignIn(slug: string, rawEmail: string): Promise<void> {
    const email = rawEmail.trim().toLowerCase()
    const ws = await this.repo.workspaceBySlug(slug)
    if (!ws) return
    const matches = await this.repo.clientsForEmail(ws.id, email)
    if (matches.length === 0) return
    if (
      (await this.repo.recentSignIns(
        email,
        new Date(Date.now() - 15 * 60_000)
      )) >= 5
    )
      return
    const links: { clientName: string; url: string }[] = []
    for (const c of matches) {
      const { token, hash } = newPortalToken()
      await this.repo.insertToken({
        workspaceId: ws.id,
        clientId: c.id,
        email,
        kind: "sign_in",
        tokenHash: hash,
        expiresAt: new Date(Date.now() + SIGN_IN_TTL_MS),
      })
      links.push({
        clientName: c.name,
        url: portalUrl(this.env.WEB_URL, ws.slug, token),
      })
    }
    await this.mail.send(
      portalSignInEmail({ to: email, workspaceName: ws.name, links })
    )
  }

  /** Exchange an emailed token for a session; returns the cookie value. */
  async createSession(
    token: string,
    meta: { ip?: string; userAgent?: string }
  ): Promise<{ sessionToken: string; workspaceSlug: string } | null> {
    const t = await this.repo.redeemToken(hashPortalToken(token))
    if (!t) return null
    const ws = await this.repo.workspaceById(t.workspaceId)
    if (!ws) return null
    const session = newPortalToken()
    await this.repo.createSession({
      workspaceId: t.workspaceId,
      clientId: t.clientId,
      email: t.email,
      tokenHash: session.hash,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      ipAddress: meta.ip?.slice(0, 100) ?? null,
      userAgent: meta.userAgent?.slice(0, 500) ?? null,
    })
    return { sessionToken: session.token, workspaceSlug: ws.slug }
  }

  async signOut(sessionToken: string | null) {
    if (sessionToken)
      await this.repo.deleteSession(hashPortalToken(sessionToken))
  }

  // ── Signed in (PortalGuard has set the context) ──────

  private get scope() {
    return { ws: this.ctx.workspaceId, client: this.ctx.portalClientId }
  }

  private async today() {
    return todayIn((await this.profile.get()).timezone)
  }

  async me(): Promise<PortalMe> {
    const { ws, client } = this.scope
    const [workspace, name, invoices, quotes, contracts] = await Promise.all([
      this.branding(),
      this.repo.clientName(ws, client),
      this.listInvoices(),
      this.listQuotes(),
      this.listContracts(),
    ])
    const open = invoices.filter((i) =>
      ["open", "overdue", "partially_paid"].includes(i.status)
    )
    const due = new Map<string, number>()
    for (const i of open)
      due.set(i.currency, (due.get(i.currency) ?? 0) + i.amountDue)
    return {
      workspace,
      client: { id: client, name: name ?? "" },
      email: this.ctx.portalEmail,
      summary: {
        openInvoices: open.length,
        amountDue: [...due.entries()].map(([currency, amount]) => ({
          currency,
          amount,
        })),
        overdueInvoices: open.filter((i) => i.status === "overdue").length,
        quotesAwaitingReply: quotes.filter((q) => q.status === "sent").length,
        contractsAwaitingSignature: contracts.filter((c) => c.status === "sent")
          .length,
      },
    }
  }

  async listQuotes(): Promise<PortalQuoteSummary[]> {
    const { ws, client } = this.scope
    const today = await this.today()
    return (await this.repo.listQuotes(ws, client)).map((q) => ({
      ...q,
      number: q.number ?? "",
      status:
        q.status === "sent" && q.validUntil !== null && q.validUntil < today
          ? "expired"
          : (q.status as PortalQuoteSummary["status"]),
    }))
  }

  async listInvoices(): Promise<PortalInvoiceSummary[]> {
    const { ws, client } = this.scope
    const today = await this.today()
    return (await this.repo.listInvoices(ws, client)).map((i) => {
      const s = invoiceState(i, today)
      return {
        id: i.id,
        number: i.number ?? "",
        title: i.title,
        status: s.displayStatus as PortalInvoiceSummary["status"],
        issueDate: i.issueDate,
        dueDate: i.dueDate,
        currency: i.currency,
        total: i.total,
        amountPaid: i.amountPaid,
        amountCredited: i.amountCredited,
        amountDue:
          i.status === "void"
            ? 0
            : Math.max(0, i.total - i.amountPaid - i.amountCredited),
      }
    })
  }

  async listContracts(): Promise<PortalContractSummary[]> {
    const { ws, client } = this.scope
    return (await this.repo.listContracts(ws, client)).map((c) => ({
      ...c,
      number: c.number ?? "",
      status: c.status as PortalContractSummary["status"],
      sentAt: c.sentAt?.toISOString() ?? null,
    }))
  }

  async listReceipts(invoiceId?: string): Promise<PortalReceipt[]> {
    const { ws, client } = this.scope
    return this.repo.listReceipts(ws, client, invoiceId)
  }

  /** 404 unless the document exists, isn't a draft and is this client's. */
  private async own(kind: Kind, id: string) {
    const { ws, client } = this.scope
    if ((await this.repo.documentClient(kind, ws, id)) !== client)
      throw new NotFoundException("Not found")
  }

  async quote(id: string): Promise<PortalQuote> {
    await this.own("quote", id)
    const q = await this.quotes.get(id)
    return {
      id: q.id,
      number: q.number ?? "",
      title: q.title,
      status: q.isExpired ? "expired" : (q.status as PortalQuote["status"]),
      issueDate: q.issueDate,
      validUntil: q.validUntil,
      currency: q.currency,
      total: q.total,
      subtotal: q.subtotal,
      taxTotal: q.taxTotal,
      notes: q.notes,
      terms: q.terms,
      lines: q.lines,
      issuer: q.issuerSnapshot,
      client: q.clientSnapshot,
      acceptedAt: q.acceptedAt,
      declinedAt: q.declinedAt,
      respondedByName: q.respondedByName,
      declineReason: q.declineReason,
    }
  }

  async invoice(id: string): Promise<PortalInvoice> {
    await this.own("invoice", id)
    const [i, receipts, proofs] = await Promise.all([
      this.invoices.get(id),
      this.listReceipts(id),
      this.paymentProofs.forInvoice(id, this.ctx.portalClientId),
    ])
    const due = i.status === "void" ? 0 : i.amountDue
    const accounts =
      due > 0 ? await this.paymentAccounts.forCurrencyDto(i.currency) : []
    return {
      id: i.id,
      number: i.number ?? "",
      title: i.title,
      status: i.displayStatus as PortalInvoice["status"],
      issueDate: i.issueDate,
      dueDate: i.dueDate,
      currency: i.currency,
      total: i.total,
      amountPaid: i.amountPaid,
      amountCredited: i.amountCredited,
      amountDue: i.status === "void" ? 0 : i.amountDue,
      subtotal: i.subtotal,
      taxTotal: i.taxTotal,
      notes: i.notes,
      terms: i.terms,
      lines: i.lines,
      issuer: i.issuerSnapshot,
      client: i.clientSnapshot,
      receipts,
      paymentAccounts: accounts.map((a) => ({
        id: a.id,
        kind: a.kind,
        label: a.label,
        accountName: a.accountName,
        accountNumber: a.accountNumber,
        instructions: a.instructions,
        qrUrl: a.qrUrl,
      })),
      paymentProofs: proofs,
    }
  }

  async contract(id: string): Promise<PortalContract> {
    await this.own("contract", id)
    const c = await this.contracts.get(id)
    return {
      id: c.id,
      number: c.number ?? "",
      title: c.title,
      status: c.status as PortalContract["status"],
      effectiveDate: c.effectiveDate,
      endDate: c.endDate,
      sentAt: c.sentAt,
      signedAt: c.signedAt,
      body: c.renderedBody,
      signedByName: c.signedByName,
      signedVia: c.signedVia,
      declinedAt: c.declinedAt,
      declineReason: c.declineReason,
      voidedAt: c.voidedAt,
      issuer: c.issuerSnapshot,
      client: c.clientSnapshot,
    }
  }

  async pdf(kind: Kind, id: string) {
    await this.own(kind, id)
    switch (kind) {
      case "quote":
        return this.quotes.pdf(id)
      case "invoice":
        return this.invoices.pdf(id)
      case "contract":
        return this.contracts.pdf(id)
      case "payment":
        return this.payments.receiptPdf(id)
    }
  }

  // ── Responses (accept / decline / sign) ──────────────

  /** What the client saw, for the evidence record. */
  private quoteHash(q: Awaited<ReturnType<QuotesService["get"]>>) {
    return sha256(
      JSON.stringify({
        number: q.number,
        currency: q.currency,
        validUntil: q.validUntil,
        subtotal: q.subtotal,
        taxTotal: q.taxTotal,
        total: q.total,
        lines: q.lines.map((l) => [
          l.description,
          l.quantity,
          l.unitPrice,
          l.taxRateBps,
          l.amount,
        ]),
        notes: q.notes,
        terms: q.terms,
      })
    )
  }

  private async record(
    doc: { type: "quote" | "contract"; id: string; number: string | null },
    action: "accepted" | "declined" | "signed",
    hash: string,
    meta: Meta,
    extra: { name?: string | null; reason?: string | null }
  ) {
    await this.repo.insertResponse({
      workspaceId: this.ctx.workspaceId,
      clientId: this.ctx.portalClientId,
      documentType: doc.type,
      documentId: doc.id,
      documentNumber: doc.number,
      action,
      name: extra.name ?? null,
      email: this.ctx.portalEmail,
      reason: extra.reason ?? null,
      documentHash: hash,
      ipAddress: meta.ip?.slice(0, 100) ?? null,
      userAgent: meta.userAgent?.slice(0, 500) ?? null,
    })
  }

  /** Email the business (its email, else the owners). Never fails the response. */
  private async notify(
    kind: "Quote" | "Contract",
    doc: { id: string; number: string | null },
    action: "accepted" | "declined" | "signed",
    name: string | null,
    reason?: string | null
  ) {
    try {
      const [profile, clientName] = await Promise.all([
        this.profile.get(),
        this.repo.clientName(this.ctx.workspaceId, this.ctx.portalClientId),
      ])
      const to = profile.email
        ? [profile.email]
        : await this.repo.ownerEmails(this.ctx.workspaceId)
      const path = kind === "Quote" ? "quotes" : "contracts"
      for (const address of to)
        await this.mail.send(
          portalResponseEmail({
            to: address,
            clientName: clientName ?? "Your client",
            kind,
            number: doc.number ?? "",
            action,
            name,
            reason,
            url: `${this.env.WEB_URL}/${encodeURIComponent(profile.slug)}/${path}/${doc.id}`,
          })
        )
    } catch (err) {
      this.logger.error({ err }, "Failed to send portal response notice")
    }
  }

  async acceptQuote(id: string, name: string, meta: Meta) {
    await this.own("quote", id)
    const q = await this.quotes.get(id)
    if (q.isExpired)
      throw new ConflictException({
        message: `This quote expired${q.validUntil ? ` on ${q.validUntil}` : ""}. Ask for an updated one.`,
        code: "quote_expired",
      })
    if (q.status !== "sent")
      throw new ConflictException({
        message: "This quote has already been answered",
        code: "quote_not_open",
      })
    await this.quotes.respond(id, "accepted", {
      via: "portal",
      name,
      email: this.ctx.portalEmail,
    })
    await this.record(
      { type: "quote", id, number: q.number },
      "accepted",
      this.quoteHash(q),
      meta,
      { name }
    )
    await this.notify("Quote", q, "accepted", name)
    return this.quote(id)
  }

  async declineQuote(id: string, reason: string | null, meta: Meta) {
    await this.own("quote", id)
    const q = await this.quotes.get(id)
    if (q.status !== "sent")
      throw new ConflictException({
        message: "This quote has already been answered",
        code: "quote_not_open",
      })
    await this.quotes.respond(id, "declined", {
      via: "portal",
      reason,
      email: this.ctx.portalEmail,
    })
    await this.record(
      { type: "quote", id, number: q.number },
      "declined",
      this.quoteHash(q),
      meta,
      { reason }
    )
    await this.notify("Quote", q, "declined", null, reason)
    return this.quote(id)
  }

  async signContract(id: string, name: string, meta: Meta) {
    await this.own("contract", id)
    const c = await this.contracts.get(id)
    if (c.status !== "sent")
      throw new ConflictException({
        message: "This contract isn't waiting for a signature",
        code: "contract_not_open",
      })
    // The status change is the lock (a second click gets a 409); the
    // evidence is written before the PDF, whose certificate page reads it.
    await this.contracts.sign(
      id,
      { signedByName: name },
      { via: "portal", email: this.ctx.portalEmail }
    )
    await this.record(
      { type: "contract", id, number: c.number },
      "signed",
      sha256(c.renderedBody),
      meta,
      { name }
    )
    await this.notify("Contract", c, "signed", name)
    try {
      const [{ filename, content }, profile] = await Promise.all([
        this.contracts.pdf(id),
        this.profile.get(),
      ])
      await this.mail.send(
        signedContractEmail({
          to: this.ctx.portalEmail,
          workspaceName: profile.name,
          number: c.number ?? "",
          title: c.title,
          signedByName: name,
          pdf: { filename, contentBase64: content.toString("base64") },
        })
      )
    } catch (err) {
      this.logger.error({ err }, "Failed to send signed contract copy")
    }
    return this.contract(id)
  }

  async declineContract(id: string, reason: string | null, meta: Meta) {
    await this.own("contract", id)
    const c = await this.contracts.get(id)
    if (c.status !== "sent")
      throw new ConflictException({
        message: "This contract isn't waiting for a signature",
        code: "contract_not_open",
      })
    await this.contracts.decline(id, {
      via: "portal",
      reason,
      email: this.ctx.portalEmail,
    })
    await this.record(
      { type: "contract", id, number: c.number },
      "declined",
      sha256(c.renderedBody),
      meta,
      { reason }
    )
    await this.notify("Contract", c, "declined", null, reason)
    return this.contract(id)
  }

  /** "I've paid": the client uploads a screenshot and the payment details. */
  async submitPaymentProof(
    id: string,
    input: SubmitPaymentProofInput & { amount: number },
    file: { filename: string; body: Buffer },
    meta: Meta
  ) {
    await this.own("invoice", id)
    const i = await this.invoices.get(id)
    await this.paymentProofs.submit(
      {
        id,
        clientId: i.clientId,
        number: i.number ?? "",
        currency: i.currency,
        amountDue: i.status === "void" ? 0 : i.amountDue,
        status: i.status,
      },
      input,
      file,
      { email: this.ctx.portalEmail, ...meta }
    )
    return this.invoice(id)
  }
}
