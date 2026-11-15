import { createApiClient } from "@workspace/api-client"

import { useWorkspaceStore } from "@/features/workspace/stores/workspace-store"

import { env } from "./env"

/**
 * Typed API client (generated from the API's OpenAPI). The active workspace
 * id is attached as `X-Workspace-Id` from the workspace store.
 */
export const api = createApiClient({
  baseUrl: env.NEXT_PUBLIC_API_URL,
  getWorkspaceId: () => useWorkspaceStore.getState().workspace?.id,
})

/** Unwrap an openapi-fetch result or throw its problem+json error. */
export async function unwrap<
  R extends { data?: unknown; error?: unknown; response: Response },
>(promise: Promise<R>): Promise<NonNullable<R["data"]>> {
  const { data, error, response } = await promise
  if (error !== undefined || !response.ok) {
    throw Object.assign(
      new Error(problemMessage(error) ?? response.statusText),
      {
        status: response.status,
        problem: error,
      }
    )
  }
  return data as NonNullable<R["data"]>
}

function problemMessage(error: unknown): string | undefined {
  if (error && typeof error === "object" && "detail" in error) {
    return String((error as { detail?: unknown }).detail ?? "")
  }
  return undefined
}
