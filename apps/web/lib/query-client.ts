import { isServer, QueryClient } from "@tanstack/react-query"

function makeQueryClient() {
  return new QueryClient({
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
