import {
  ForbiddenException,
  UnauthorizedException,
  type ExecutionContext,
} from "@nestjs/common"
import { Reflector } from "@nestjs/core"
import type { Permission } from "@workspace/contracts"
import { describe, expect, it, vi } from "vitest"

import type { RequestContext } from "../common/context/request-context.js"
import {
  PERMISSIONS_KEY,
  WORKSPACE_KEY,
} from "../common/decorators/require-permission.decorator.js"
import type { PermissionResolver } from "./permissions/permission-resolver.service.js"
import { WorkspaceGuard } from "./workspace.guard.js"

const WS = "73d32928-2351-42d0-9db0-23a2fbcb1702"

function setup(opts: {
  required?: Permission[]
  workspace?: boolean
  session?: unknown
  headers?: Record<string, string>
  membership?: { id: string } | null
  granted?: Permission[]
  apiKey?: {
    id: string
    workspaceId: string
    memberId: string
    userId: string
    scopes: Permission[]
  }
  feature?: boolean
}) {
  const reflector = new Reflector()
  vi.spyOn(reflector, "getAllAndOverride").mockImplementation((key) => {
    if (key === PERMISSIONS_KEY) return opts.required
    if (key === WORKSPACE_KEY) return opts.workspace
    return undefined
  })
  const ctx = { set: vi.fn() } as unknown as RequestContext
  const resolver = {
    resolve: vi.fn().mockResolvedValue(new Set(opts.granted ?? [])),
  } as unknown as PermissionResolver
  const chain = {
    select: () => chain,
    from: () => chain,
    where: () => chain,
    limit: () => Promise.resolve(opts.membership ? [opts.membership] : []),
  }
  const entitlements = {
    hasFeature: vi.fn().mockResolvedValue(opts.feature ?? true),
  }
  const guard = new WorkspaceGuard(
    reflector,
    ctx,
    resolver,
    chain as never,
    entitlements as never
  )
  const exec = {
    getType: () => "http",
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({
      getRequest: () => ({
        headers: opts.headers ?? {},
        session: opts.session,
        apiKey: opts.apiKey,
      }),
    }),
  } as unknown as ExecutionContext
  return { guard, exec, ctx, resolver }
}

const session = (activeOrganizationId: string | null = WS) => ({
  user: { id: "user-1" },
  session: { activeOrganizationId },
})

describe("WorkspaceGuard", () => {
  it("lets routes without workspace metadata through", async () => {
    const { guard, exec } = setup({})
    await expect(guard.canActivate(exec)).resolves.toBe(true)
  })

  it("rejects anonymous requests to protected routes", async () => {
    const { guard, exec } = setup({ required: ["role.read"], session: null })
    await expect(guard.canActivate(exec)).rejects.toBeInstanceOf(
      UnauthorizedException
    )
  })

  it("rejects when there is no active workspace", async () => {
    const { guard, exec } = setup({
      required: ["role.read"],
      session: session(null),
    })
    await expect(guard.canActivate(exec)).rejects.toBeInstanceOf(
      ForbiddenException
    )
  })

  it("rejects a malformed X-Workspace-Id", async () => {
    const { guard, exec } = setup({
      workspace: true,
      session: session(null),
      headers: { "x-workspace-id": "not-a-uuid" },
    })
    await expect(guard.canActivate(exec)).rejects.toBeInstanceOf(
      ForbiddenException
    )
  })

  it("rejects non-members", async () => {
    const { guard, exec } = setup({
      required: ["role.read"],
      session: session(),
      membership: null,
    })
    await expect(guard.canActivate(exec)).rejects.toThrow("Not a member")
  })

  it("rejects members missing a permission", async () => {
    const { guard, exec } = setup({
      required: ["role.create"],
      session: session(),
      membership: { id: "m1" },
      granted: ["role.read"],
    })
    await expect(guard.canActivate(exec)).rejects.toThrow("role.create")
  })

  it("allows members holding every permission and populates context", async () => {
    const { guard, exec, ctx, resolver } = setup({
      required: ["role.read", "role.create"],
      session: session(),
      membership: { id: "m1" },
      granted: ["role.read", "role.create"],
    })
    await expect(guard.canActivate(exec)).resolves.toBe(true)
    expect(resolver.resolve).toHaveBeenCalledWith(WS, "m1")
    expect(ctx.set).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: WS, memberId: "m1" })
    )
  })

  it("prefers the X-Workspace-Id header over the session", async () => {
    const other = "11111111-2222-4333-8444-555555555555"
    const { guard, exec, resolver } = setup({
      workspace: true,
      session: session(),
      headers: { "x-workspace-id": other },
      membership: { id: "m2" },
    })
    await guard.canActivate(exec)
    expect(resolver.resolve).toHaveBeenCalledWith(other, "m2")
  })

  describe("with an API key", () => {
    const key = {
      id: "key-1",
      workspaceId: WS,
      memberId: "m-1",
      userId: "user-1",
      scopes: ["client.read", "client.create", "invoice.read"] as Permission[],
    }

    it("acts as the creator with scopes narrowed to their permissions", async () => {
      const { guard, exec, ctx } = setup({
        required: ["client.read"],
        apiKey: key,
        granted: ["client.read", "invoice.read", "role.read"],
      })
      await expect(guard.canActivate(exec)).resolves.toBe(true)
      expect(ctx.set).toHaveBeenCalledWith({
        userId: "user-1",
        apiKeyId: "key-1",
      })
      expect(ctx.set).toHaveBeenCalledWith({
        permissions: new Set(["client.read", "invoice.read"]),
      })
    })

    it("refuses scopes the creator has lost", async () => {
      const { guard, exec } = setup({
        required: ["client.create"],
        apiKey: key,
        granted: ["client.read"],
      })
      await expect(guard.canActivate(exec)).rejects.toMatchObject({
        response: { code: "api_key_scope_missing" },
      })
    })

    it("refuses non-workspace routes, other workspaces and plans without it", async () => {
      await expect(
        setup({ apiKey: key }).guard.canActivate(setup({ apiKey: key }).exec)
      ).rejects.toMatchObject({
        response: { code: "not_available_with_api_key" },
      })
      const other = setup({
        required: ["client.read"],
        apiKey: key,
        granted: ["client.read"],
        headers: { "x-workspace-id": "00000000-0000-4000-8000-000000000000" },
      })
      await expect(other.guard.canActivate(other.exec)).rejects.toMatchObject({
        response: { code: "api_key_wrong_workspace" },
      })
      const free = setup({
        required: ["client.read"],
        apiKey: key,
        granted: ["client.read"],
        feature: false,
      })
      await expect(free.guard.canActivate(free.exec)).rejects.toBeInstanceOf(
        ForbiddenException
      )
    })
  })
})
