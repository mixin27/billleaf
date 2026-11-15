"use client"

import {
  ComputerIcon,
  Logout01Icon,
  Shield01Icon,
  UserIcon,
  Moon02Icon,
  Sun03Icon,
  UnfoldMoreIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@workspace/ui/components/sidebar"
import Link from "next/link"
import { useTheme } from "next-themes"

import { useSignOut } from "@/features/auth"
import { useMe, useWorkspaceStore } from "@/features/workspace"

import { initials } from "./initials"

const THEMES = [
  { value: "light", label: "Light", icon: Sun03Icon },
  { value: "dark", label: "Dark", icon: Moon02Icon },
  { value: "system", label: "System", icon: ComputerIcon },
] as const

export function NavUser() {
  const me = useMe()
  const slug = useWorkspaceStore((st) => st.workspace?.slug)
  const { isMobile } = useSidebar()
  const { theme, setTheme } = useTheme()
  const signOut = useSignOut()
  const user = me.data?.user

  const avatar = (
    <Avatar className="size-8 rounded-md">
      {user?.image ? <AvatarImage src={user.image} alt="" /> : null}
      <AvatarFallback className="rounded-md text-xs">
        {initials(user?.name)}
      </AvatarFallback>
    </Avatar>
  )
  const identity = (
    <span className="grid flex-1 text-left leading-tight">
      <span className="truncate text-sm font-medium">{user?.name}</span>
      <span className="truncate text-xs text-muted-foreground">
        {user?.email}
      </span>
    </span>
  )

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                className="data-popup-open:bg-sidebar-accent"
              />
            }
          >
            {avatar}
            {identity}
            <HugeiconsIcon icon={UnfoldMoreIcon} className="ml-auto size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side={isMobile ? "bottom" : "right"}
            align="end"
            className="min-w-60"
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="flex items-center gap-2 font-normal">
                {avatar}
                {identity}
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>Theme</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={theme ?? "system"}
                onValueChange={(v) => setTheme(String(v))}
              >
                {THEMES.map((t) => (
                  <DropdownMenuRadioItem key={t.value} value={t.value}>
                    <HugeiconsIcon icon={t.icon} className="size-4" />
                    {t.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<Link href={`/${slug}/account`} />}>
              <HugeiconsIcon icon={UserIcon} className="size-4" />
              Your account
            </DropdownMenuItem>
            {user?.isPlatformAdmin ? (
              <DropdownMenuItem render={<Link href="/admin" />}>
                <HugeiconsIcon icon={Shield01Icon} className="size-4" />
                Platform admin
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem onClick={() => void signOut()}>
              <HugeiconsIcon icon={Logout01Icon} className="size-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
