import { focusManager, QueryClient } from "@tanstack/react-query"
import { AppState, type AppStateStatus, Platform } from "react-native"

import { ApiError } from "./api"

/** Refetch active queries when the app returns to the foreground. */
function onAppStateChange(status: AppStateStatus) {
  if (Platform.OS !== "web") focusManager.setFocused(status === "active")
}
AppState.addEventListener("change", onAppStateChange)

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Don't retry what won't change: auth, permission, not found, validation.
      retry: (count, err) =>
        !(err instanceof ApiError && err.status >= 400 && err.status < 500) &&
        count < 2,
    },
  },
})
