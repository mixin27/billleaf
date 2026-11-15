import { Injectable } from "@nestjs/common"
import {
  clientContacts,
  clients,
  quotes,
  type Transaction,
} from "@workspace/db"
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  isNotNull,
  isNull,
  lt,
  or,
  type SQL,
} from "drizzle-orm"

import { RequestContext } from "../../common/context/request-context.js"
import { InjectDb, type Database } from "../../core/database/database.module.js"

export type ClientRow = typeof clients.$inferSelect
export type ContactRow = typeof clientContacts.$inferSelect
export type ClientValues = Omit<
  typeof clients.$inferInsert,
  "id" | "workspaceId" | "createdAt" | "updatedAt" | "deletedAt" | "archivedAt"
>
export type ContactValues = Omit<
  typeof clientContacts.$inferInsert,
  "id" | "workspaceId" | "clientId" | "createdAt" | "updatedAt"
>

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`)

/** Data access for clients and their contacts. Always workspace-scoped; soft-deleted rows are invisible. */
@Injectable()
export class ClientsRepository {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly ctx: RequestContext
  ) {}

  private scope(): SQL {
    return and(
      eq(clients.workspaceId, this.ctx.workspaceId),
      isNull(clients.deletedAt)
    )!
  }

  /** Keyset pagination on the UUIDv7 id (time-ordered → newest first). */
  async list(opts: {
    q?: string
    status: "active" | "archived"
    cursor?: string
    limit: number
  }): Promise<{ items: ClientRow[]; nextCursor: string | null }> {
    const filters: SQL[] = [
      this.scope(),
      opts.status === "active"
        ? isNull(clients.archivedAt)
        : isNotNull(clients.archivedAt),
    ]
    if (opts.q) {
      const like = `%${escapeLike(opts.q)}%`
      filters.push(or(ilike(clients.name, like), ilike(clients.email, like))!)
    }
    if (opts.cursor) filters.push(lt(clients.id, opts.cursor))

    const rows = await this.db
      .select()
      .from(clients)
      .where(and(...filters))
      .orderBy(desc(clients.id))
      .limit(opts.limit + 1)
    const items = rows.slice(0, opts.limit)
    return {
      items,
      nextCursor: rows.length > opts.limit ? items[items.length - 1]!.id : null,
    }
  }

  /** Non-archived clients — what counts against the plan's `clients` limit. */
  async countActive(): Promise<number> {
    const [row] = await this.db
      .select({ n: count() })
      .from(clients)
      .where(and(this.scope(), isNull(clients.archivedAt)))
    return row?.n ?? 0
  }

  /** True when quotes (and later invoices) reference this client. */
  async hasDocuments(id: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: quotes.id })
      .from(quotes)
      .where(
        and(
          eq(quotes.workspaceId, this.ctx.workspaceId),
          eq(quotes.clientId, id)
        )
      )
      .limit(1)
    return Boolean(row)
  }

  async findById(id: string): Promise<ClientRow | null> {
    const [row] = await this.db
      .select()
      .from(clients)
      .where(and(this.scope(), eq(clients.id, id)))
      .limit(1)
    return row ?? null
  }

  async create(values: ClientValues): Promise<ClientRow> {
    const [row] = await this.db
      .insert(clients)
      .values({ ...values, workspaceId: this.ctx.workspaceId })
      .returning()
    return row!
  }

  async update(
    id: string,
    values: Partial<ClientValues> & {
      archivedAt?: Date | null
      deletedAt?: Date | null
    }
  ): Promise<ClientRow | null> {
    const [row] = await this.db
      .update(clients)
      .set(values)
      .where(and(this.scope(), eq(clients.id, id)))
      .returning()
    return row ?? null
  }

  // ── contacts ────────────────────────────────────────────────────────────

  async listContacts(clientId: string): Promise<ContactRow[]> {
    return this.db
      .select()
      .from(clientContacts)
      .where(
        and(
          eq(clientContacts.workspaceId, this.ctx.workspaceId),
          eq(clientContacts.clientId, clientId)
        )
      )
      .orderBy(desc(clientContacts.isPrimary), asc(clientContacts.createdAt))
  }

  async findContact(
    clientId: string,
    contactId: string
  ): Promise<ContactRow | null> {
    const [row] = await this.db
      .select()
      .from(clientContacts)
      .where(
        and(
          eq(clientContacts.workspaceId, this.ctx.workspaceId),
          eq(clientContacts.clientId, clientId),
          eq(clientContacts.id, contactId)
        )
      )
      .limit(1)
    return row ?? null
  }

  async createContact(
    clientId: string,
    values: ContactValues
  ): Promise<ContactRow> {
    return this.db.transaction(async (tx) => {
      if (values.isPrimary) await this.clearPrimary(tx, clientId)
      const [row] = await tx
        .insert(clientContacts)
        .values({ ...values, clientId, workspaceId: this.ctx.workspaceId })
        .returning()
      return row!
    })
  }

  async updateContact(
    clientId: string,
    contactId: string,
    values: Partial<ContactValues>
  ): Promise<ContactRow | null> {
    return this.db.transaction(async (tx) => {
      if (values.isPrimary) await this.clearPrimary(tx, clientId)
      const [row] = await tx
        .update(clientContacts)
        .set(values)
        .where(
          and(
            eq(clientContacts.workspaceId, this.ctx.workspaceId),
            eq(clientContacts.clientId, clientId),
            eq(clientContacts.id, contactId)
          )
        )
        .returning()
      return row ?? null
    })
  }

  async deleteContact(clientId: string, contactId: string): Promise<boolean> {
    const rows = await this.db
      .delete(clientContacts)
      .where(
        and(
          eq(clientContacts.workspaceId, this.ctx.workspaceId),
          eq(clientContacts.clientId, clientId),
          eq(clientContacts.id, contactId)
        )
      )
      .returning({ id: clientContacts.id })
    return rows.length > 0
  }

  private async clearPrimary(tx: Transaction, clientId: string) {
    await tx
      .update(clientContacts)
      .set({ isPrimary: false })
      .where(
        and(
          eq(clientContacts.workspaceId, this.ctx.workspaceId),
          eq(clientContacts.clientId, clientId)
        )
      )
  }
}
