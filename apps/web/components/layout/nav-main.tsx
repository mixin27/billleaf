"use client"

import { HugeiconsIcon } from "@hugeicons/react"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@workspace/ui/components/sidebar"
import Link from "next/link"

import type { ResolvedNavItem } from "./use-nav"

export function NavItemLink({ item }: { item: ResolvedNavItem }) {
  const { isMobile, setOpenMobile } = useSidebar()
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={item.active}
        tooltip={item.title}
        render={
          <Link
            href={item.url}
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

export function NavMain({
  groups,
}: {
  groups: { label: string | null; items: ResolvedNavItem[] }[]
}) {
  return (
    <>
      {groups.map((g, i) => (
        <SidebarGroup key={g.label ?? i} className="py-1">
          {g.label ? <SidebarGroupLabel>{g.label}</SidebarGroupLabel> : null}
          <SidebarMenu>
            {g.items.map((item) => (
              <NavItemLink key={item.href} item={item} />
            ))}
          </SidebarMenu>
        </SidebarGroup>
      ))}
    </>
  )
}
