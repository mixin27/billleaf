import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common"

import { RequestContext } from "../../common/context/request-context.js"
import { PortalRepository } from "./portal.repository.js"
import { hashPortalToken, PORTAL_COOKIE, readCookie } from "./portal-tokens.js"

const TOUCH_EVERY_MS = 5 * 60_000

/**
 * Portal routes `/v1/portal/:slug/...`: the `billleaf_portal` cookie must
 * hold a live session for a client of that workspace. Fills the request
 * context with the workspace (so document services scope correctly) and the
 * client. Never grants member permissions.
 */
@Injectable()
export class PortalGuard implements CanActivate {
  constructor(
    private readonly repo: PortalRepository,
    private readonly ctx: RequestContext
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>
      params: Record<string, string>
    }>()
    const token = readCookie(req.headers.cookie, PORTAL_COOKIE)
    if (!token) throw new UnauthorizedException("Sign in to the client portal")
    const session = await this.repo.findSession(hashPortalToken(token))
    if (!session)
      throw new UnauthorizedException("Your portal session has expired")
    const ws = await this.repo.workspaceById(session.workspaceId)
    if (!ws || ws.slug !== req.params.slug)
      throw new UnauthorizedException("Sign in to this portal")
    if (Date.now() - session.lastSeenAt.getTime() > TOUCH_EVERY_MS)
      await this.repo.touchSession(session.id)
    this.ctx.set({
      workspaceId: session.workspaceId,
      portalClientId: session.clientId,
      portalEmail: session.email,
      permissions: new Set(),
    })
    return true
  }
}
