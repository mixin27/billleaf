import { createApiClient } from "@workspace/api-client"
import type { Problem } from "@workspace/contracts"

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

// ApiError / unwrap / errorMessage: same as apps/web/lib/api.ts.

/** Error thrown for any non-2xx API response (RFC 9457 problem details). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly problem: Partial<Problem> | undefined
  ) {
    super(problem?.detail ?? problem?.title ?? `Request failed (${status})`)
    this.name = "ApiError"
  }

  get code() {
    return this.problem?.code
  }

  /** Field errors from a 422, keyed by dotted path. */
  get fieldErrors(): Record<string, string> {
    return Object.fromEntries(
      (this.problem?.errors ?? []).map((e) => [e.path, e.message])
    )
  }
}

/** Unwrap an openapi-fetch result or throw an ApiError. */
export async function unwrap<
  R extends { data?: unknown; error?: unknown; response: Response },
>(promise: Promise<R>): Promise<NonNullable<R["data"]>> {
  const { data, error, response } = await promise
  if (error !== undefined || !response.ok) {
    throw new ApiError(response.status, error as Partial<Problem> | undefined)
  }
  return data as NonNullable<R["data"]>
}

/** Human message for toasts, with friendlier copy for known codes. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 422) {
      const first = error.problem?.errors?.[0]
      return first
        ? `${first.path}: ${first.message}`
        : "Please check the form."
    }
    return error.message
  }
  return error instanceof Error ? error.message : "Something went wrong"
}
