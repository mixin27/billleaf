import { authClient } from "@/lib/auth-client"
import { unregisterPush } from "@/lib/push"
import { queryClient } from "@/lib/query-client"
import { clearPersistedQueries } from "@/lib/query-persist"
import { cancelTimerReminder } from "@/lib/timer-reminder"
import { useWorkspaceStore } from "@/stores/workspace-store"

/** Sign out and forget everything this account left on the device. */
export async function signOut() {
  // While the session still works: the route needs it.
  await unregisterPush()
  await authClient.signOut()
  useWorkspaceStore.getState().setWorkspace(null)
  queryClient.clear()
  await clearPersistedQueries()
  await cancelTimerReminder()
}
