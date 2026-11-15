"use client"

import { cn } from "@workspace/ui/lib/utils"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { workspaceNav } from "@/config/nav"
import { SignOutButton } from "@/features/auth"
import { useMe, useWorkspaceStore } from "@/features/workspace"

import { usePermissions } from "../permissions/can"
import { WorkspaceSwitcher } from "./workspace-switcher"

export function AppShell({ children }: { children: React.ReactNode }) {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const me = useMe()
  const { can } = usePermissions()
  const pathname = usePathname()
  const base = `/${workspace?.slug ?? ""}`
  const items = workspaceNav
    .filter((item) => !item.permission || can(item.permission))
    .map((item) => {
      const href = `${base}${item.href}`
      const active =
        item.href === "" ? pathname === base : pathname.startsWith(href)
      return { ...item, href, active }
    })

  return (
    <div className="flex min-h-svh">
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-muted/30 p-4 md:flex">
        <Link href={base} className="mb-6 text-lg font-semibold tracking-tight">
          billleaf
        </Link>
        <WorkspaceSwitcher className="mb-2 -ml-2 w-full" />
        <nav className="flex flex-col gap-1">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-md px-3 py-2 text-sm hover:bg-muted",
                item.active && "bg-muted font-medium"
              )}
            >
              {item.title}
            </Link>
          ))}
        </nav>
        <div className="mt-auto flex items-center justify-between gap-2 text-sm">
          <span className="truncate">{me.data?.user.name}</span>
          <SignOutButton />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile header: the sidebar is hidden below md. */}
        <header className="flex flex-col gap-2 border-b px-4 pt-3 md:hidden">
          <div className="flex items-center justify-between">
            <Link href={base} className="font-semibold tracking-tight">
              billleaf
            </Link>
            <span className="flex items-center gap-1">
              <WorkspaceSwitcher className="max-w-40" />
              <SignOutButton />
            </span>
          </div>
          <nav className="-mx-1 flex gap-1 overflow-x-auto pb-2">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "shrink-0 rounded-md px-3 py-1.5 text-sm hover:bg-muted",
                  item.active && "bg-muted font-medium"
                )}
              >
                {item.title}
              </Link>
            ))}
          </nav>
        </header>
        <main className="min-w-0 flex-1 p-4 sm:p-6 md:p-10">{children}</main>
      </div>
    </div>
  )
}
