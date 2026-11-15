"use client"

import { useQueryClient } from "@tanstack/react-query"
import { Button } from "@workspace/ui/components/button"
import { useRouter } from "next/navigation"

import { useWorkspaceStore } from "@/features/workspace"
import { signOut } from "@/lib/auth-client"

export function SignOutButton() {
  const router = useRouter()
  const qc = useQueryClient()
  const setWorkspace = useWorkspaceStore((s) => s.setWorkspace)

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={async () => {
        await signOut()
        setWorkspace(null)
        qc.clear()
        router.push("/sign-in")
      }}
    >
      Sign out
    </Button>
  )
}
