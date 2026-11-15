"use client"

import { SidebarInset, SidebarProvider } from "@workspace/ui/components/sidebar"

import { ImpersonationBanner } from "@/features/admin"

import { AppSidebar } from "./app-sidebar"
import { AppTopbar } from "./app-topbar"
import { CommandMenu } from "./command-menu"

/**
 * Authenticated workspace layout: inset sidebar (collapses to icons on
 * desktop, a sheet on mobile) and the page on a raised panel.
 */
export function AppShell({
  children,
  defaultOpen = true,
}: {
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar />
      <SidebarInset className="min-w-0">
        <ImpersonationBanner />
        <AppTopbar />
        <div className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">{children}</div>
      </SidebarInset>
      <CommandMenu />
    </SidebarProvider>
  )
}
