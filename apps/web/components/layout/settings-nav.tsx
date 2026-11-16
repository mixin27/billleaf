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
  { title: "Rates", href: "/settings/rates", permission: "rate.read" },
  {
    title: "Payment methods",
    href: "/settings/payment-methods",
    permission: "workspace.read",
  },
  {
    title: "Webhooks",
    href: "/settings/webhooks",
    permission: "webhook.manage",
  },
  { title: "Billing", href: "/settings/billing", permission: "billing.read" },
  { title: "Audit log", href: "/settings/audit", permission: "audit.read" },
  { title: "Data", href: "/settings/data", permission: "workspace.export" },
]

export function SettingsNav() {
  const slug = useWorkspaceStore((s) => s.workspace?.slug)
  const pathname = usePathname()
  const { can } = usePermissions()
  return (
    <nav className="flex gap-1 overflow-x-auto border-b">
      {items
        .filter((i) => can(i.permission))
        .map((i) => {
          const href = `/${slug}${i.href}`
          return (
            <Link
              key={i.href}
              href={href}
              className={cn(
                "-mb-px shrink-0 border-b-2 border-transparent px-3 py-2 text-sm whitespace-nowrap",
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
