import { Injectable, UnauthorizedException } from "@nestjs/common"
import type { Permission } from "@workspace/contracts"
import { ClsService, type ClsStore } from "nestjs-cls"

export interface RequestContextStore extends ClsStore {
  userId?: string
  workspaceId?: string
  memberId?: string
  permissions?: ReadonlySet<Permission>
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

  get hasWorkspace(): boolean {
    return Boolean(this.cls.get("workspaceId"))
  }

  set(values: Partial<RequestContextStore>) {
    for (const [k, v] of Object.entries(values)) {
      this.cls.set(k as keyof RequestContextStore, v as never)
    }
  }
}
