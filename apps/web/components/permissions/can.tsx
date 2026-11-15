"use client"

import type { Permission } from "@workspace/contracts"

import { useMe } from "@/features/workspace"

/** Hook: does the current member hold every listed permission? */
export function usePermissions() {
  const me = useMe()
  const set = new Set(me.data?.permissions ?? [])
  return {
    isLoading: me.isPending,
    can: (...perms: Permission[]) => perms.every((p) => set.has(p)),
  }
}

/**
 * Hide UI the member is not allowed to use. Cosmetic only — the API enforces
 * permissions on every request.
 */
export function Can({
  permission,
  children,
  fallback = null,
}: {
  permission: Permission | Permission[]
  children: React.ReactNode
  fallback?: React.ReactNode
}) {
  const { can } = usePermissions()
  const perms = Array.isArray(permission) ? permission : [permission]
  return <>{can(...perms) ? children : fallback}</>
}
