import * as SecureStore from "expo-secure-store"
import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

export type Appearance = "system" | "light" | "dark"

/** Light, dark or follow the phone; remembered across launches. */
export const useAppearanceStore = create<{
  appearance: Appearance
  setAppearance: (a: Appearance) => void
}>()(
  persist(
    (set) => ({
      appearance: "system",
      setAppearance: (appearance) => set({ appearance }),
    }),
    {
      name: "billleaf.appearance",
      storage: createJSONStorage(() => ({
        getItem: (k) => SecureStore.getItemAsync(k),
        setItem: (k, v) => SecureStore.setItemAsync(k, v),
        removeItem: (k) => SecureStore.deleteItemAsync(k),
      })),
      partialize: (s) => ({ appearance: s.appearance }),
    }
  )
)
