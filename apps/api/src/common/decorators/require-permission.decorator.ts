import { SetMetadata } from "@nestjs/common"
import type { Permission } from "@workspace/contracts"

export const PERMISSIONS_KEY = "billleaf:permissions"
export const WORKSPACE_KEY = "billleaf:workspace"
export const SESSION_ONLY_KEY = "billleaf:session-only"

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

/**
 * Route needs a signed-in person (a browser session), never an API key:
 * e.g. it reads the session itself, or manages the account.
 */
export const SessionOnly = () => SetMetadata(SESSION_ONLY_KEY, true)
