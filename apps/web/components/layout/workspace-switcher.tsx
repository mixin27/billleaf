"use client"

import {
  Add01Icon,
  Tick02Icon,
  UnfoldMoreIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { PLANS } from "@workspace/contracts"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@workspace/ui/components/sidebar"
import { useRouter } from "next/navigation"

import { useMe, useWorkspaces, useWorkspaceStore } from "@/features/workspace"

import { initials } from "./initials"

function WorkspaceMark({ name }: { name: string }) {
  return (
    <span className="flex aspect-square size-8 items-center justify-center rounded-md bg-primary text-xs font-semibold text-primary-foreground">
      {initials(name)}
    </span>
  )
}

/**
 * Workspace switcher (sidebar header). Navigating to /<slug> lets
 * WorkspaceGate make it the session's active organization.
 */
export function WorkspaceSwitcher() {
  const router = useRouter()
  const { isMobile } = useSidebar()
  const current = useWorkspaceStore((s) => s.workspace)
  const workspaces = useWorkspaces()
  const me = useMe()
  const plan = me.data?.plan.key
  const name = current?.name ?? "Workspace"

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
            <WorkspaceMark name={name} />
            <span className="grid flex-1 text-left leading-tight">
              <span className="truncate text-sm font-semibold">{name}</span>
              <span className="truncate text-xs text-muted-foreground">
                {plan ? `${PLANS[plan].name} plan` : "Billleaf"}
              </span>
            </span>
            <HugeiconsIcon icon={UnfoldMoreIcon} className="ml-auto size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            side={isMobile ? "bottom" : "right"}
            className="min-w-60"
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
              {(workspaces.data ?? []).map((w) => (
                <DropdownMenuItem
                  key={w.id}
                  onClick={() =>
                    w.slug !== current?.slug && router.push(`/${w.slug}`)
                  }
                >
                  <span className="flex size-6 items-center justify-center rounded border text-[10px] font-semibold">
                    {initials(w.name)}
                  </span>
                  <span className="truncate">{w.name}</span>
                  {w.slug === current?.slug ? (
                    <HugeiconsIcon
                      icon={Tick02Icon}
                      className="ml-auto size-4"
                    />
                  ) : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push("/onboarding")}>
              <HugeiconsIcon icon={Add01Icon} className="size-4" />
              Create workspace
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
