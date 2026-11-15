import { Injectable, NotFoundException } from "@nestjs/common"
import type {
  CreatePaymentAccountInput,
  PaymentAccount,
  UpdatePaymentAccountInput,
} from "@workspace/contracts"
import { paymentAccounts } from "@workspace/db"
import { and, asc, eq, sql } from "drizzle-orm"

import { RequestContext } from "../../common/context/request-context.js"
import { InjectDb, type Database } from "../../core/database/database.module.js"
import { AuditService } from "../../iam/audit/audit.service.js"
import { FilesService } from "../files/files.service.js"

type Row = typeof paymentAccounts.$inferSelect

const QR_MAX_BYTES = 1024 * 1024

/**
 * How the workspace gets paid: bank accounts and mobile wallets (KBZPay,
 * WavePay, …) with optional QR images. Shown on invoices, in invoice emails
 * and in the client portal while an invoice has a balance.
 */
@Injectable()
export class PaymentAccountsService {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly ctx: RequestContext,
    private readonly files: FilesService,
    private readonly audit: AuditService
  ) {}

  private scope() {
    return eq(paymentAccounts.workspaceId, this.ctx.workspaceId)
  }

  private async toDto(r: Row): Promise<PaymentAccount> {
    return {
      id: r.id,
      kind: r.kind,
      label: r.label,
      accountName: r.accountName,
      accountNumber: r.accountNumber,
      instructions: r.instructions,
      qrUrl: await this.files.url(r.qrFileId),
      currencies: r.currencies,
      position: r.position,
      active: r.active,
    }
  }

  private rows() {
    return this.db
      .select()
      .from(paymentAccounts)
      .where(this.scope())
      .orderBy(asc(paymentAccounts.position), asc(paymentAccounts.createdAt))
  }

  async list(): Promise<PaymentAccount[]> {
    return Promise.all((await this.rows()).map((r) => this.toDto(r)))
  }

  /** Active accounts usable for `currency` (empty currency list = any). */
  async forCurrency(currency: string): Promise<Row[]> {
    return (await this.rows()).filter(
      (r) =>
        r.active &&
        (r.currencies.length === 0 || r.currencies.includes(currency))
    )
  }

  /** Same, as DTOs with presigned QR URLs (portal). */
  async forCurrencyDto(currency: string): Promise<PaymentAccount[]> {
    return Promise.all(
      (await this.forCurrency(currency)).map((r) => this.toDto(r))
    )
  }

  /** QR image bytes for the invoice PDF (null if missing or unreadable). */
  async qrImage(r: Row): Promise<Buffer | null> {
    if (!r.qrFileId) return null
    try {
      return (await this.files.read(r.qrFileId)).body
    } catch {
      return null
    }
  }

  private async require(id: string): Promise<Row> {
    const [row] = await this.db
      .select()
      .from(paymentAccounts)
      .where(and(this.scope(), eq(paymentAccounts.id, id)))
      .limit(1)
    if (!row) throw new NotFoundException("Payment method not found")
    return row
  }

  async get(id: string): Promise<PaymentAccount> {
    return this.toDto(await this.require(id))
  }

  async create(input: CreatePaymentAccountInput): Promise<PaymentAccount> {
    const [max] = await this.db
      .select({
        p: sql<number>`coalesce(max(${paymentAccounts.position}), -1)::int`,
      })
      .from(paymentAccounts)
      .where(this.scope())
    const [row] = await this.db
      .insert(paymentAccounts)
      .values({
        workspaceId: this.ctx.workspaceId,
        kind: input.kind,
        label: input.label,
        accountName: input.accountName ?? null,
        accountNumber: input.accountNumber ?? null,
        instructions: input.instructions ?? null,
        currencies: input.currencies ?? [],
        active: input.active ?? true,
        position: (max?.p ?? -1) + 1,
      })
      .returning()
    await this.audit.record("payment_account.created", {
      resourceType: "payment_account",
      resourceId: row!.id,
    })
    return this.toDto(row!)
  }

  async update(
    id: string,
    input: UpdatePaymentAccountInput
  ): Promise<PaymentAccount> {
    await this.require(id)
    const values = Object.fromEntries(
      Object.entries(input).filter(([, v]) => v !== undefined)
    )
    if (Object.keys(values).length)
      await this.db
        .update(paymentAccounts)
        .set(values)
        .where(and(this.scope(), eq(paymentAccounts.id, id)))
    await this.audit.record("payment_account.updated", {
      resourceType: "payment_account",
      resourceId: id,
    })
    return this.get(id)
  }

  async remove(id: string) {
    const row = await this.require(id)
    await this.db
      .delete(paymentAccounts)
      .where(and(this.scope(), eq(paymentAccounts.id, id)))
    if (row.qrFileId) await this.files.remove(row.qrFileId)
    await this.audit.record("payment_account.deleted", {
      resourceType: "payment_account",
      resourceId: id,
    })
  }

  /** Set the display order to `ids` (others keep their relative order after). */
  async reorder(ids: string[]): Promise<PaymentAccount[]> {
    const rows = await this.rows()
    const known = new Set(rows.map((r) => r.id))
    const ordered = [
      ...ids.filter((id) => known.has(id)),
      ...rows.map((r) => r.id).filter((id) => !ids.includes(id)),
    ]
    await this.db.transaction(async (tx) => {
      for (const [position, id] of ordered.entries())
        await tx
          .update(paymentAccounts)
          .set({ position })
          .where(and(this.scope(), eq(paymentAccounts.id, id)))
    })
    return this.list()
  }

  async setQr(id: string, filename: string, body: Buffer) {
    const row = await this.require(id)
    const file = await this.files.uploadImage(
      "payment_qr",
      filename,
      body,
      QR_MAX_BYTES
    )
    await this.db
      .update(paymentAccounts)
      .set({ qrFileId: file.id })
      .where(and(this.scope(), eq(paymentAccounts.id, id)))
    if (row.qrFileId) await this.files.remove(row.qrFileId)
    return this.get(id)
  }

  async removeQr(id: string) {
    const row = await this.require(id)
    await this.db
      .update(paymentAccounts)
      .set({ qrFileId: null })
      .where(and(this.scope(), eq(paymentAccounts.id, id)))
    if (row.qrFileId) await this.files.remove(row.qrFileId)
    return this.get(id)
  }
}
