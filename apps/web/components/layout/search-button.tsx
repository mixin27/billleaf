"use client"

import { Search01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Kbd } from "@workspace/ui/components/kbd"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@workspace/ui/components/sidebar"

import { useCommandMenu } from "./command-store"

export function SearchButton() {
  const setOpen = useCommandMenu((s) => s.setOpen)
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          tooltip="Search (⌘K)"
          onClick={() => setOpen(true)}
          className="text-muted-foreground"
        >
          <HugeiconsIcon icon={Search01Icon} strokeWidth={1.8} />
          <span>Search</span>
          <Kbd className="ml-auto group-data-[collapsible=icon]:hidden">⌘K</Kbd>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
