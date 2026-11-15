import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common"
import type { Invitation } from "@workspace/contracts"
import {
  invitation,
  invitationRoles,
  member,
  memberRoles,
  organization,
  roles,
  user,
} from "@workspace/db"
import { invitationEmail } from "@workspace/emails"
import { and, count, desc, eq, gt, sql } from "drizzle-orm"

import { EntitlementsService } from "../../billing/entitlements.service.js"
import { RequestContext } from "../../common/context/request-context.js"
import { ENV, type Env } from "../../core/config/env.js"
import { InjectDb, type Database } from "../../core/database/database.module.js"
import { MailService } from "../../mail/mail.service.js"
import { AuditService } from "../audit/audit.service.js"

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Workspace invitations. Rows live in Better Auth's `invitation` table (so its
 * accept/reject endpoints work), with the intended workspace role recorded in
 * `invitation_roles`. Authorization is Billleaf RBAC (`member.invite`), not
 * Better Auth's built-in roles.
 */
@Injectable()
export class InvitationsService {
  constructor(
    @InjectDb() private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly ctx: RequestContext,
    private readonly entitlements: EntitlementsService,
    private readonly mail: MailService,
    private readonly audit: AuditService
  ) {}

  async listPending(): Promise<Invitation[]> {
    const rows = await this.db
      .select({
        inv: invitation,
        role: { id: roles.id, slug: roles.slug, name: roles.name },
        inviter: user.name,
      })
      .from(invitation)
      .leftJoin(
        invitationRoles,
        eq(invitationRoles.invitationId, invitation.id)
      )
      .leftJoin(roles, eq(roles.id, invitationRoles.roleId))
      .leftJoin(user, eq(user.id, invitation.inviterId))
      .where(
        and(
          eq(invitation.organizationId, this.ctx.workspaceId),
          eq(invitation.status, "pending")
        )
      )
      .orderBy(desc(invitation.createdAt))
    const now = Date.now()
    return rows.map((r) => ({
      id: r.inv.id,
      email: r.inv.email,
      role: r.role?.id ? r.role : null,
      status: r.inv.status as Invitation["status"],
      expiresAt: r.inv.expiresAt.toISOString(),
      createdAt: r.inv.createdAt.toISOString(),
      isExpired: r.inv.expiresAt.getTime() < now,
      invitedBy: r.inviter ?? null,
    }))
  }

  async create(email: string, roleId: string): Promise<Invitation> {
    const workspaceId = this.ctx.workspaceId
    const role = await this.requireRole(roleId)
    if (role.isLocked && !(await this.actorIsOwner())) {
      throw new ForbiddenException("Only an owner can invite another owner")
    }

    const [existingMember] = await this.db
      .select({ id: member.id })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(
        and(
          eq(member.organizationId, workspaceId),
          sql`lower(${user.email}) = ${email}`
        )
      )
      .limit(1)
    if (existingMember)
      throw new ConflictException("This person is already a member")

    const [pending] = await this.db
      .select({ id: invitation.id })
      .from(invitation)
      .where(
        and(
          eq(invitation.organizationId, workspaceId),
          eq(invitation.status, "pending"),
          gt(invitation.expiresAt, new Date()),
          sql`lower(${invitation.email}) = ${email}`
        )
      )
      .limit(1)
    if (pending)
      throw new ConflictException(
        "An invitation is already pending for this email"
      )

    await this.entitlements.assertWithinLimit(
      "members",
      await this.seatsInUse()
    )

    const id = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(invitation)
        .values({
          organizationId: workspaceId,
          email,
          role: "member",
          status: "pending",
          expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
          inviterId: this.ctx.userId,
        })
        .returning({ id: invitation.id })
      await tx
        .insert(invitationRoles)
        .values({ invitationId: row!.id, workspaceId, roleId })
      return row!.id
    })

    await this.sendEmail(id)
    await this.audit.record("member.invited", {
      resourceType: "invitation",
      resourceId: id,
      metadata: { email, roleId },
    })
    return (await this.listPending()).find((i) => i.id === id)!
  }

  async resend(id: string): Promise<Invitation> {
    await this.requirePending(id)
    await this.db
      .update(invitation)
      .set({ expiresAt: new Date(Date.now() + INVITATION_TTL_MS) })
      .where(eq(invitation.id, id))
    await this.sendEmail(id)
    return (await this.listPending()).find((i) => i.id === id)!
  }

  async cancel(id: string): Promise<void> {
    await this.requirePending(id)
    await this.db
      .update(invitation)
      .set({ status: "canceled" })
      .where(eq(invitation.id, id))
    await this.audit.record("member.invitation_canceled", {
      resourceType: "invitation",
      resourceId: id,
    })
  }

  /** Members + live pending invitations — what counts against the plan's seat limit. */
  private async seatsInUse() {
    const workspaceId = this.ctx.workspaceId
    const [[members], [invites]] = await Promise.all([
      this.db
        .select({ n: count() })
        .from(member)
        .where(eq(member.organizationId, workspaceId)),
      this.db
        .select({ n: count() })
        .from(invitation)
        .where(
          and(
            eq(invitation.organizationId, workspaceId),
            eq(invitation.status, "pending"),
            gt(invitation.expiresAt, new Date())
          )
        ),
    ])
    return (members?.n ?? 0) + (invites?.n ?? 0)
  }

  private async sendEmail(id: string) {
    const [row] = await this.db
      .select({
        email: invitation.email,
        workspace: organization.name,
        inviter: user.name,
      })
      .from(invitation)
      .innerJoin(organization, eq(organization.id, invitation.organizationId))
      .leftJoin(user, eq(user.id, invitation.inviterId))
      .where(eq(invitation.id, id))
      .limit(1)
    if (!row) return
    await this.mail.send(
      invitationEmail({
        to: row.email,
        workspaceName: row.workspace,
        inviterName: row.inviter ?? "A teammate",
        url: `${this.env.WEB_URL}/accept-invitation/${id}`,
      })
    )
  }

  private async requirePending(id: string) {
    const [row] = await this.db
      .select({ status: invitation.status })
      .from(invitation)
      .where(
        and(
          eq(invitation.id, id),
          eq(invitation.organizationId, this.ctx.workspaceId)
        )
      )
      .limit(1)
    if (!row) throw new NotFoundException("Invitation not found")
    if (row.status !== "pending")
      throw new BadRequestException("Invitation is no longer pending")
  }

  private async requireRole(roleId: string) {
    const [role] = await this.db
      .select()
      .from(roles)
      .where(
        and(eq(roles.id, roleId), eq(roles.workspaceId, this.ctx.workspaceId))
      )
      .limit(1)
    if (!role) throw new BadRequestException("Unknown role")
    return role
  }

  private async actorIsOwner() {
    const [row] = await this.db
      .select({ id: roles.id })
      .from(memberRoles)
      .innerJoin(roles, eq(roles.id, memberRoles.roleId))
      .where(
        and(
          eq(memberRoles.memberId, this.ctx.memberId),
          eq(roles.isLocked, true)
        )
      )
      .limit(1)
    return Boolean(row)
  }
}
