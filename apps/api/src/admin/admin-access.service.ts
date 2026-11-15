import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from "@nestjs/common"
import { user } from "@workspace/db"
import { and, eq, inArray, isNull, ne, notInArray, or, sql } from "drizzle-orm"
import type { Redis } from "ioredis"

import { InjectRedis } from "../core/cache/redis.module.js"
import { ENV, type Env } from "../core/config/env.js"
import { InjectDb, type Database } from "../core/database/database.module.js"

const INTENT_TTL_SECONDS = 120

/**
 * Who is a platform admin: the emails in PLATFORM_ADMIN_EMAILS. Mirrored to
 * Better Auth's `user.role = "admin"` (needed for impersonation) on boot
 * and when an admin first uses the portal; removing an email demotes them.
 */
@Injectable()
export class AdminAccessService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AdminAccessService.name)
  private readonly emails: Set<string>

  constructor(
    @InjectDb() private readonly db: Database,
    @Inject(ENV) env: Env,
    @InjectRedis() private readonly redis: Redis
  ) {
    this.emails = new Set(env.PLATFORM_ADMIN_EMAILS.map((e) => e.toLowerCase()))
  }

  isAdminEmail(email: string | null | undefined) {
    return Boolean(email) && this.emails.has(email!.toLowerCase())
  }

  async onApplicationBootstrap() {
    try {
      await this.sync()
    } catch (err) {
      this.logger.error({ err }, "Platform admin sync failed")
    }
  }

  /** Promote listed users, demote everyone else with role "admin". */
  async sync() {
    const list = [...this.emails]
    if (list.length)
      await this.db
        .update(user)
        .set({ role: "admin" })
        .where(
          and(
            inArray(sql`lower(${user.email})`, list),
            or(isNull(user.role), ne(user.role, "admin"))
          )
        )
    await this.db
      .update(user)
      .set({ role: null })
      .where(
        list.length
          ? and(
              eq(user.role, "admin"),
              notInArray(sql`lower(${user.email})`, list)
            )
          : eq(user.role, "admin")
      )
  }

  async promote(userId: string) {
    await this.db.update(user).set({ role: "admin" }).where(eq(user.id, userId))
  }

  private intentKey(adminUserId: string, targetUserId: string) {
    return `billleaf:admin:impersonate:${adminUserId}:${targetUserId}`
  }

  /** Recorded by the admin portal right before Better Auth's impersonate call. */
  async allowNextImpersonation(adminUserId: string, targetUserId: string) {
    await this.redis.set(
      this.intentKey(adminUserId, targetUserId),
      "1",
      "EX",
      INTENT_TTL_SECONDS
    )
  }

  /** One-time check used by the Better Auth before-hook. */
  async consumeImpersonation(adminUserId: string, targetUserId: string) {
    const v = await this.redis.getdel(this.intentKey(adminUserId, targetUserId))
    return v === "1"
  }
}
