import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common"
import { member, memberRoles, roles, user } from "@workspace/db"
import { and, eq } from "drizzle-orm"

import { RequestContext } from "../../common/context/request-context.js"
import { InjectDb, type Database } from "../../core/database/database.module.js"
import { AuditService } from "../audit/audit.service.js"
import { PermissionResolver } from "../permissions/permission-resolver.service.js"
import { RolesRepository } from "../roles/roles.repository.js"

@Injectable()
export class MembersService {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly ctx: RequestContext,
    private readonly roles: RolesRepository,
    private readonly resolver: PermissionResolver,
    private readonly audit: AuditService
  ) {}

  async list() {
    const workspaceId = this.ctx.workspaceId
    const members = await this.db
      .select({
        id: member.id,
        userId: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        joinedAt: member.createdAt,
      })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(eq(member.organizationId, workspaceId))

    const assignments = await this.db
      .select({
        memberId: memberRoles.memberId,
        id: roles.id,
        slug: roles.slug,
        name: roles.name,
      })
      .from(memberRoles)
      .innerJoin(roles, eq(roles.id, memberRoles.roleId))
      .where(eq(memberRoles.workspaceId, workspaceId))

    return members.map((m) => ({
      ...m,
      joinedAt: m.joinedAt.toISOString(),
      roles: assignments
        .filter((a) => a.memberId === m.id)
        .map(({ id, slug, name }) => ({ id, slug, name })),
    }))
  }

  /** Replace a member's roles. Guards against orphaning the workspace owner. */
  async setRoles(memberId: string, roleIds: string[]) {
    const workspaceId = this.ctx.workspaceId
    const [target] = await this.db
      .select({ id: member.id })
      .from(member)
      .where(
        and(eq(member.id, memberId), eq(member.organizationId, workspaceId))
      )
      .limit(1)
    if (!target) throw new NotFoundException("Member not found")

    const found = await this.roles.findManyByIds(roleIds)
    if (found.length !== new Set(roleIds).size) {
      throw new BadRequestException("Unknown role in roleIds")
    }

    const ownerRole = (await this.roles.list()).find((r) => r.isLocked)
    const grantsOwner = ownerRole && roleIds.includes(ownerRole.id)
    const actorIsOwner =
      ownerRole &&
      (
        await this.db
          .select({ memberId: memberRoles.memberId })
          .from(memberRoles)
          .where(
            and(
              eq(memberRoles.memberId, this.ctx.memberId),
              eq(memberRoles.roleId, ownerRole.id)
            )
          )
      ).length > 0
    if (grantsOwner && !actorIsOwner) {
      throw new ForbiddenException("Only an owner can grant the owner role")
    }

    await this.db.transaction(async (tx) => {
      if (ownerRole && !grantsOwner) {
        const owners = await tx
          .select({ memberId: memberRoles.memberId })
          .from(memberRoles)
          .where(eq(memberRoles.roleId, ownerRole.id))
        if (owners.length === 1 && owners[0]!.memberId === memberId) {
          throw new BadRequestException(
            "A workspace must keep at least one owner"
          )
        }
      }
      await tx.delete(memberRoles).where(eq(memberRoles.memberId, memberId))
      await tx
        .insert(memberRoles)
        .values(roleIds.map((roleId) => ({ workspaceId, memberId, roleId })))
    })

    await this.resolver.invalidateWorkspace(workspaceId)
    await this.audit.record("member.roles_changed", {
      resourceType: "member",
      resourceId: memberId,
      metadata: { roleIds },
    })
    return { memberId, roleIds }
  }
}
