import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common"
import {
  type CreateExpenseInput,
  DEFAULT_EXPENSE_CATEGORIES,
  EXPENSE_RECEIPT_MAX_BYTES,
  type Expense,
  type ExpenseCategory,
  type ExpenseList,
  type Invoice,
  type ListExpensesQuery,
  type SaveExpenseCategoryInput,
  type UpdateExpenseInput,
} from "@workspace/contracts"
import {
  clients,
  expenseCategories,
  expenses,
  files,
  invoices,
  projects,
} from "@workspace/db"
import {
  and,
  asc,
  count,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  or,
  type SQL,
  sql,
} from "drizzle-orm"

import { RequestContext } from "../../common/context/request-context.js"
import { offsetOf, orderBy, type PageArgs } from "../../common/pagination.js"
import { InjectDb, type Database } from "../../core/database/database.module.js"
import { StorageService } from "../../core/storage/storage.service.js"
import { AuditService } from "../../iam/audit/audit.service.js"
import { FilesService } from "../files/files.service.js"
import { InvoicesService } from "../invoices/invoices.service.js"
import { WorkspaceProfileService } from "../workspace/workspace-profile.service.js"

const escapeLike = (v: string) => v.replace(/[\\%_]/g, (c) => `\\${c}`)

type Row = {
  expense: typeof expenses.$inferSelect
  categoryName: string | null
  clientName: string | null
  projectName: string | null
  invoiceNumber: string | null
  receiptKey: string | null
  receiptName: string | null
  receiptType: string | null
}

/**
 * Expenses and their categories, receipts (photo or PDF), and turning
 * billable ones into a draft invoice for the client.
 */
@Injectable()
export class ExpensesService {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly ctx: RequestContext,
    private readonly files: FilesService,
    private readonly storage: StorageService,
    private readonly profile: WorkspaceProfileService,
    private readonly invoices: InvoicesService,
    private readonly audit: AuditService
  ) {}

  private scope(): SQL {
    return eq(expenses.workspaceId, this.ctx.workspaceId)
  }

  // ── Categories ─────────────────────────────────────────

  async categories(): Promise<ExpenseCategory[]> {
    const ws = this.ctx.workspaceId
    const list = () =>
      this.db
        .select({
          id: expenseCategories.id,
          name: expenseCategories.name,
          archived: expenseCategories.archived,
        })
        .from(expenseCategories)
        .where(eq(expenseCategories.workspaceId, ws))
        .orderBy(asc(sql`lower(${expenseCategories.name})`))
    const rows = await list()
    if (rows.length > 0) return rows
    await this.db
      .insert(expenseCategories)
      .values(
        DEFAULT_EXPENSE_CATEGORIES.map((name) => ({ workspaceId: ws, name }))
      )
      .onConflictDoNothing()
    return list()
  }

  async createCategory(
    input: SaveExpenseCategoryInput
  ): Promise<ExpenseCategory> {
    const [row] = await this.db
      .insert(expenseCategories)
      .values({ workspaceId: this.ctx.workspaceId, name: input.name })
      .onConflictDoNothing()
      .returning()
    if (!row)
      throw new ConflictException({
        message: "A category with that name already exists",
        code: "category_exists",
      })
    return { id: row.id, name: row.name, archived: row.archived }
  }

  async updateCategory(
    id: string,
    input: Partial<SaveExpenseCategoryInput>
  ): Promise<ExpenseCategory> {
    try {
      const [row] = await this.db
        .update(expenseCategories)
        .set({ ...input, updatedAt: new Date() })
        .where(
          and(
            eq(expenseCategories.workspaceId, this.ctx.workspaceId),
            eq(expenseCategories.id, id)
          )
        )
        .returning()
      if (!row) throw new NotFoundException("Category not found")
      return { id: row.id, name: row.name, archived: row.archived }
    } catch (e) {
      if ((e as { cause?: { code?: string } }).cause?.code === "23505")
        throw new ConflictException({
          message: "A category with that name already exists",
          code: "category_exists",
        })
      throw e
    }
  }

  // ── Expenses ───────────────────────────────────────────

  private select() {
    return this.db
      .select({
        expense: expenses,
        categoryName: expenseCategories.name,
        clientName: clients.name,
        projectName: projects.name,
        invoiceNumber: invoices.number,
        receiptKey: files.key,
        receiptName: files.filename,
        receiptType: files.contentType,
      })
      .from(expenses)
      .leftJoin(
        expenseCategories,
        eq(expenseCategories.id, expenses.categoryId)
      )
      .leftJoin(clients, eq(clients.id, expenses.clientId))
      .leftJoin(projects, eq(projects.id, expenses.projectId))
      .leftJoin(invoices, eq(invoices.id, expenses.invoiceId))
      .leftJoin(files, eq(files.id, expenses.receiptFileId))
  }

  private async toDto(r: Row): Promise<Expense> {
    const e = r.expense
    return {
      id: e.id,
      spentOn: e.spentOn,
      vendor: e.vendor,
      description: e.description,
      categoryId: e.categoryId,
      categoryName: r.categoryName,
      amount: e.amount,
      taxAmount: e.taxAmount,
      currency: e.currency,
      paymentMethod: e.paymentMethod,
      reference: e.reference,
      clientId: e.clientId,
      clientName: r.clientName,
      projectId: e.projectId,
      projectName: r.projectName,
      billable: e.billable,
      invoiceId: e.invoiceId,
      invoiceNumber: r.invoiceNumber,
      receipt:
        r.receiptKey && r.receiptName && r.receiptType
          ? {
              filename: r.receiptName,
              contentType: r.receiptType,
              url: await this.storage.presignGet(r.receiptKey),
            }
          : null,
      createdAt: e.createdAt.toISOString(),
    }
  }

  private filters(q: Omit<ListExpensesQuery, "page" | "pageSize" | "sort">) {
    const w: SQL[] = [this.scope()]
    if (q.from) w.push(gte(expenses.spentOn, q.from))
    if (q.to) w.push(lte(expenses.spentOn, q.to))
    if (q.categoryId) w.push(eq(expenses.categoryId, q.categoryId))
    if (q.clientId) w.push(eq(expenses.clientId, q.clientId))
    if (q.projectId) w.push(eq(expenses.projectId, q.projectId))
    if (q.billing === "billable") w.push(eq(expenses.billable, true))
    if (q.billing === "non_billable") w.push(eq(expenses.billable, false))
    if (q.billing === "unbilled")
      w.push(eq(expenses.billable, true), isNull(expenses.invoiceId))
    if (q.q) {
      const like = `%${escapeLike(q.q)}%`
      w.push(
        or(
          ilike(expenses.vendor, like),
          ilike(expenses.description, like),
          ilike(expenses.reference, like)
        )!
      )
    }
    return and(...w)!
  }

  async list(
    q: PageArgs & Omit<ListExpensesQuery, "page" | "pageSize" | "sort">
  ): Promise<ExpenseList> {
    const where = this.filters(q)
    const [rows, [total], totals] = await Promise.all([
      this.select()
        .where(where)
        .orderBy(
          ...orderBy(
            q.sort,
            {
              spentOn: expenses.spentOn,
              amount: expenses.amount,
              vendor: sql`lower(${expenses.vendor})`,
              createdAt: expenses.createdAt,
            },
            expenses.id,
            [sql`${expenses.spentOn} desc`, sql`${expenses.createdAt} desc`]
          )
        )
        .limit(q.pageSize)
        .offset(offsetOf(q.page, q.pageSize)),
      this.db.select({ n: count() }).from(expenses).where(where),
      this.db
        .select({
          currency: expenses.currency,
          amount: sql<string>`sum(${expenses.amount})`,
        })
        .from(expenses)
        .where(where)
        .groupBy(expenses.currency),
    ])
    return {
      items: await Promise.all(rows.map((r) => this.toDto(r))),
      total: total?.n ?? 0,
      page: q.page,
      pageSize: q.pageSize,
      totals: totals
        .map((t) => ({ currency: t.currency, amount: Number(t.amount) }))
        .sort((a, b) => b.amount - a.amount),
    }
  }

  private async require(id: string): Promise<Row> {
    const [row] = await this.select()
      .where(and(this.scope(), eq(expenses.id, id)))
      .limit(1)
    if (!row) throw new NotFoundException("Expense not found")
    return row
  }

  async get(id: string): Promise<Expense> {
    return this.toDto(await this.require(id))
  }

  /** Check references belong to this workspace; returns the client's currency. */
  private async checkRefs(v: {
    categoryId?: string | null
    clientId?: string | null
    projectId?: string | null
  }): Promise<string | null> {
    const ws = this.ctx.workspaceId
    if (v.categoryId) {
      const [c] = await this.db
        .select({ id: expenseCategories.id })
        .from(expenseCategories)
        .where(
          and(
            eq(expenseCategories.workspaceId, ws),
            eq(expenseCategories.id, v.categoryId)
          )
        )
      if (!c) throw new BadRequestException("Unknown category")
    }
    let clientCurrency: string | null = null
    if (v.clientId) {
      const [c] = await this.db
        .select({ currency: clients.currency })
        .from(clients)
        .where(and(eq(clients.workspaceId, ws), eq(clients.id, v.clientId)))
      if (!c) throw new BadRequestException("Unknown client")
      clientCurrency = c.currency
    }
    if (v.projectId) {
      const [p] = await this.db
        .select({ clientId: projects.clientId })
        .from(projects)
        .where(and(eq(projects.workspaceId, ws), eq(projects.id, v.projectId)))
      if (!p) throw new BadRequestException("Unknown project")
      if (v.clientId && p.clientId && p.clientId !== v.clientId)
        throw new BadRequestException(
          "That project belongs to a different client"
        )
    }
    return clientCurrency
  }

  async create(input: CreateExpenseInput): Promise<Expense> {
    const clientCurrency = await this.checkRefs(input)
    const currency =
      input.currency ??
      clientCurrency ??
      (await this.profile.get()).defaultCurrency
    const [row] = await this.db
      .insert(expenses)
      .values({
        workspaceId: this.ctx.workspaceId,
        spentOn: input.spentOn,
        vendor: input.vendor ?? null,
        description: input.description ?? null,
        categoryId: input.categoryId ?? null,
        amount: input.amount,
        taxAmount: input.taxAmount ?? 0,
        currency,
        paymentMethod: input.paymentMethod ?? "bank_transfer",
        reference: input.reference ?? null,
        clientId: input.clientId ?? null,
        projectId: input.projectId ?? null,
        billable: Boolean(input.clientId) && (input.billable ?? false),
        createdByMemberId: this.ctx.memberId,
      })
      .returning({ id: expenses.id })
    await this.audit.record("expense.created", {
      resourceType: "expense",
      resourceId: row!.id,
      metadata: { amount: input.amount, currency },
    })
    return this.get(row!.id)
  }

  async update(id: string, input: UpdateExpenseInput): Promise<Expense> {
    const { expense } = await this.require(id)
    const money =
      input.amount !== undefined ||
      input.taxAmount !== undefined ||
      input.currency !== undefined ||
      input.clientId !== undefined ||
      input.billable !== undefined
    if (expense.invoiceId && money)
      throw new ConflictException({
        message:
          "This expense is on an invoice. Delete the draft or void the invoice to change it.",
        code: "expense_invoiced",
      })
    const next = {
      categoryId:
        input.categoryId === undefined ? expense.categoryId : input.categoryId,
      clientId:
        input.clientId === undefined ? expense.clientId : input.clientId,
      projectId:
        input.projectId === undefined ? expense.projectId : input.projectId,
    }
    await this.checkRefs(next)
    const amount = input.amount ?? expense.amount
    const taxAmount = input.taxAmount ?? expense.taxAmount
    if (taxAmount > amount)
      throw new BadRequestException("Tax can't be more than the amount")
    const billable =
      Boolean(next.clientId) && (input.billable ?? expense.billable)
    await this.db
      .update(expenses)
      .set({
        ...input,
        ...next,
        billable,
        updatedAt: new Date(),
      })
      .where(and(this.scope(), eq(expenses.id, id)))
    return this.get(id)
  }

  async remove(id: string): Promise<void> {
    const { expense } = await this.require(id)
    if (expense.invoiceId)
      throw new ConflictException({
        message: "This expense is on an invoice and can't be deleted",
        code: "expense_invoiced",
      })
    await this.db.delete(expenses).where(and(this.scope(), eq(expenses.id, id)))
    if (expense.receiptFileId) await this.files.remove(expense.receiptFileId)
    await this.audit.record("expense.deleted", {
      resourceType: "expense",
      resourceId: id,
      metadata: { amount: expense.amount, currency: expense.currency },
    })
  }

  async setReceipt(
    id: string,
    file: { filename: string; body: Buffer }
  ): Promise<Expense> {
    const { expense } = await this.require(id)
    const stored = await this.files.uploadImage(
      "expense_receipt",
      file.filename,
      file.body,
      EXPENSE_RECEIPT_MAX_BYTES,
      { allowPdf: true }
    )
    await this.db
      .update(expenses)
      .set({ receiptFileId: stored.id, updatedAt: new Date() })
      .where(and(this.scope(), eq(expenses.id, id)))
    if (expense.receiptFileId) await this.files.remove(expense.receiptFileId)
    return this.get(id)
  }

  async removeReceipt(id: string): Promise<Expense> {
    const { expense } = await this.require(id)
    if (expense.receiptFileId) {
      await this.db
        .update(expenses)
        .set({ receiptFileId: null, updatedAt: new Date() })
        .where(and(this.scope(), eq(expenses.id, id)))
      await this.files.remove(expense.receiptFileId)
    }
    return this.get(id)
  }

  /**
   * The client's unbilled billable expenses → a draft invoice, one line per
   * expense at its full amount. All must be in one currency. Expenses are
   * claimed atomically; if another request claimed some first, the draft is
   * removed.
   */
  async invoiceFromExpenses(
    clientId: string,
    expenseIds?: string[]
  ): Promise<Invoice> {
    const can = (p: "invoice.create" | "expense.read") =>
      this.ctx.permissions.has(p)
    if (!can("invoice.create") || !can("expense.read"))
      throw new ForbiddenException(
        "Invoicing expenses needs invoice.create and expense.read"
      )
    const w: SQL[] = [
      this.scope(),
      eq(expenses.clientId, clientId),
      eq(expenses.billable, true),
      isNull(expenses.invoiceId),
    ]
    if (expenseIds) w.push(inArray(expenses.id, expenseIds))
    const rows = await this.select()
      .where(and(...w))
      .orderBy(asc(expenses.spentOn))
    if (rows.length === 0)
      throw new BadRequestException({
        message: "No unbilled billable expenses for this client",
        code: "no_unbilled_expenses",
      })
    const currencies = [...new Set(rows.map((r) => r.expense.currency))]
    if (currencies.length > 1)
      throw new BadRequestException({
        message: `These expenses are in different currencies (${currencies.join(", ")}). Invoice one currency at a time.`,
        code: "mixed_currencies",
      })
    const invoice = await this.invoices.create({
      clientId,
      title: "Expenses",
      currency: currencies[0],
      lines: rows.map((r) => ({
        description: `${[r.expense.vendor ?? r.categoryName ?? "Expense", r.expense.description].filter(Boolean).join(" · ")} (${r.expense.spentOn})`,
        quantity: 1,
        unitPrice: r.expense.amount,
        taxRateBps: 0,
      })),
    })
    const ids = rows.map((r) => r.expense.id)
    const claimed = await this.db
      .update(expenses)
      .set({ invoiceId: invoice.id })
      .where(
        and(this.scope(), inArray(expenses.id, ids), isNull(expenses.invoiceId))
      )
      .returning({ id: expenses.id })
    if (claimed.length !== ids.length) {
      await this.invoices.remove(invoice.id) // releases claimed ones (FK set null)
      throw new ConflictException({
        message:
          "Some of these expenses were just invoiced elsewhere. Try again.",
        code: "expenses_already_invoiced",
      })
    }
    await this.audit.record("expenses.invoiced", {
      resourceType: "invoice",
      resourceId: invoice.id,
      metadata: { clientId, expenses: ids.length },
    })
    return this.invoices.get(invoice.id)
  }
}
