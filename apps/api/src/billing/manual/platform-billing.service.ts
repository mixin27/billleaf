import { randomUUID } from "node:crypto"

import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common"
import type {
  CreatePaymentAccountInput,
  CreatePlatformPriceInput,
  PaymentAccount,
  PlatformPrice,
  UpdatePaymentAccountInput,
  UpdatePlatformPriceInput,
} from "@workspace/contracts"
import { platformPaymentAccounts, platformPrices } from "@workspace/db"
import { and, asc, eq, sql } from "drizzle-orm"

import { InjectDb, type Database } from "../../core/database/database.module.js"
import { StorageService } from "../../core/storage/storage.service.js"
import { AuditService } from "../../iam/audit/audit.service.js"
import { sniffImage } from "../../modules/files/files.service.js"

type PriceRow = typeof platformPrices.$inferSelect
type AccountRow = typeof platformPaymentAccounts.$inferSelect

const QR_MAX_BYTES = 1024 * 1024

/** Postgres unique_violation. */
const isUniqueViolation = (err: unknown) =>
  (err as { code?: string; cause?: { code?: string } })?.code === "23505" ||
  (err as { cause?: { code?: string } })?.cause?.code === "23505"

/**
 * What Billleaf charges (per plan, interval and currency) and where to pay
 * it (Billleaf's own bank accounts and wallets). Managed by platform admins;
 * read by workspaces on the pay page. Not workspace-scoped.
 */
@Injectable()
export class PlatformBillingService {
  private readonly logger = new Logger(PlatformBillingService.name)

  constructor(
    @InjectDb() private readonly db: Database,
    private readonly storage: StorageService,
    private readonly audit: AuditService
  ) {}

  // ── Prices ───────────────────────────────────────────────

  private priceDto(r: PriceRow): PlatformPrice {
    return {
      id: r.id,
      planKey: r.planKey,
      interval: r.interval,
      currency: r.currency,
      amount: r.amount,
      active: r.active,
    }
  }

  async prices(onlyActive = false): Promise<PlatformPrice[]> {
    const rows = await this.db
      .select()
      .from(platformPrices)
      .where(onlyActive ? eq(platformPrices.active, true) : undefined)
      .orderBy(
        asc(platformPrices.planKey),
        asc(platformPrices.interval),
        asc(platformPrices.currency)
      )
    return rows.map((r) => this.priceDto(r))
  }

  /** The active price for a plan/interval/currency, or null. */
  async price(planKey: string, interval: string, currency: string) {
    const [row] = await this.db
      .select()
      .from(platformPrices)
      .where(
        and(
          eq(platformPrices.planKey, planKey as PriceRow["planKey"]),
          eq(platformPrices.interval, interval as PriceRow["interval"]),
          eq(platformPrices.currency, currency),
          eq(platformPrices.active, true)
        )
      )
      .limit(1)
    return row ?? null
  }

  async createPrice(input: CreatePlatformPriceInput): Promise<PlatformPrice> {
    try {
      const [row] = await this.db
        .insert(platformPrices)
        .values({
          planKey: input.planKey,
          interval: input.interval,
          currency: input.currency,
          amount: input.amount,
          active: input.active ?? true,
        })
        .returning()
      await this.audit.record("admin.price_created", {
        resourceType: "platform_price",
        resourceId: row!.id,
        metadata: { ...input },
      })
      return this.priceDto(row!)
    } catch (err) {
      if (isUniqueViolation(err))
        throw new ConflictException({
          message:
            "There's already a price for this plan, interval and currency",
          code: "price_exists",
        })
      throw err
    }
  }

  async updatePrice(
    id: string,
    input: UpdatePlatformPriceInput
  ): Promise<PlatformPrice> {
    const values = Object.fromEntries(
      Object.entries(input).filter(([, v]) => v !== undefined)
    )
    const [row] = Object.keys(values).length
      ? await this.db
          .update(platformPrices)
          .set(values)
          .where(eq(platformPrices.id, id))
          .returning()
      : await this.db
          .select()
          .from(platformPrices)
          .where(eq(platformPrices.id, id))
    if (!row) throw new NotFoundException("Price not found")
    await this.audit.record("admin.price_updated", {
      resourceType: "platform_price",
      resourceId: id,
      metadata: { ...input },
    })
    return this.priceDto(row)
  }

  async removePrice(id: string) {
    const [row] = await this.db
      .delete(platformPrices)
      .where(eq(platformPrices.id, id))
      .returning({ id: platformPrices.id })
    if (!row) throw new NotFoundException("Price not found")
    await this.audit.record("admin.price_deleted", {
      resourceType: "platform_price",
      resourceId: id,
    })
  }

  // ── Billleaf's payment accounts ──────────────────────────

  private async accountDto(r: AccountRow): Promise<PaymentAccount> {
    return {
      id: r.id,
      kind: r.kind,
      label: r.label,
      accountName: r.accountName,
      accountNumber: r.accountNumber,
      instructions: r.instructions,
      qrUrl: r.qrKey ? await this.storage.presignGet(r.qrKey) : null,
      currencies: r.currencies,
      position: r.position,
      active: r.active,
    }
  }

  async accounts(onlyActive = false): Promise<PaymentAccount[]> {
    const rows = await this.db
      .select()
      .from(platformPaymentAccounts)
      .where(onlyActive ? eq(platformPaymentAccounts.active, true) : undefined)
      .orderBy(
        asc(platformPaymentAccounts.position),
        asc(platformPaymentAccounts.createdAt)
      )
    return Promise.all(rows.map((r) => this.accountDto(r)))
  }

  async accountRow(id: string): Promise<AccountRow> {
    const [row] = await this.db
      .select()
      .from(platformPaymentAccounts)
      .where(eq(platformPaymentAccounts.id, id))
      .limit(1)
    if (!row) throw new NotFoundException("Payment method not found")
    return row
  }

  async createAccount(input: CreatePaymentAccountInput) {
    const [max] = await this.db
      .select({
        p: sql<number>`coalesce(max(${platformPaymentAccounts.position}), -1)::int`,
      })
      .from(platformPaymentAccounts)
    const [row] = await this.db
      .insert(platformPaymentAccounts)
      .values({
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
    await this.audit.record("admin.payment_account_created", {
      resourceType: "platform_payment_account",
      resourceId: row!.id,
    })
    return this.accountDto(row!)
  }

  async updateAccount(id: string, input: UpdatePaymentAccountInput) {
    await this.accountRow(id)
    const values = Object.fromEntries(
      Object.entries(input).filter(([, v]) => v !== undefined)
    )
    if (Object.keys(values).length)
      await this.db
        .update(platformPaymentAccounts)
        .set(values)
        .where(eq(platformPaymentAccounts.id, id))
    await this.audit.record("admin.payment_account_updated", {
      resourceType: "platform_payment_account",
      resourceId: id,
    })
    return this.accountDto(await this.accountRow(id))
  }

  async removeAccount(id: string) {
    const row = await this.accountRow(id)
    await this.db
      .delete(platformPaymentAccounts)
      .where(eq(platformPaymentAccounts.id, id))
    if (row.qrKey) await this.deleteObject(row.qrKey)
    await this.audit.record("admin.payment_account_deleted", {
      resourceType: "platform_payment_account",
      resourceId: id,
    })
  }

  /** Set the display order to `ids` (others keep their order after). */
  async reorderAccounts(ids: string[]) {
    const rows = await this.db
      .select({ id: platformPaymentAccounts.id })
      .from(platformPaymentAccounts)
      .orderBy(
        asc(platformPaymentAccounts.position),
        asc(platformPaymentAccounts.createdAt)
      )
    const known = new Set(rows.map((r) => r.id))
    const ordered = [
      ...ids.filter((id) => known.has(id)),
      ...rows.map((r) => r.id).filter((id) => !ids.includes(id)),
    ]
    await this.db.transaction(async (tx) => {
      for (const [position, id] of ordered.entries())
        await tx
          .update(platformPaymentAccounts)
          .set({ position })
          .where(eq(platformPaymentAccounts.id, id))
    })
    return this.accounts()
  }

  async setQr(id: string, body: Buffer) {
    const row = await this.accountRow(id)
    const key = await this.putImage("payment-qr", body, QR_MAX_BYTES)
    await this.db
      .update(platformPaymentAccounts)
      .set({ qrKey: key })
      .where(eq(platformPaymentAccounts.id, id))
    if (row.qrKey) await this.deleteObject(row.qrKey)
    return this.accountDto(await this.accountRow(id))
  }

  async removeQr(id: string) {
    const row = await this.accountRow(id)
    await this.db
      .update(platformPaymentAccounts)
      .set({ qrKey: null })
      .where(eq(platformPaymentAccounts.id, id))
    if (row.qrKey) await this.deleteObject(row.qrKey)
    return this.accountDto(await this.accountRow(id))
  }

  // ── Platform objects (not in `files`, not in any quota) ──

  /** Store a PNG/JPEG under `_platform/<folder>/`; returns the object key. */
  async putImage(folder: string, body: Buffer, maxBytes: number) {
    if (body.length === 0) throw new BadRequestException("The file is empty")
    if (body.length > maxBytes)
      throw new BadRequestException({
        message: `Images must be ${Math.round(maxBytes / 1024)} KB or smaller`,
        code: "file_too_large",
      })
    const type = sniffImage(body)
    if (!type)
      throw new BadRequestException({
        message: "Upload a PNG or JPEG image",
        code: "unsupported_file_type",
      })
    const key = `_platform/${folder}/${randomUUID()}.${type.ext}`
    await this.storage.put(key, body, type.contentType)
    return key
  }

  async deleteObject(key: string) {
    await this.storage
      .delete(key)
      .catch((err) => this.logger.warn(`Orphaned object ${key}: ${err}`))
  }

  presign(key: string) {
    return this.storage.presignGet(key)
  }
}
