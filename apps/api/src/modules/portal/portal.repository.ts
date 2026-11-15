import { Injectable } from "@nestjs/common"
import {
  clientContacts,
  clients,
  contracts,
  invoices,
  member,
  organization,
  payments,
  portalResponses,
  portalSessions,
  portalTokens,
  quotes,
  receipts,
  user,
} from "@workspace/db"
import {
  and,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNull,
  ne,
  or,
  sql,
} from "drizzle-orm"

import { InjectDb, type Database } from "../../core/database/database.module.js"

/**
 * Portal queries. Unlike other repositories these take the workspace and
 * client explicitly: the portal has no member, and every query is scoped to
 * the signed-in client of the session's workspace.
 */
@Injectable()
export class PortalRepository {
  constructor(@InjectDb() private readonly db: Database) {}

  async workspaceBySlug(slug: string) {
    const [row] = await this.db
      .select({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
      })
      .from(organization)
      .where(eq(organization.slug, slug))
      .limit(1)
    return row ?? null
  }

  async workspaceById(id: string) {
    const [row] = await this.db
      .select({ slug: organization.slug })
      .from(organization)
      .where(eq(organization.id, id))
      .limit(1)
    return row ?? null
  }

  /** Clients of a workspace whose own or a contact's email is `email`. */
  async clientsForEmail(workspaceId: string, email: string) {
    const contactMatch = this.db
      .select({ id: clientContacts.clientId })
      .from(clientContacts)
      .where(sql`lower(${clientContacts.email}) = ${email}`)
    return this.db
      .select({ id: clients.id, name: clients.name })
      .from(clients)
      .where(
        and(
          eq(clients.workspaceId, workspaceId),
          isNull(clients.deletedAt),
          or(
            sql`lower(${clients.email}) = ${email}`,
            inArray(clients.id, contactMatch)
          )
        )
      )
      .orderBy(clients.name)
      .limit(10)
  }

  async clientName(workspaceId: string, clientId: string) {
    const [row] = await this.db
      .select({ name: clients.name })
      .from(clients)
      .where(
        and(eq(clients.workspaceId, workspaceId), eq(clients.id, clientId))
      )
      .limit(1)
    return row?.name ?? null
  }

  /** Sign-in links sent to `email` recently (rate limit). */
  async recentSignIns(email: string, since: Date) {
    const [row] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(portalTokens)
      .where(
        and(
          eq(portalTokens.email, email),
          eq(portalTokens.kind, "sign_in"),
          gte(portalTokens.createdAt, since)
        )
      )
    return row?.n ?? 0
  }

  async insertToken(values: typeof portalTokens.$inferInsert) {
    await this.db.insert(portalTokens).values(values)
  }

  /**
   * Redeem a token: sign-in tokens are claimed once (atomically); link
   * tokens can be used until they expire.
   */
  async redeemToken(hash: string) {
    const now = new Date()
    const [token] = await this.db
      .select()
      .from(portalTokens)
      .where(
        and(eq(portalTokens.tokenHash, hash), gt(portalTokens.expiresAt, now))
      )
      .limit(1)
    if (!token) return null
    if (token.kind === "sign_in") {
      const claimed = await this.db
        .update(portalTokens)
        .set({ usedAt: now })
        .where(and(eq(portalTokens.id, token.id), isNull(portalTokens.usedAt)))
        .returning({ id: portalTokens.id })
      if (claimed.length === 0) return null
    }
    return token
  }

  async createSession(values: typeof portalSessions.$inferInsert) {
    await this.db.insert(portalSessions).values(values)
  }

  async findSession(hash: string) {
    const [row] = await this.db
      .select()
      .from(portalSessions)
      .where(
        and(
          eq(portalSessions.tokenHash, hash),
          gt(portalSessions.expiresAt, new Date())
        )
      )
      .limit(1)
    return row ?? null
  }

  async touchSession(id: string) {
    await this.db
      .update(portalSessions)
      .set({ lastSeenAt: new Date() })
      .where(eq(portalSessions.id, id))
  }

  async deleteSession(hash: string) {
    await this.db
      .delete(portalSessions)
      .where(eq(portalSessions.tokenHash, hash))
  }

  // ── Documents (never drafts) ─────────────────────────

  listQuotes(workspaceId: string, clientId: string) {
    return this.db
      .select({
        id: quotes.id,
        number: quotes.number,
        title: quotes.title,
        status: quotes.status,
        issueDate: quotes.issueDate,
        validUntil: quotes.validUntil,
        currency: quotes.currency,
        total: quotes.total,
      })
      .from(quotes)
      .where(
        and(
          eq(quotes.workspaceId, workspaceId),
          eq(quotes.clientId, clientId),
          ne(quotes.status, "draft")
        )
      )
      .orderBy(desc(quotes.issueDate), desc(quotes.id))
      .limit(500)
  }

  listInvoices(workspaceId: string, clientId: string) {
    return this.db
      .select({
        id: invoices.id,
        number: invoices.number,
        title: invoices.title,
        status: invoices.status,
        issueDate: invoices.issueDate,
        dueDate: invoices.dueDate,
        currency: invoices.currency,
        total: invoices.total,
        amountPaid: invoices.amountPaid,
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.workspaceId, workspaceId),
          eq(invoices.clientId, clientId),
          ne(invoices.status, "draft")
        )
      )
      .orderBy(desc(invoices.issueDate), desc(invoices.id))
      .limit(500)
  }

  listContracts(workspaceId: string, clientId: string) {
    return this.db
      .select({
        id: contracts.id,
        number: contracts.number,
        title: contracts.title,
        status: contracts.status,
        effectiveDate: contracts.effectiveDate,
        endDate: contracts.endDate,
        sentAt: contracts.sentAt,
        signedAt: contracts.signedAt,
      })
      .from(contracts)
      .where(
        and(
          eq(contracts.workspaceId, workspaceId),
          eq(contracts.clientId, clientId),
          ne(contracts.status, "draft")
        )
      )
      .orderBy(desc(contracts.sentAt), desc(contracts.id))
      .limit(500)
  }

  /** Payments with a receipt, optionally for one invoice. */
  listReceipts(workspaceId: string, clientId: string, invoiceId?: string) {
    return this.db
      .select({
        id: payments.id,
        receiptNumber: receipts.number,
        invoiceId: payments.invoiceId,
        invoiceNumber: invoices.number,
        amount: payments.amount,
        currency: payments.currency,
        paidOn: payments.paidOn,
        method: payments.method,
        status: payments.status,
      })
      .from(payments)
      .innerJoin(receipts, eq(receipts.paymentId, payments.id))
      .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
      .where(
        and(
          eq(payments.workspaceId, workspaceId),
          eq(payments.clientId, clientId),
          invoiceId ? eq(payments.invoiceId, invoiceId) : undefined
        )
      )
      .orderBy(desc(payments.paidOn), desc(payments.id))
      .limit(500)
  }

  /** Which client a document belongs to (null when missing or a draft). */
  async documentClient(
    kind: "quote" | "invoice" | "contract" | "payment",
    workspaceId: string,
    id: string
  ): Promise<string | null> {
    const table = {
      quote: quotes,
      invoice: invoices,
      contract: contracts,
      payment: payments,
    }[kind]
    const [row] = await this.db
      .select({
        clientId: table.clientId,
        draft:
          kind === "payment"
            ? sql<boolean>`false`
            : sql<boolean>`${(table as typeof quotes).status} = 'draft'`,
      })
      .from(table)
      .where(and(eq(table.workspaceId, workspaceId), eq(table.id, id)))
      .limit(1)
    return row && !row.draft ? row.clientId : null
  }

  async insertResponse(values: typeof portalResponses.$inferInsert) {
    await this.db.insert(portalResponses).values(values)
  }

  /** Emails of the workspace owners (fallback for response notices). */
  async ownerEmails(workspaceId: string): Promise<string[]> {
    const rows = await this.db
      .select({ email: user.email })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(
        and(eq(member.organizationId, workspaceId), eq(member.role, "owner"))
      )
    return rows.map((r) => r.email)
  }
}
