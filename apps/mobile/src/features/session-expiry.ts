import * as React from "react"

import { toast } from "@/components/ui"
import { ApiError } from "@/lib/api"
import { authClient } from "@/lib/auth-client"
import { queryClient } from "@/lib/query-client"
import { signOut } from "@/lib/session"

/**
 * A 401 from the API means the session ended (signed out elsewhere,
 * expired, revoked). Check with the auth server once; if it's really gone,
 * sign out here too, so you land on sign-in instead of errors everywhere.
 */
export function useSessionExpiry() {
  const checking = React.useRef(false)
  React.useEffect(() => {
    const onError = async (error: unknown) => {
      if (!(error instanceof ApiError) || error.status !== 401) return
      if (checking.current) return
      checking.current = true
      try {
        const res = await authClient.getSession({
          query: { disableCookieCache: true },
        })
        // Only a clear "no session" signs out; a failed check doesn't.
        if (!res.error && !res.data?.session) {
          toast.info("Your session has ended. Sign in again.")
          await signOut()
        }
      } finally {
        checking.current = false
      }
    }
    const unQueries = queryClient.getQueryCache().subscribe((e) => {
      if (e.type === "updated" && e.action.type === "error")
        void onError(e.action.error)
    })
    const unMutations = queryClient.getMutationCache().subscribe((e) => {
      if (e.type === "updated" && e.action.type === "error")
        void onError(e.action.error)
    })
    return () => {
      unQueries()
      unMutations()
    }
  }, [])
}
