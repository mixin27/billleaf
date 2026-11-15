import { useWorkspaceStore } from "@/features/workspace/stores/workspace-store"

import { ApiError } from "./api"
import { env } from "./env"

/** Fetch an authenticated PDF and open it in a new tab. */
export async function openPdf(path: string) {
  // Open synchronously (inside the click) so popup blockers allow it.
  const tab = window.open("", "_blank")
  const workspaceId = useWorkspaceStore.getState().workspace?.id
  const res = await fetch(`${env.NEXT_PUBLIC_API_URL}${path}`, {
    credentials: "include",
    headers: workspaceId ? { "x-workspace-id": workspaceId } : {},
  })
  if (!res.ok) {
    tab?.close()
    throw new ApiError(res.status, await res.json().catch(() => undefined))
  }
  const url = URL.createObjectURL(await res.blob())
  if (tab) tab.location.href = url
  else window.location.href = url
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
