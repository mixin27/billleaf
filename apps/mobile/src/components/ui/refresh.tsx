import { onlineManager } from "@tanstack/react-query"
import * as React from "react"
import {
  RefreshControl as RNRefreshControl,
  type RefreshControlProps,
} from "react-native"

import { useTheme } from "@/hooks/use-theme"

import { toast } from "./feedback"

/**
 * Pull to refresh, in the brand colours. Offline, a pull says so instead of
 * spinning until the connection is back (screens refresh by themselves
 * then).
 */
export function RefreshControl({ onRefresh, ...props }: RefreshControlProps) {
  const t = useTheme()
  return (
    <RNRefreshControl
      tintColor={t.primary}
      colors={[t.primary]}
      progressBackgroundColor={t.surface}
      {...props}
      onRefresh={() => {
        if (!onlineManager.isOnline()) {
          toast.info("You're offline. This refreshes when you're back online.")
          return
        }
        onRefresh?.()
      }}
    />
  )
}
