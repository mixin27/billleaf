import { Injectable, Logger } from "@nestjs/common"
import { SYSTEM_ROLES, type SystemRoleSlug } from "@workspace/contracts"
import {
  documentSequences,
  memberRoles,
  rolePermissions,
  roles,
  workspaceProfiles,
  workspaceSubscriptions,
  type Transaction,
} from "@workspace/db"
import { and, eq } from "drizzle-orm"

import { InjectDb, type Database } from "../../core/database/database.module.js"
import { PermissionResolver } from "../permissions/permission-resolver.service.js"

const DEFAULT_SEQUENCES = [
  { scope: "quote", prefix: "QUO-" },
  { scope: "invoice", prefix: "INV-" },
  { scope: "receipt", prefix: "RCT-" },
] as const

/**
 * Called from Better Auth organization hooks. Sets up everything a new
 * workspace needs: role templates, owner assignment, free plan, numbering.
 */
@Injectable()
export class WorkspaceBootstrapService {
  private readonly logger = new Logger(WorkspaceBootstrapService.name)

  constructor(
    @InjectDb() private readonly db: Database,
    private readonly resolver: PermissionResolver
  ) {}

  async onWorkspaceCreated(workspaceId: string, ownerMemberId: string) {
    await this.db.transaction(async (tx) => {
      const roleIds = await this.cloneSystemRoles(tx, workspaceId)
      await tx
        .insert(memberRoles)
        .values({ workspaceId, memberId: ownerMemberId, roleId: roleIds.owner })
      await tx
        .insert(workspaceSubscriptions)
        .values({ workspaceId, planKey: "free" })
        .onConflictDoNothing()
      await tx
        .insert(workspaceProfiles)
        .values({ workspaceId })
        .onConflictDoNothing()
      await tx
        .insert(documentSequences)
        .values(DEFAULT_SEQUENCES.map((s) => ({ workspaceId, ...s })))
        .onConflictDoNothing()
    })
    this.logger.log(`Bootstrapped workspace ${workspaceId}`)
  }

  /**
   * A member joined (e.g. accepted an invitation). Better Auth's `member.role`
   * string is treated as the slug of the workspace role to grant.
   */
  async onMemberAdded(workspaceId: string, memberId: string, roleSlug: string) {
    const slug = roleSlug === "owner" ? "member" : roleSlug
    const [role] = await this.db
      .select({ id: roles.id })
      .from(roles)
      .where(and(eq(roles.workspaceId, workspaceId), eq(roles.slug, slug)))
      .limit(1)
    const fallback = role
      ? null
      : (
          await this.db
            .select({ id: roles.id })
            .from(roles)
            .where(
              and(eq(roles.workspaceId, workspaceId), eq(roles.slug, "member"))
            )
            .limit(1)
        )[0]
    const roleId = role?.id ?? fallback?.id
    if (!roleId) return
    await this.db
      .insert(memberRoles)
      .values({ workspaceId, memberId, roleId })
      .onConflictDoNothing()
    await this.resolver.invalidateWorkspace(workspaceId)
  }

  private async cloneSystemRoles(tx: Transaction, workspaceId: string) {
    const ids = {} as Record<SystemRoleSlug, string>
    for (const [slug, tpl] of Object.entries(SYSTEM_ROLES) as [
      SystemRoleSlug,
      (typeof SYSTEM_ROLES)[SystemRoleSlug],
    ][]) {
      const [row] = await tx
        .insert(roles)
        .values({
          workspaceId,
          slug,
          name: tpl.name,
          description: tpl.description,
          isSystem: true,
          isLocked: tpl.locked,
        })
        .returning({ id: roles.id })
      ids[slug] = row!.id
      if (tpl.permissions.length > 0) {
        await tx.insert(rolePermissions).values(
          tpl.permissions.map((permissionKey) => ({
            roleId: row!.id,
            permissionKey,
          }))
        )
      }
    }
    return ids
  }
}
