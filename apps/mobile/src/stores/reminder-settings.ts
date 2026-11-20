import * as React from "react"
import * as SecureStore from "expo-secure-store"
import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

import { DEFAULT_REMINDER_HOURS } from "@/lib/reminder-schedule"

/**
 * After how many hours of running the timer reminder fires, or `null` for
 * no reminder. Kept on this phone (not per workspace or account).
 */
export const useReminderSettings = create<{
  hours: number | null
  setHours: (hours: number | null) => void
}>()(
  persist(
    (set) => ({
      hours: DEFAULT_REMINDER_HOURS,
      setHours: (hours) => set({ hours }),
    }),
    {
      name: "billleaf.timer-reminder",
      storage: createJSONStorage(() => ({
        getItem: (k) => SecureStore.getItemAsync(k),
        setItem: (k, v) => SecureStore.setItemAsync(k, v),
        removeItem: (k) => SecureStore.deleteItemAsync(k),
      })),
      partialize: (s) => ({ hours: s.hours }),
    }
  )
)

/** True once the stored choice is loaded (so "off" never schedules first). */
export function useReminderSettingsHydrated() {
  const [done, setDone] = React.useState(() =>
    useReminderSettings.persist.hasHydrated()
  )
  React.useEffect(
    () => useReminderSettings.persist.onFinishHydration(() => setDone(true)),
    []
  )
  return done
}
