"use client"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarRail,
} from "@workspace/ui/components/sidebar"

import { SidebarTimer } from "@/features/time"

import { NavItemLink, NavMain } from "./nav-main"
import { NavUser } from "./nav-user"
import { SearchButton } from "./search-button"
import { useNav } from "./use-nav"
import { WorkspaceSwitcher } from "./workspace-switcher"

export function AppSidebar() {
  const { groups, settings } = useNav()
  return (
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader className="gap-1">
        <WorkspaceSwitcher />
        <SearchButton />
        <SidebarTimer />
      </SidebarHeader>
      <SidebarContent>
        <NavMain groups={groups} />
      </SidebarContent>
      <SidebarFooter>
        {settings ? (
          <SidebarMenu>
            <NavItemLink item={settings} />
          </SidebarMenu>
        ) : null}
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
