import { Injectable } from "@nestjs/common"
import {
  clients,
  contracts,
  contractTemplates,
  projects,
  quotes,
  type Transaction,
} from "@workspace/db"
import { and, asc, desc, eq, ilike, lt, or, type SQL } from "drizzle-orm"

import { RequestContext } from "../../common/context/request-context.js"
import { InjectDb, type Database } from "../../core/database/database.module.js"

export type ContractRow = typeof contracts.$inferSelect & {
  clientName: string
  quoteNumber: string | null
  projectName: string | null
}
export type ContractValues = Omit<
  typeof contracts.$inferInsert,
  "id" | "workspaceId" | "createdAt" | "updatedAt"
>
export type TemplateRow = typeof contractTemplates.$inferSelect

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`)

@Injectable()
export class ContractsRepository {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly ctx: RequestContext
  ) {}

  get database() {
    return this.db
  }

  private scope(): SQL {
    return eq(contracts.workspaceId, this.ctx.workspaceId)
  }

  private select(tx: Database | Transaction = this.db) {
    return tx
      .select({
        contract: contracts,
        clientName: clients.name,
        quoteNumber: quotes.number,
        projectName: projects.name,
      })
      .from(contracts)
      .innerJoin(clients, eq(clients.id, contracts.clientId))
      .leftJoin(quotes, eq(quotes.id, contracts.quoteId))
      .leftJoin(projects, eq(projects.id, contracts.projectId))
  }

  private static flatten(r: {
    contract: typeof contracts.$inferSelect
    clientName: string
    quoteNumber: string | null
    projectName: string | null
  }): ContractRow {
    return {
      ...r.contract,
      clientName: r.clientName,
      quoteNumber: r.quoteNumber,
      projectName: r.projectName,
    }
  }

  async list(opts: {
    status?: ContractRow["status"]
    clientId?: string
    q?: string
    cursor?: string
    limit: number
  }) {
    const filters: SQL[] = [this.scope()]
    if (opts.status) filters.push(eq(contracts.status, opts.status))
    if (opts.clientId) filters.push(eq(contracts.clientId, opts.clientId))
    if (opts.q) {
      const like = `%${escapeLike(opts.q)}%`
      filters.push(
        or(
          ilike(contracts.number, like),
          ilike(contracts.title, like),
          ilike(clients.name, like)
        )!
      )
    }
    if (opts.cursor) filters.push(lt(contracts.id, opts.cursor))
    const rows = await this.select()
      .where(and(...filters))
      .orderBy(desc(contracts.id))
      .limit(opts.limit + 1)
    const items = rows.slice(0, opts.limit).map(ContractsRepository.flatten)
    return {
      items,
      nextCursor: rows.length > opts.limit ? items[items.length - 1]!.id : null,
    }
  }

  async findById(
    id: string,
    tx: Database | Transaction = this.db,
    opts: { forUpdate?: boolean } = {}
  ): Promise<ContractRow | null> {
    const q = this.select(tx)
      .where(and(this.scope(), eq(contracts.id, id)))
      .limit(1)
    const [row] = opts.forUpdate
      ? await q.for("update", { of: contracts })
      : await q
    return row ? ContractsRepository.flatten(row) : null
  }

  async create(values: ContractValues): Promise<string> {
    const [row] = await this.db
      .insert(contracts)
      .values({ ...values, workspaceId: this.ctx.workspaceId })
      .returning({ id: contracts.id })
    return row!.id
  }

  async update(
    id: string,
    values: Partial<ContractValues>,
    tx: Database | Transaction = this.db
  ) {
    await tx
      .update(contracts)
      .set(values)
      .where(and(this.scope(), eq(contracts.id, id)))
  }

  async delete(id: string) {
    await this.db
      .delete(contracts)
      .where(and(this.scope(), eq(contracts.id, id)))
  }

  /** Linked quote, scoped to the workspace. */
  async quote(id: string) {
    const [row] = await this.db
      .select({
        id: quotes.id,
        clientId: quotes.clientId,
        number: quotes.number,
        title: quotes.title,
        status: quotes.status,
        total: quotes.total,
        currency: quotes.currency,
      })
      .from(quotes)
      .where(
        and(eq(quotes.workspaceId, this.ctx.workspaceId), eq(quotes.id, id))
      )
      .limit(1)
    return row ?? null
  }

  /** Linked project, scoped to the workspace. */
  async project(id: string) {
    const [row] = await this.db
      .select({
        id: projects.id,
        clientId: projects.clientId,
        name: projects.name,
      })
      .from(projects)
      .where(
        and(eq(projects.workspaceId, this.ctx.workspaceId), eq(projects.id, id))
      )
      .limit(1)
    return row ?? null
  }

  // ── Templates ──────────────────────────────────────────────────────────

  private templateScope(): SQL {
    return eq(contractTemplates.workspaceId, this.ctx.workspaceId)
  }

  listTemplates(): Promise<TemplateRow[]> {
    return this.db
      .select()
      .from(contractTemplates)
      .where(this.templateScope())
      .orderBy(asc(contractTemplates.name))
      .limit(200)
  }

  async findTemplate(id: string): Promise<TemplateRow | null> {
    const [row] = await this.db
      .select()
      .from(contractTemplates)
      .where(and(this.templateScope(), eq(contractTemplates.id, id)))
      .limit(1)
    return row ?? null
  }

  async createTemplate(values: { name: string; body: string }) {
    const [row] = await this.db
      .insert(contractTemplates)
      .values({ ...values, workspaceId: this.ctx.workspaceId })
      .returning({ id: contractTemplates.id })
    return row!.id
  }

  async updateTemplate(id: string, values: { name?: string; body?: string }) {
    await this.db
      .update(contractTemplates)
      .set(values)
      .where(and(this.templateScope(), eq(contractTemplates.id, id)))
  }

  async deleteTemplate(id: string) {
    await this.db
      .delete(contractTemplates)
      .where(and(this.templateScope(), eq(contractTemplates.id, id)))
  }
}
