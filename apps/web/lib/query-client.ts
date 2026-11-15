import { isServer, MutationCache, QueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { useWorkspaceStore } from "@/features/workspace/stores/workspace-store"

import { ApiError } from "./api"

const UPGRADE_CODES = new Set(["plan_limit_reached", "feature_not_in_plan"])

/**
 * Plan limits surface as a regular error toast at the call site; this adds
 * one (deduplicated) prompt pointing to the plans.
 */
function offerUpgrade(error: unknown) {
  if (!(error instanceof ApiError) || !UPGRADE_CODES.has(error.code ?? ""))
    return
  const slug = useWorkspaceStore.getState().workspace?.slug
  if (!slug) return
  toast("Need more room?", {
    id: "upgrade-prompt",
    description: "Compare plans and upgrade in Settings → Billing.",
    action: {
      label: "See plans",
      onClick: () => window.location.assign(`/${slug}/settings/billing`),
    },
  })
}

function makeQueryClient() {
  return new QueryClient({
    mutationCache: new MutationCache({ onError: offerUpgrade }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (count, error) => {
          const status = (error as { status?: number }).status
          if (status && status >= 400 && status < 500) return false
          return count < 2
        },
      },
    },
  })
}

let browserQueryClient: QueryClient | undefined

/** New client per request on the server; singleton in the browser. */
export function getQueryClient() {
  if (isServer) return makeQueryClient()
  browserQueryClient ??= makeQueryClient()
  return browserQueryClient
}
