"use client"

import { Button } from "@workspace/ui/components/button"
import * as React from "react"
import { toast } from "sonner"

import { useMe } from "@/features/workspace"
import { authClient } from "@/lib/auth-client"

/**
 * Shown on every app page while a platform admin is signed in as someone
 * else. "Stop" returns to the admin's own session and the user's admin page.
 */
export function ImpersonationBanner() {
  const me = useMe()
  const [pending, setPending] = React.useState(false)
  const user = me.data?.user
  if (!user?.impersonatedBy) return null
  const stop = async () => {
    setPending(true)
    const { error } = await authClient.admin.stopImpersonating()
    if (error) {
      setPending(false)
      return void toast.error(error.message ?? "Couldn't stop")
    }
    window.location.assign(`/admin/users/${user.id}`)
  }
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-destructive px-4 py-2 text-sm text-white"
    >
      <span className="min-w-0 flex-1">
        Signed in as <strong>{user.name}</strong> ({user.email}). Actions are
        audited.
      </span>
      <Button
        size="sm"
        variant="secondary"
        disabled={pending}
        onClick={() => void stop()}
      >
        Stop
      </Button>
    </div>
  )
}
