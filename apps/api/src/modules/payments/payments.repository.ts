import { Injectable } from "@nestjs/common"
import {
  clients,
  invoices,
  payments,
  receipts,
  type Transaction,
} from "@workspace/db"
import { and, count, eq, ilike, or, type SQL, sql } from "drizzle-orm"

import { RequestContext } from "../../common/context/request-context.js"
import { offsetOf, orderBy, type PageArgs } from "../../common/pagination.js"
import { InjectDb, type Database } from "../../core/database/database.module.js"

export type PaymentRow = typeof payments.$inferSelect
export type ReceiptRow = typeof receipts.$inferSelect
export type PaymentWithRefs = PaymentRow & {
  clientName: string
  invoiceNumber: string | null
  receipt: ReceiptRow | null
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`)

@Injectable()
export class PaymentsRepository {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly ctx: RequestContext
  ) {}

  get database() {
    return this.db
  }

  private scope(): SQL {
    return eq(payments.workspaceId, this.ctx.workspaceId)
  }

  private selectWithRefs(tx: Database | Transaction = this.db) {
    return tx
      .select({
        payment: payments,
        clientName: clients.name,
        invoiceNumber: invoices.number,
        receipt: receipts,
      })
      .from(payments)
      .innerJoin(clients, eq(clients.id, payments.clientId))
      .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
      .leftJoin(receipts, eq(receipts.paymentId, payments.id))
  }

  private static flatten(r: {
    payment: PaymentRow
    clientName: string
    invoiceNumber: string | null
    receipt: ReceiptRow | null
  }): PaymentWithRefs {
    return {
      ...r.payment,
      clientName: r.clientName,
      invoiceNumber: r.invoiceNumber,
      receipt: r.receipt,
    }
  }

  async list(
    opts: PageArgs & {
      invoiceId?: string
      clientId?: string
      status?: PaymentRow["status"]
      q?: string
    }
  ): Promise<{ items: PaymentWithRefs[]; total: number }> {
    const filters: SQL[] = [this.scope()]
    if (opts.invoiceId) filters.push(eq(payments.invoiceId, opts.invoiceId))
    if (opts.clientId) filters.push(eq(payments.clientId, opts.clientId))
    if (opts.status) filters.push(eq(payments.status, opts.status))
    if (opts.q) {
      const like = `%${escapeLike(opts.q)}%`
      filters.push(
        or(
          ilike(invoices.number, like),
          ilike(receipts.number, like),
          ilike(clients.name, like),
          ilike(payments.reference, like)
        )!
      )
    }
    const where = and(...filters)
    const [rows, [counted]] = await Promise.all([
      this.selectWithRefs()
        .where(where)
        .orderBy(
          ...orderBy(
            opts.sort,
            {
              paidOn: payments.paidOn,
              amount: payments.amount,
              clientName: sql`lower(${clients.name})`,
              createdAt: payments.createdAt,
            },
            payments.id
          )
        )
        .limit(opts.pageSize)
        .offset(offsetOf(opts.page, opts.pageSize)),
      this.db
        .select({ n: count() })
        .from(payments)
        .innerJoin(clients, eq(clients.id, payments.clientId))
        .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
        .leftJoin(receipts, eq(receipts.paymentId, payments.id))
        .where(where),
    ])
    return {
      items: rows.map(PaymentsRepository.flatten),
      total: counted?.n ?? 0,
    }
  }

  async findById(
    id: string,
    tx: Database | Transaction = this.db,
    opts: { forUpdate?: boolean } = {}
  ): Promise<PaymentWithRefs | null> {
    const q = this.selectWithRefs(tx)
      .where(and(this.scope(), eq(payments.id, id)))
      .limit(1)
    const [row] = opts.forUpdate
      ? await q.for("update", { of: payments })
      : await q
    return row ? PaymentsRepository.flatten(row) : null
  }

  async insertPayment(
    tx: Transaction,
    values: Omit<
      typeof payments.$inferInsert,
      "id" | "workspaceId" | "createdAt" | "updatedAt"
    >
  ): Promise<PaymentRow> {
    const [row] = await tx
      .insert(payments)
      .values({ ...values, workspaceId: this.ctx.workspaceId })
      .returning()
    return row!
  }

  async insertReceipt(
    tx: Transaction,
    values: Omit<
      typeof receipts.$inferInsert,
      "id" | "workspaceId" | "createdAt" | "updatedAt"
    >
  ): Promise<ReceiptRow> {
    const [row] = await tx
      .insert(receipts)
      .values({ ...values, workspaceId: this.ctx.workspaceId })
      .returning()
    return row!
  }

  async updatePayment(
    tx: Database | Transaction,
    id: string,
    values: Partial<PaymentRow>
  ) {
    await tx
      .update(payments)
      .set(values)
      .where(and(this.scope(), eq(payments.id, id)))
  }

  async updateReceipt(
    tx: Database | Transaction,
    id: string,
    values: Partial<ReceiptRow>
  ) {
    await tx
      .update(receipts)
      .set(values)
      .where(
        and(eq(receipts.workspaceId, this.ctx.workspaceId), eq(receipts.id, id))
      )
  }
}
