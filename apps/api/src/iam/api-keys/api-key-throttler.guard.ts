import { createHash } from "node:crypto"

import { Injectable } from "@nestjs/common"
import { ThrottlerGuard, type ThrottlerRequest } from "@nestjs/throttler"

import { bearerApiKey } from "./app-auth.guard.js"

/** Requests per minute for one API key (sessions keep the global limit). */
export const API_KEY_RATE_LIMIT = 120

/**
 * Rate limits per API key when one is sent (else per IP). Runs before
 * authentication, so it keys on a hash of the token, not the database row.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(
    req: Record<string, unknown>
  ): Promise<string> {
    const raw = bearerApiKey(
      (req.headers ?? {}) as Record<string, string | string[] | undefined>
    )
    if (raw)
      return `key:${createHash("sha256").update(raw).digest("hex").slice(0, 32)}`
    return super.getTracker(req)
  }

  protected override async handleRequest(
    props: ThrottlerRequest
  ): Promise<boolean> {
    const req = props.context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>
    }>()
    if (bearerApiKey(req.headers))
      return super.handleRequest({
        ...props,
        limit: Math.min(props.limit, API_KEY_RATE_LIMIT),
      })
    return super.handleRequest(props)
  }
}
