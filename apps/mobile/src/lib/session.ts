import { authClient } from "@/lib/auth-client"
import { queryClient } from "@/lib/query-client"
import { cancelTimerReminder } from "@/lib/timer-reminder"
import { useWorkspaceStore } from "@/stores/workspace-store"

/** Sign out and forget everything this account left on the device. */
export async function signOut() {
  await authClient.signOut()
  useWorkspaceStore.getState().setWorkspace(null)
  queryClient.clear()
  await cancelTimerReminder()
}
