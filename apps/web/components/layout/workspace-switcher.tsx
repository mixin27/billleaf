"use client"

import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { cn } from "@workspace/ui/lib/utils"
import { useRouter } from "next/navigation"

import { useWorkspaces, useWorkspaceStore } from "@/features/workspace"

/**
 * Switch between workspaces the user belongs to. Navigating to /<slug> lets
 * WorkspaceGate make it the session's active organization.
 */
export function WorkspaceSwitcher({ className }: { className?: string }) {
  const router = useRouter()
  const current = useWorkspaceStore((s) => s.workspace)
  const workspaces = useWorkspaces()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className={cn("max-w-full justify-between gap-2 px-2", className)}
          >
            <span className="truncate">{current?.name ?? "Workspace"}</span>
            <span aria-hidden className="text-xs text-muted-foreground">
              ▾
            </span>
          </Button>
        }
      />
      <DropdownMenuContent align="start" className="min-w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
          {(workspaces.data ?? []).map((w) => (
            <DropdownMenuItem
              key={w.id}
              onClick={() =>
                w.slug !== current?.slug && router.push(`/${w.slug}`)
              }
              className={cn(w.slug === current?.slug && "font-medium")}
            >
              <span className="truncate">{w.name}</span>
              {w.slug === current?.slug ? (
                <span className="ml-auto text-xs">✓</span>
              ) : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push("/onboarding")}>
          Create workspace
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
