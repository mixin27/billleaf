import { createApiClient } from "@workspace/api-client"

import { authClient } from "./auth-client"
import { API_URL } from "./config"

/** Workspace the app works in (set by the workspace picker). */
let workspaceId: string | null = null
export function setApiWorkspace(id: string | null) {
  workspaceId = id
}

/**
 * Typed API client. Native fetch has no shared cookie jar, so
 * `credentials: "omit"` and the session cookie from the keychain is sent
 * explicitly (with `expo-origin`, as the auth client does).
 */
export const api = createApiClient({
  baseUrl: API_URL,
  credentials: "omit",
  getWorkspaceId: () => workspaceId,
})

api.use({
  async onRequest({ request }) {
    const cookie = await authClient.getCookie()
    if (cookie) request.headers.set("cookie", cookie)
    request.headers.set("expo-origin", "billleaf://")
    return request
  },
})

export { ApiError, errorMessage, unwrap } from "./api-error"
