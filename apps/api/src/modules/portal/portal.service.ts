import { Inject, Injectable, NotFoundException } from "@nestjs/common"
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
} from "@workspace/contracts"
import { portalSignInEmail } from "@workspace/emails"

import { EntitlementsService } from "../../billing/entitlements.service.js"
import { RequestContext } from "../../common/context/request-context.js"
import { ENV, type Env } from "../../core/config/env.js"
import { MailService } from "../../mail/mail.service.js"
import { ContractsService } from "../contracts/contracts.service.js"
import { todayIn } from "../documents/party-snapshot.js"
import { InvoicesService } from "../invoices/invoices.service.js"
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

/**
 * The client portal: clients of a workspace sign in with an emailed link and
 * see their quotes, contracts, invoices and receipts (never drafts). Document
 * reads go through the normal services; this layer checks the document
 * belongs to the signed-in client and narrows the shapes.
 */
@Injectable()
export class PortalService {
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
    private readonly payments: PaymentsService
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
        amountDue:
          i.status === "void" ? 0 : Math.max(0, i.total - i.amountPaid),
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
    }
  }

  async invoice(id: string): Promise<PortalInvoice> {
    await this.own("invoice", id)
    const [i, receipts] = await Promise.all([
      this.invoices.get(id),
      this.listReceipts(id),
    ])
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
      amountDue: i.status === "void" ? 0 : i.amountDue,
      subtotal: i.subtotal,
      taxTotal: i.taxTotal,
      notes: i.notes,
      terms: i.terms,
      lines: i.lines,
      issuer: i.issuerSnapshot,
      client: i.clientSnapshot,
      receipts,
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
      declinedAt: c.declinedAt,
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
}
