"use client"

import { cn } from "@workspace/ui/lib/utils"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { workspaceNav } from "@/config/nav"
import { SignOutButton } from "@/features/auth"
import { useMe, useWorkspaceStore } from "@/features/workspace"

import { usePermissions } from "../permissions/can"

export function AppShell({ children }: { children: React.ReactNode }) {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const me = useMe()
  const { can } = usePermissions()
  const pathname = usePathname()
  const base = `/${workspace?.slug ?? ""}`

  return (
    <div className="flex min-h-svh">
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-muted/30 p-4 md:flex">
        <Link href={base} className="mb-6 text-lg font-semibold tracking-tight">
          billleaf
        </Link>
        <p className="mb-2 text-xs text-muted-foreground uppercase">
          {workspace?.name}
        </p>
        <nav className="flex flex-col gap-1">
          {workspaceNav
            .filter((item) => !item.permission || can(item.permission))
            .map((item) => {
              const href = `${base}${item.href}`
              const active =
                item.href === "" ? pathname === base : pathname.startsWith(href)
              return (
                <Link
                  key={item.href}
                  href={href}
                  className={cn(
                    "rounded-md px-3 py-2 text-sm hover:bg-muted",
                    active && "bg-muted font-medium"
                  )}
                >
                  {item.title}
                </Link>
              )
            })}
        </nav>
        <div className="mt-auto flex items-center justify-between gap-2 text-sm">
          <span className="truncate">{me.data?.user.name}</span>
          <SignOutButton />
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-6 md:p-10">{children}</main>
    </div>
  )
}
