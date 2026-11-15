import createClient, { type ClientOptions } from "openapi-fetch"

import type { paths } from "./schema.js"

export type { components, paths } from "./schema.js"

export interface BillleafClientOptions extends ClientOptions {
  /** Active workspace id; sent as `X-Workspace-Id`. */
  getWorkspaceId?: () => string | null | undefined
}

/**
 * Create a typed API client. Cookies carry the Better Auth session, so
 * `credentials: "include"` is the default.
 *
 * @example
 * const api = createApiClient({ baseUrl: env.NEXT_PUBLIC_API_URL })
 * const { data, error } = await api.GET("/v1/roles")
 */
export function createApiClient({
  getWorkspaceId,
  ...options
}: BillleafClientOptions) {
  const client = createClient<paths>({ credentials: "include", ...options })
  client.use({
    onRequest({ request }) {
      const ws = getWorkspaceId?.()
      if (ws) request.headers.set("x-workspace-id", ws)
      return request
    },
  })
  return client
}

export type ApiClient = ReturnType<typeof createApiClient>
