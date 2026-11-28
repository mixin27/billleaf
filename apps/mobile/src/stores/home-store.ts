import * as SecureStore from "expo-secure-store"
import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

import type { TimePeriod } from "@/lib/home"
import type { QuickActionKey } from "@/lib/quick-actions"

/**
 * Home's choices, kept on this phone: the quick actions you picked (null =
 * the defaults for your role) and the period the time card shows.
 */
export const useHomeStore = create<{
  quickActions: QuickActionKey[] | null
  period: TimePeriod
  setQuickActions: (keys: QuickActionKey[] | null) => void
  setPeriod: (p: TimePeriod) => void
}>()(
  persist(
    (set) => ({
      quickActions: null,
      period: "week",
      setQuickActions: (quickActions) => set({ quickActions }),
      setPeriod: (period) => set({ period }),
    }),
    {
      name: "billleaf.home",
      storage: createJSONStorage(() => ({
        getItem: (k) => SecureStore.getItemAsync(k),
        setItem: (k, v) => SecureStore.setItemAsync(k, v),
        removeItem: (k) => SecureStore.deleteItemAsync(k),
      })),
      partialize: (s) => ({ quickActions: s.quickActions, period: s.period }),
    }
  )
)
