import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common"
import { Reflector } from "@nestjs/core"
import type { Permission } from "@workspace/contracts"
import { member } from "@workspace/db"
import { and, eq } from "drizzle-orm"

import { RequestContext } from "../common/context/request-context.js"
import {
  PERMISSIONS_KEY,
  WORKSPACE_KEY,
} from "../common/decorators/require-permission.decorator.js"
import { InjectDb, type Database } from "../core/database/database.module.js"
import { PermissionResolver } from "./permissions/permission-resolver.service.js"

interface AuthedRequest {
  headers: Record<string, string | string[] | undefined>
  session?: {
    user: { id: string }
    session: { activeOrganizationId?: string | null }
  } | null
}

export const WORKSPACE_HEADER = "x-workspace-id"
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Global guard (runs after Better Auth's AuthGuard):
 * 1. Puts the user id into the request context.
 * 2. For routes marked `@RequireWorkspace()` / `@RequirePermission()`, resolves
 *    the workspace (X-Workspace-Id header, else the session's active
 *    organization), verifies membership, loads permissions, and enforces them.
 */
@Injectable()
export class WorkspaceGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly ctx: RequestContext,
    private readonly resolver: PermissionResolver,
    @InjectDb() private readonly db: Database
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== "http") return true
    const targets = [context.getHandler(), context.getClass()]
    const required =
      this.reflector.getAllAndOverride<Permission[] | undefined>(
        PERMISSIONS_KEY,
        targets
      ) ?? []
    const needsWorkspace =
      required.length > 0 ||
      this.reflector.getAllAndOverride<boolean | undefined>(
        WORKSPACE_KEY,
        targets
      ) === true

    const req = context.switchToHttp().getRequest<AuthedRequest>()
    const userId = req.session?.user.id
    if (userId) this.ctx.set({ userId })
    if (!needsWorkspace) return true
    if (!userId) throw new UnauthorizedException()

    const header = req.headers[WORKSPACE_HEADER]
    const workspaceId =
      (Array.isArray(header) ? header[0] : header) ??
      req.session?.session.activeOrganizationId ??
      undefined
    if (!workspaceId || !UUID_RE.test(workspaceId)) {
      throw new ForbiddenException("No active workspace")
    }

    const [membership] = await this.db
      .select({ id: member.id })
      .from(member)
      .where(
        and(eq(member.organizationId, workspaceId), eq(member.userId, userId))
      )
      .limit(1)
    if (!membership)
      throw new ForbiddenException("Not a member of this workspace")

    const permissions = await this.resolver.resolve(workspaceId, membership.id)
    this.ctx.set({ workspaceId, memberId: membership.id, permissions })

    const missing = required.filter((p) => !permissions.has(p))
    if (missing.length > 0) {
      throw new ForbiddenException(`Missing permission: ${missing.join(", ")}`)
    }
    return true
  }
}
