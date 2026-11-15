import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common"

import { AdminAccessService } from "./admin-access.service.js"

interface AdminRequest {
  session?: {
    user: {
      id: string
      email: string
      role?: string | null
      twoFactorEnabled?: boolean | null
    }
    session: { impersonatedBy?: string | null }
  } | null
}

/**
 * /v1/admin/*: platform admins only (PLATFORM_ADMIN_EMAILS), with 2FA on,
 * and never from an impersonated session. Everyone else gets a 404 so the
 * admin API doesn't advertise itself.
 */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(private readonly access: AdminAccessService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const s = context.switchToHttp().getRequest<AdminRequest>().session
    if (!s) throw new UnauthorizedException()
    if (!this.access.isAdminEmail(s.user.email)) throw new NotFoundException()
    if (s.session.impersonatedBy)
      throw new ForbiddenException({
        message: "Stop impersonating to use the admin portal",
        code: "admin_impersonating",
      })
    if (!s.user.twoFactorEnabled)
      throw new ForbiddenException({
        message: "Turn on two-factor authentication to use the admin portal",
        code: "admin_2fa_required",
      })
    if (s.user.role !== "admin") await this.access.promote(s.user.id)
    return true
  }
}
