import {
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common"
import { AuthGuard } from "@thallesp/nestjs-better-auth"

import {
  API_KEY_BEARER,
  ApiKeysService,
  type VerifiedApiKey,
} from "./api-keys.service.js"

export type ApiKeyRequest = {
  headers: Record<string, string | string[] | undefined>
  apiKey?: VerifiedApiKey
  session?: unknown
}

/** The `blk_…` key in `Authorization: Bearer …`, if any. */
export function bearerApiKey(headers: ApiKeyRequest["headers"]): string | null {
  const h = headers.authorization
  const value = Array.isArray(h) ? h[0] : h
  return value ? (API_KEY_BEARER.exec(value.trim())?.[1] ?? null) : null
}

/**
 * Global auth guard: an API key (`Authorization: Bearer blk_…`) wins and
 * skips the session; otherwise Better Auth's session guard runs as before.
 * What a key may reach is decided by WorkspaceGuard.
 */
@Injectable()
export class AppAuthGuard extends AuthGuard {
  @Inject(ApiKeysService) private readonly keys!: ApiKeysService

  override async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() === "http") {
      const req = context.switchToHttp().getRequest<ApiKeyRequest>()
      const raw = bearerApiKey(req.headers)
      if (raw) {
        const key = await this.keys.verify(raw)
        if (!key)
          throw new UnauthorizedException({
            message: "This API key is invalid, revoked or expired",
            code: "invalid_api_key",
          })
        req.apiKey = key
        req.session = null
        return true
      }
    }
    return super.canActivate(context)
  }
}
