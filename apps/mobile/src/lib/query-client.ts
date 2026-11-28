import { focusManager, onlineManager, QueryClient } from "@tanstack/react-query"
import * as Network from "expo-network"
import { AppState, type AppStateStatus, Platform } from "react-native"

import { ApiError, errorKind } from "./api"

/** Refetch active queries when the app returns to the foreground. */
function onAppStateChange(status: AppStateStatus) {
  if (Platform.OS !== "web") focusManager.setFocused(status === "active")
}
AppState.addEventListener("change", onAppStateChange)

/**
 * Online means a connection that reaches the internet. While offline,
 * queries pause (screens keep what they last loaded, no error) and refetch
 * when the connection is back.
 */
const reachable = (s: Network.NetworkState) =>
  s.isConnected !== false && s.isInternetReachable !== false
onlineManager.setEventListener((setOnline) => {
  void Network.getNetworkStateAsync()
    .then((s) => setOnline(reachable(s)))
    .catch(() => {})
  const sub = Network.addNetworkStateListener((s) => setOnline(reachable(s)))
  return () => sub.remove()
})

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Kept a week so the saved copy (lib/query-persist.ts) can open the
      // app offline.
      gcTime: 7 * 24 * 3600_000,
      // Don't retry what won't change (auth, permission, not found,
      // validation); a connection that failed or timed out gets one more go,
      // so the screen can say so within seconds.
      retry: (count, err) => {
        if (err instanceof ApiError && err.status >= 400 && err.status < 500)
          return false
        const kind = errorKind(err)
        if (kind === "offline" || kind === "unreachable" || kind === "timeout")
          return count < 1
        return count < 2
      },
    },
    // Saving offline fails at once with "You're offline" rather than
    // waiting on a spinner for the connection to come back.
    mutations: { networkMode: "always" },
  },
})
