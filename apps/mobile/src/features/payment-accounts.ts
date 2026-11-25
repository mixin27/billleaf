import { useQuery } from "@tanstack/react-query"

import { api, unwrap } from "@/lib/api"
import { useWorkspaceStore } from "@/stores/workspace-store"

/** The workspace's payment methods (managed on the web). Same key as the web. */
export function usePaymentAccounts() {
  const ws = useWorkspaceStore((s) => s.workspace?.id)
  return useQuery({
    queryKey: ["payment-accounts", ws],
    queryFn: async () => (await unwrap(api.GET("/v1/payment-accounts"))).items,
    enabled: Boolean(ws),
    staleTime: 60_000,
  })
}

/**
 * Whether clients get any way to pay in `currency`: an active payment
 * method that takes it (no currencies listed = any). Matches the API's
 * PaymentAccountsService.forCurrency. `null` while loading.
 */
export function useHasPaymentMethodFor(currency: string | undefined) {
  const accounts = usePaymentAccounts()
  if (!accounts.data || !currency) return null
  return accounts.data.some(
    (a) =>
      a.active && (a.currencies.length === 0 || a.currencies.includes(currency))
  )
}
