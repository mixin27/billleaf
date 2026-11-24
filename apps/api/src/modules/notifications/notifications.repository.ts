import { Injectable } from "@nestjs/common"
import {
  member,
  memberRoles,
  notificationSettings,
  pushDevices,
  rolePermissions,
  roles,
} from "@workspace/db"
import type { RegisterPushDeviceInput } from "@workspace/contracts"
import { and, eq, exists, inArray, ne, notExists, or, sql } from "drizzle-orm"

import { InjectDb, type Database } from "../../core/database/database.module.js"

@Injectable()
export class NotificationsRepository {
  constructor(@InjectDb() private readonly db: Database) {}

  /**
   * Push tokens of the workspace's members who hold `permission` (owners
   * and locked roles hold everything), minus `excludeUserId` and anyone who
   * turned `type` off.
   */
  async recipients(opts: {
    workspaceId: string
    permission: string
    type: string
    excludeUserId: string | null
    /** Only this member (it's about their own work): no permission check. */
    memberId?: string
  }): Promise<{ userId: string; token: string }[]> {
    const grants = this.db
      .select({ one: sql`1` })
      .from(memberRoles)
      .innerJoin(roles, eq(roles.id, memberRoles.roleId))
      .leftJoin(
        rolePermissions,
        and(
          eq(rolePermissions.roleId, roles.id),
          eq(rolePermissions.permissionKey, opts.permission)
        )
      )
      .where(
        and(
          eq(memberRoles.memberId, member.id),
          or(
            eq(roles.isLocked, true),
            sql`${rolePermissions.roleId} is not null`
          )
        )
      )
    const turnedOff = this.db
      .select({ one: sql`1` })
      .from(notificationSettings)
      .where(
        and(
          eq(notificationSettings.userId, member.userId),
          eq(notificationSettings.type, opts.type),
          eq(notificationSettings.enabled, false)
        )
      )
    return this.db
      .selectDistinct({ userId: member.userId, token: pushDevices.token })
      .from(member)
      .innerJoin(pushDevices, eq(pushDevices.userId, member.userId))
      .where(
        and(
          eq(member.organizationId, opts.workspaceId),
          opts.memberId
            ? eq(member.id, opts.memberId)
            : or(eq(member.role, "owner"), exists(grants)),
          notExists(turnedOff),
          opts.excludeUserId ? ne(member.userId, opts.excludeUserId) : undefined
        )
      )
  }

  /** Bind a token to this user (a phone signed in again, maybe as someone else). */
  async upsertDevice(userId: string, input: RegisterPushDeviceInput) {
    const values = {
      userId,
      platform: input.platform,
      deviceName: input.deviceName ?? null,
      appVersion: input.appVersion ?? null,
      lastSeenAt: new Date(),
    }
    await this.db
      .insert(pushDevices)
      .values({ token: input.token, ...values })
      .onConflictDoUpdate({ target: pushDevices.token, set: values })
  }

  async deleteDevice(userId: string, token: string) {
    await this.db
      .delete(pushDevices)
      .where(and(eq(pushDevices.userId, userId), eq(pushDevices.token, token)))
  }

  /** Tokens Expo says no longer exist (worker; any user). */
  async deleteTokens(tokens: string[]) {
    if (!tokens.length) return 0
    const gone = await this.db
      .delete(pushDevices)
      .where(inArray(pushDevices.token, tokens))
      .returning({ id: pushDevices.id })
    return gone.length
  }

  async settings(userId: string) {
    return this.db
      .select({
        type: notificationSettings.type,
        enabled: notificationSettings.enabled,
      })
      .from(notificationSettings)
      .where(eq(notificationSettings.userId, userId))
  }

  async setSetting(userId: string, type: string, enabled: boolean) {
    await this.db
      .insert(notificationSettings)
      .values({ userId, type, enabled })
      .onConflictDoUpdate({
        target: [notificationSettings.userId, notificationSettings.type],
        set: { enabled },
      })
  }
}
