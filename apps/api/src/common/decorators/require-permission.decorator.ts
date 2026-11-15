import { SetMetadata } from "@nestjs/common"
import type { Permission } from "@workspace/contracts"

export const PERMISSIONS_KEY = "billleaf:permissions"
export const WORKSPACE_KEY = "billleaf:workspace"

/**
 * Require ALL listed permissions in the active workspace.
 * Implies `@RequireWorkspace()`.
 *
 * @example @RequirePermission("invoice.create")
 */
export const RequirePermission = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions)

/** Route needs an active workspace membership but no specific permission. */
export const RequireWorkspace = () => SetMetadata(WORKSPACE_KEY, true)
