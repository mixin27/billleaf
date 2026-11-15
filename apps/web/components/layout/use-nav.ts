"use client"

import { usePathname } from "next/navigation"

import {
  activeHref,
  type NavGroup,
  type NavItem,
  settingsNavItem,
  workspaceNav,
} from "@/config/nav"
import { useWorkspaceStore } from "@/features/workspace"

import { usePermissions } from "../permissions/can"

export type ResolvedNavItem = NavItem & { url: string; active: boolean }

/** Nav filtered by permission, with absolute URLs and the active item. */
export function useNav() {
  const slug = useWorkspaceStore((s) => s.workspace?.slug)
  const pathname = usePathname()
  const { can } = usePermissions()
  const base = `/${slug ?? ""}`
  const allowed = (i: NavItem) => !i.permission || can(i.permission)
  const all = [...workspaceNav.flatMap((g) => g.items), settingsNavItem]
  const active = activeHref(
    pathname,
    base,
    all.filter(allowed).map((i) => i.href)
  )
  const resolve = (i: NavItem): ResolvedNavItem => ({
    ...i,
    url: `${base}${i.href}`,
    active: i.href === active,
  })
  const groups = workspaceNav
    .map((g): Omit<NavGroup, "items"> & { items: ResolvedNavItem[] } => ({
      label: g.label,
      items: g.items.filter(allowed).map(resolve),
    }))
    .filter((g) => g.items.length > 0)
  const settings = allowed(settingsNavItem) ? resolve(settingsNavItem) : null
  const current =
    [...groups.flatMap((g) => g.items), ...(settings ? [settings] : [])].find(
      (i) => i.active
    ) ?? null
  return { base, groups, settings, current }
}
