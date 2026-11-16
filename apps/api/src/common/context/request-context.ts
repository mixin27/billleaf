import { Injectable, UnauthorizedException } from "@nestjs/common"
import type { Permission } from "@workspace/contracts"
import { ClsService, type ClsStore } from "nestjs-cls"

export interface RequestContextStore extends ClsStore {
  userId?: string
  /** Set when the request is authenticated with an API key (acting as userId). */
  apiKeyId?: string
  workspaceId?: string
  memberId?: string
  permissions?: ReadonlySet<Permission>
  /** Request origin, recorded on audit entries. */
  ip?: string
  userAgent?: string
  /** Client-portal requests: the signed-in client (set by PortalGuard). */
  portalClientId?: string
  portalEmail?: string
}

/**
 * Typed accessor for per-request state (AsyncLocalStorage via nestjs-cls).
 * Populated by `WorkspaceGuard`. Repositories read `workspaceId` from here so
 * tenant scoping cannot be forgotten at call sites.
 */
@Injectable()
export class RequestContext {
  constructor(private readonly cls: ClsService<RequestContextStore>) {}

  get userId(): string {
    const v = this.cls.get("userId")
    if (!v) throw new UnauthorizedException()
    return v
  }

  /** The signed-in member's user id, or null (client portal, jobs). */
  get optionalUserId(): string | null {
    return this.cls.get("userId") ?? null
  }

  get workspaceId(): string {
    const v = this.cls.get("workspaceId")
    if (!v) throw new UnauthorizedException("No active workspace")
    return v
  }

  get memberId(): string {
    const v = this.cls.get("memberId")
    if (!v) throw new UnauthorizedException("No active workspace")
    return v
  }

  get permissions(): ReadonlySet<Permission> {
    return this.cls.get("permissions") ?? new Set()
  }

  /** The client of a portal session (portal routes only). */
  get portalClientId(): string {
    const v = this.cls.get("portalClientId")
    if (!v) throw new UnauthorizedException("Sign in to the client portal")
    return v
  }

  get portalEmail(): string {
    return this.cls.get("portalEmail") ?? ""
  }

  /** The API key making this request, or null for a browser session. */
  get apiKeyId(): string | null {
    return this.cls.get("apiKeyId") ?? null
  }

  get hasWorkspace(): boolean {
    return Boolean(this.cls.get("workspaceId"))
  }

  set(values: Partial<RequestContextStore>) {
    for (const [k, v] of Object.entries(values)) {
      this.cls.set(k as keyof RequestContextStore, v as never)
    }
  }
}
