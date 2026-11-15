"use client"

import type { Permission } from "@workspace/contracts"
import { cn } from "@workspace/ui/lib/utils"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { useWorkspaceStore } from "@/features/workspace"

import { usePermissions } from "../permissions/can"

const items: { title: string; href: string; permission: Permission }[] = [
  { title: "General", href: "/settings/general", permission: "workspace.read" },
  { title: "Members", href: "/settings/members", permission: "member.read" },
  {
    title: "Roles & permissions",
    href: "/settings/roles",
    permission: "role.read",
  },
]

export function SettingsNav() {
  const slug = useWorkspaceStore((s) => s.workspace?.slug)
  const pathname = usePathname()
  const { can } = usePermissions()
  return (
    <nav className="flex gap-1 border-b">
      {items
        .filter((i) => can(i.permission))
        .map((i) => {
          const href = `/${slug}${i.href}`
          return (
            <Link
              key={i.href}
              href={href}
              className={cn(
                "-mb-px border-b-2 border-transparent px-3 py-2 text-sm",
                pathname.startsWith(href)
                  ? "border-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {i.title}
            </Link>
          )
        })}
    </nav>
  )
}
