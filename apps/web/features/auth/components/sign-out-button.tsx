"use client"

import { useQueryClient } from "@tanstack/react-query"
import { Button } from "@workspace/ui/components/button"
import { useRouter } from "next/navigation"

import { useWorkspaceStore } from "@/features/workspace"
import { signOut } from "@/lib/auth-client"

/** Sign out, forget the active workspace and cached data, go to sign-in. */
export function useSignOut() {
  const router = useRouter()
  const qc = useQueryClient()
  const setWorkspace = useWorkspaceStore((s) => s.setWorkspace)
  return async () => {
    await signOut()
    setWorkspace(null)
    qc.clear()
    router.push("/sign-in")
  }
}

export function SignOutButton() {
  const signOutNow = useSignOut()
  return (
    <Button variant="ghost" size="sm" onClick={() => void signOutNow()}>
      Sign out
    </Button>
  )
}
