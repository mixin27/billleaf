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
  SESSION_ONLY_KEY,
  WORKSPACE_KEY,
} from "../common/decorators/require-permission.decorator.js"
import { EntitlementsService } from "../billing/entitlements.service.js"
import { InjectDb, type Database } from "../core/database/database.module.js"
import type { VerifiedApiKey } from "./api-keys/api-keys.service.js"
import { PermissionResolver } from "./permissions/permission-resolver.service.js"

interface AuthedRequest {
  ip?: string
  headers: Record<string, string | string[] | undefined>
  session?: {
    user: { id: string }
    session: { activeOrganizationId?: string | null }
  } | null
  /** Set by AppAuthGuard for `Authorization: Bearer blk_…` requests. */
  apiKey?: VerifiedApiKey
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
    @InjectDb() private readonly db: Database,
    private readonly entitlements: EntitlementsService
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
    const ua = req.headers["user-agent"]
    this.ctx.set({
      ip: req.ip?.slice(0, 100),
      userAgent: (Array.isArray(ua) ? ua[0] : ua)?.slice(0, 500),
    })
    if (req.apiKey) {
      const sessionOnly =
        this.reflector.getAllAndOverride<boolean | undefined>(
          SESSION_ONLY_KEY,
          targets
        ) === true
      return this.apiKey(
        req,
        req.apiKey,
        required,
        needsWorkspace && !sessionOnly
      )
    }

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

  /**
   * API key requests: only workspace routes, only the key's own workspace,
   * only on plans with the Developer API. The key acts as its creator, with
   * the key's scopes narrowed to what that member can do today.
   */
  private async apiKey(
    req: AuthedRequest,
    key: VerifiedApiKey,
    required: Permission[],
    /** False for non-workspace and @SessionOnly routes. */
    allowed: boolean
  ): Promise<boolean> {
    this.ctx.set({ userId: key.userId, apiKeyId: key.id })
    if (!allowed)
      throw new ForbiddenException({
        message: "This endpoint isn't available with an API key",
        code: "not_available_with_api_key",
      })
    const header = req.headers[WORKSPACE_HEADER]
    const asked = Array.isArray(header) ? header[0] : header
    if (asked && asked !== key.workspaceId)
      throw new ForbiddenException({
        message: "This API key belongs to another workspace",
        code: "api_key_wrong_workspace",
      })
    this.ctx.set({ workspaceId: key.workspaceId, memberId: key.memberId })
    if (!(await this.entitlements.hasFeature("developerApi")))
      throw new ForbiddenException({
        message:
          "The Developer API isn't included in this workspace's plan. Upgrade to use API keys.",
        code: "feature_not_in_plan",
      })
    const memberPermissions = await this.resolver.resolve(
      key.workspaceId,
      key.memberId
    )
    const permissions = new Set(
      key.scopes.filter((s) => memberPermissions.has(s))
    )
    this.ctx.set({ permissions })
    const missing = required.filter((p) => !permissions.has(p))
    if (missing.length > 0) {
      throw new ForbiddenException({
        message: `This API key doesn't allow: ${missing.join(", ")}`,
        code: "api_key_scope_missing",
      })
    }
    return true
  }
}
