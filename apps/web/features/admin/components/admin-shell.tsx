"use client"

import { Button } from "@workspace/ui/components/button"
import { Card, CardContent } from "@workspace/ui/components/card"
import { Separator } from "@workspace/ui/components/separator"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@workspace/ui/components/sidebar"
import { Skeleton } from "@workspace/ui/components/skeleton"
import {
  ArrowLeft01Icon,
  Building03Icon,
  CheckmarkBadge01Icon,
  DashboardSquare01Icon,
  Shield01Icon,
  Tag01Icon,
  Task01Icon,
  UserGroupIcon,
  WorkHistoryIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import * as React from "react"

import { ApiError } from "@/lib/api"

import { useAdminOverview } from "../api/queries"

const NAV: { title: string; href: string; icon: IconSvgElement }[] = [
  { title: "Overview", href: "/admin", icon: DashboardSquare01Icon },
  { title: "Approvals", href: "/admin/approvals", icon: CheckmarkBadge01Icon },
  { title: "Workspaces", href: "/admin/workspaces", icon: Building03Icon },
  { title: "Users", href: "/admin/users", icon: UserGroupIcon },
  { title: "Pricing", href: "/admin/pricing", icon: Tag01Icon },
  { title: "Jobs", href: "/admin/jobs", icon: Task01Icon },
  { title: "Audit log", href: "/admin/audit", icon: WorkHistoryIcon },
]

function AdminNavItem({ item }: { item: (typeof NAV)[number] }) {
  const pathname = usePathname()
  const { isMobile, setOpenMobile } = useSidebar()
  const active =
    item.href === "/admin"
      ? pathname === "/admin"
      : pathname.startsWith(item.href)
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={active}
        tooltip={item.title}
        render={
          <Link
            href={item.href}
            onClick={() => isMobile && setOpenMobile(false)}
          />
        }
      >
        <HugeiconsIcon icon={item.icon} strokeWidth={1.8} />
        <span>{item.title}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

/**
 * Platform admin area: its own sidebar, gated by the API (404 for
 * non-admins, a 2FA prompt for admins without it).
 */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const gate = useAdminOverview()

  if (gate.isPending)
    return (
      <div className="p-8">
        <Skeleton className="h-40 w-full" />
      </div>
    )
  if (gate.error) {
    const code = gate.error instanceof ApiError ? gate.error.code : undefined
    return (
      <div className="flex min-h-svh items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col gap-3">
            {code === "admin_2fa_required" ? (
              <>
                <p className="text-lg font-semibold">
                  Turn on two-factor first
                </p>
                <p className="text-sm text-muted-foreground">
                  The platform admin portal needs two-factor authentication on
                  your account. Set it up under Your account, then come back.
                </p>
              </>
            ) : code === "admin_impersonating" ? (
              <p className="text-sm">
                Stop impersonating to use the admin portal.
              </p>
            ) : (
              <>
                <p className="text-lg font-semibold">Page not found</p>
                <p className="text-sm text-muted-foreground">
                  There's nothing here.
                </p>
              </>
            )}
            <Button
              className="self-start"
              nativeButton={false}
              render={<Link href="/app" />}
            >
              Back to Billleaf
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <SidebarProvider>
      <Sidebar variant="inset" collapsible="icon">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" render={<Link href="/admin" />}>
                <span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
                  <HugeiconsIcon icon={Shield01Icon} strokeWidth={1.8} />
                </span>
                <span className="flex flex-col leading-tight">
                  <span className="font-semibold">Billleaf</span>
                  <span className="text-xs text-muted-foreground">
                    Platform admin
                  </span>
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarMenu>
              {NAV.map((n) => (
                <AdminNavItem key={n.href} item={n} />
              ))}
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="Back to app"
                render={<Link href="/app" />}
              >
                <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={1.8} />
                <span>Back to app</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="min-w-0">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3 sm:px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-1 h-4" />
          <span className="text-sm font-medium">Platform admin</span>
          <span className="ml-auto rounded bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
            Staff only · actions are audited
          </span>
        </header>
        <div className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}
