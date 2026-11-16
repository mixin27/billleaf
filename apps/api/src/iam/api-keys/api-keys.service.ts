import { createHash, randomBytes } from "node:crypto"

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common"
import {
  API_KEY_PREFIX_LENGTH,
  type ApiKey,
  type ApiKeyList,
  type CreateApiKeyInput,
  type CreatedApiKey,
  type Permission,
} from "@workspace/contracts"
import { apiKeys, member, user } from "@workspace/db"
import { and, desc, eq, isNull, lt, or, sql } from "drizzle-orm"

import { RequestContext } from "../../common/context/request-context.js"
import { EntitlementsService } from "../../billing/entitlements.service.js"
import { InjectDb, type Database } from "../../core/database/database.module.js"
import { AuditService } from "../audit/audit.service.js"

/** What a valid key resolves to (set on the request as `req.apiKey`). */
export interface VerifiedApiKey {
  id: string
  workspaceId: string
  memberId: string
  userId: string
  scopes: Permission[]
}

const MAX_ACTIVE_KEYS = 25
export const API_KEY_BEARER = /^Bearer\s+(blk_[A-Za-z0-9_-]{20,100})$/

export const hashApiKey = (key: string) =>
  createHash("sha256").update(key).digest("hex")

type Row = typeof apiKeys.$inferSelect

function status(r: Row, now = new Date()): ApiKey["status"] {
  if (r.revokedAt) return "revoked"
  if (r.expiresAt && r.expiresAt <= now) return "expired"
  return "active"
}

/**
 * Settings → API keys, and `verify()` for the auth guard. Keys are random
 * (`blk_` + 32 bytes), stored only as a SHA-256 hash, and shown once.
 */
@Injectable()
export class ApiKeysService {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly ctx: RequestContext,
    private readonly entitlements: EntitlementsService,
    private readonly audit: AuditService
  ) {}

  private async rows(where: ReturnType<typeof eq>) {
    return this.db
      .select({ key: apiKeys, creatorName: user.name })
      .from(apiKeys)
      .leftJoin(member, eq(member.id, apiKeys.createdByMemberId))
      .leftJoin(user, eq(user.id, member.userId))
      .where(where)
      .orderBy(desc(apiKeys.createdAt))
  }

  private toDto(r: { key: Row; creatorName: string | null }): ApiKey {
    const k = r.key
    return {
      id: k.id,
      name: k.name,
      prefix: k.prefix,
      scopes: k.scopes,
      createdBy: r.creatorName
        ? { memberId: k.createdByMemberId, name: r.creatorName }
        : null,
      expiresAt: k.expiresAt?.toISOString() ?? null,
      lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
      revokedAt: k.revokedAt?.toISOString() ?? null,
      status: status(k),
      createdAt: k.createdAt.toISOString(),
    }
  }

  async list(): Promise<ApiKeyList> {
    const rows = await this.rows(eq(apiKeys.workspaceId, this.ctx.workspaceId))
    return {
      items: rows.map((r) => this.toDto(r)),
      available: await this.entitlements.hasFeature("developerApi"),
    }
  }

  /** The key acts as you, so it can only get permissions you have. */
  async create(input: CreateApiKeyInput): Promise<CreatedApiKey> {
    await this.entitlements.assertFeature("developerApi")
    const scopes = input.scopes as Permission[]
    const notHeld = scopes.filter((s) => !this.ctx.permissions.has(s))
    if (notHeld.length)
      throw new BadRequestException({
        message: `You don't have these permissions yourself: ${notHeld.join(", ")}`,
        code: "scope_not_held",
      })
    const [active] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(apiKeys)
      .where(
        and(
          eq(apiKeys.workspaceId, this.ctx.workspaceId),
          isNull(apiKeys.revokedAt)
        )
      )
    if ((active?.n ?? 0) >= MAX_ACTIVE_KEYS)
      throw new BadRequestException({
        message: `A workspace can have up to ${MAX_ACTIVE_KEYS} active API keys. Revoke one first.`,
        code: "api_key_limit",
      })

    const key = `blk_${randomBytes(32).toString("base64url")}`
    const days = input.expiresInDays ?? null
    const [row] = await this.db
      .insert(apiKeys)
      .values({
        workspaceId: this.ctx.workspaceId,
        createdByMemberId: this.ctx.memberId,
        name: input.name,
        prefix: key.slice(0, API_KEY_PREFIX_LENGTH),
        keyHash: hashApiKey(key),
        scopes,
        expiresAt: days ? new Date(Date.now() + days * 86_400_000) : null,
      })
      .returning({ id: apiKeys.id })
    await this.audit.record("api_key.created", {
      resourceType: "api_key",
      resourceId: row!.id,
      metadata: { name: input.name, scopes, expiresInDays: days },
    })
    const [created] = await this.rows(eq(apiKeys.id, row!.id))
    return { apiKey: this.toDto(created!), key }
  }

  async revoke(id: string): Promise<ApiKey> {
    const [row] = await this.db
      .update(apiKeys)
      .set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(apiKeys.workspaceId, this.ctx.workspaceId),
          eq(apiKeys.id, id),
          isNull(apiKeys.revokedAt)
        )
      )
      .returning({ id: apiKeys.id, name: apiKeys.name })
    if (!row) {
      const [existing] = await this.rows(
        and(eq(apiKeys.workspaceId, this.ctx.workspaceId), eq(apiKeys.id, id))!
      )
      if (!existing) throw new NotFoundException("API key not found")
      return this.toDto(existing) // already revoked
    }
    await this.audit.record("api_key.revoked", {
      resourceType: "api_key",
      resourceId: id,
      metadata: { name: row.name },
    })
    const [revoked] = await this.rows(eq(apiKeys.id, id))
    return this.toDto(revoked!)
  }

  /**
   * The key's owner and scopes, or null when it's unknown, revoked or
   * expired. Notes the last use at most once a minute.
   */
  async verify(raw: string): Promise<VerifiedApiKey | null> {
    const [row] = await this.db
      .select({ key: apiKeys, userId: member.userId })
      .from(apiKeys)
      .innerJoin(member, eq(member.id, apiKeys.createdByMemberId))
      .where(eq(apiKeys.keyHash, hashApiKey(raw)))
      .limit(1)
    if (!row || status(row.key) !== "active") return null
    await this.db
      .update(apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(
        and(
          eq(apiKeys.id, row.key.id),
          or(
            isNull(apiKeys.lastUsedAt),
            lt(apiKeys.lastUsedAt, new Date(Date.now() - 60_000))
          )
        )
      )
    return {
      id: row.key.id,
      workspaceId: row.key.workspaceId,
      memberId: row.key.createdByMemberId,
      userId: row.userId,
      scopes: row.key.scopes as Permission[],
    }
  }
}
