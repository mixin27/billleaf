import { Injectable } from "@nestjs/common"
import { isPermission, type Permission } from "@workspace/contracts"
import { memberRoles, rolePermissions } from "@workspace/db"
import { and, eq } from "drizzle-orm"
import type { Redis } from "ioredis"

import { InjectRedis } from "../../core/cache/redis.module.js"
import { InjectDb, type Database } from "../../core/database/database.module.js"

const TTL_SECONDS = 300

/**
 * Resolves a member's effective permission set (union of all their roles).
 *
 * Cached in Redis under a per-workspace version key, so any role/membership
 * change invalidates the whole workspace with a single INCR.
 */
@Injectable()
export class PermissionResolver {
  constructor(
    @InjectDb() private readonly db: Database,
    @InjectRedis() private readonly redis: Redis
  ) {}

  async resolve(
    workspaceId: string,
    memberId: string
  ): Promise<Set<Permission>> {
    const version = await this.safe(() =>
      this.redis.get(this.versionKey(workspaceId))
    )
    const cacheKey = `rbac:${workspaceId}:${version ?? 0}:${memberId}`

    const cached = await this.safe(() => this.redis.smembers(cacheKey))
    if (cached && cached.length > 0) {
      return new Set(cached.filter(isPermission))
    }

    const rows = await this.db
      .selectDistinct({ key: rolePermissions.permissionKey })
      .from(memberRoles)
      .innerJoin(
        rolePermissions,
        eq(rolePermissions.roleId, memberRoles.roleId)
      )
      .where(
        and(
          eq(memberRoles.workspaceId, workspaceId),
          eq(memberRoles.memberId, memberId)
        )
      )
    const perms = new Set(rows.map((r) => r.key).filter(isPermission))

    if (perms.size > 0) {
      await this.safe(() =>
        this.redis
          .multi()
          .sadd(cacheKey, ...perms)
          .expire(cacheKey, TTL_SECONDS)
          .exec()
      )
    }
    return perms
  }

  /** Call after any change to roles, role permissions or member roles. */
  async invalidateWorkspace(workspaceId: string) {
    await this.safe(() => this.redis.incr(this.versionKey(workspaceId)))
  }

  private versionKey(workspaceId: string) {
    return `rbac:v:${workspaceId}`
  }

  /** Cache is an optimisation — never fail a request because Redis is down. */
  private async safe<T>(fn: () => Promise<T>): Promise<T | null> {
    try {
      if (this.redis.status === "wait") await this.redis.connect()
      return await fn()
    } catch {
      return null
    }
  }
}
