import { Injectable, Logger } from "@nestjs/common"
import type { AccountDeletionCheck } from "@workspace/contracts"
import {
  member,
  memberRoles,
  organization,
  roles,
  timeEntries,
} from "@workspace/db"
import { and, count, eq, inArray, isNull, sql } from "drizzle-orm"

import { InjectDb, type Database } from "../../core/database/database.module.js"
import { AuditService } from "../audit/audit.service.js"
import { PermissionResolver } from "../permissions/permission-resolver.service.js"

/**
 * Deleting your own account (Better Auth `deleteUser`). Allowed once you're
 * not the only owner of any workspace; your memberships go with it, your
 * work in other people's workspaces stays (time entries keep your name).
 */
@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name)

  constructor(
    @InjectDb() private readonly db: Database,
    private readonly audit: AuditService,
    private readonly permissions: PermissionResolver
  ) {}

  /** Workspaces where this user holds the Owner role and nobody else does. */
  async soleOwnerOf(
    userId: string
  ): Promise<AccountDeletionCheck["soleOwnerOf"]> {
    const owned = await this.db
      .select({
        workspaceId: organization.id,
        name: organization.name,
        slug: organization.slug,
        roleId: roles.id,
      })
      .from(member)
      .innerJoin(memberRoles, eq(memberRoles.memberId, member.id))
      .innerJoin(
        roles,
        and(eq(roles.id, memberRoles.roleId), eq(roles.isLocked, true))
      )
      .innerJoin(organization, eq(organization.id, member.organizationId))
      .where(eq(member.userId, userId))
    if (owned.length === 0) return []
    const holders = await this.db
      .select({ roleId: memberRoles.roleId, n: count() })
      .from(memberRoles)
      .where(
        inArray(
          memberRoles.roleId,
          owned.map((o) => o.roleId)
        )
      )
      .groupBy(memberRoles.roleId)
    const alone = new Set(holders.filter((h) => h.n === 1).map((h) => h.roleId))
    return owned
      .filter((o) => alone.has(o.roleId))
      .map((o) => ({
        id: o.workspaceId,
        name: o.name,
        slug: o.slug ?? o.workspaceId,
      }))
  }

  /**
   * Better Auth `beforeDelete`: refuse while the user is a sole owner;
   * otherwise stop their running timers, record the deletion, and drop
   * cached permissions for the workspaces they leave.
   */
  async beforeDelete(user: { id: string; email: string }) {
    const blockers = await this.soleOwnerOf(user.id)
    if (blockers.length)
      throw new Error(
        `You're the only owner of ${blockers.map((b) => b.name).join(", ")}. Delete ${blockers.length === 1 ? "it" : "them"} or make someone else an owner first.`
      )
    const memberships = await this.db
      .select({ id: member.id, workspaceId: member.organizationId })
      .from(member)
      .where(eq(member.userId, user.id))
    if (memberships.length)
      await this.db
        .update(timeEntries)
        .set({
          endedAt: sql`now()`,
          durationSeconds: sql`greatest(1, extract(epoch from (now() - ${timeEntries.startedAt}))::int)`,
        })
        .where(
          and(
            inArray(
              timeEntries.memberId,
              memberships.map((m) => m.id)
            ),
            isNull(timeEntries.endedAt)
          )
        )
    // Recorded before the row goes; the actor is set to null with it.
    await this.audit.record("account.deleted", {
      workspaceId: null,
      resourceType: "user",
      resourceId: user.id,
      metadata: { workspaces: memberships.length },
    })
    for (const m of memberships)
      await this.permissions
        .invalidateWorkspace(m.workspaceId)
        .catch((err) => this.logger.warn({ err }, "Cache invalidation failed"))
  }
}
