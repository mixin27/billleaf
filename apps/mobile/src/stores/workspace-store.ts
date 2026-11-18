import * as SecureStore from "expo-secure-store"
import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

import { setApiWorkspace } from "@/lib/api"

export type ActiveWorkspace = { id: string; slug: string; name: string }

/**
 * The workspace the app works in, remembered across launches (in the
 * keychain, like the session). Every API call sends its id.
 */
export const useWorkspaceStore = create<{
  workspace: ActiveWorkspace | null
  setWorkspace: (ws: ActiveWorkspace | null) => void
}>()(
  persist(
    (set) => ({
      workspace: null,
      setWorkspace: (workspace) => {
        setApiWorkspace(workspace?.id ?? null)
        set({ workspace })
      },
    }),
    {
      name: "billleaf.workspace",
      storage: createJSONStorage(() => ({
        getItem: (k) => SecureStore.getItemAsync(k),
        setItem: (k, v) => SecureStore.setItemAsync(k, v),
        removeItem: (k) => SecureStore.deleteItemAsync(k),
      })),
      partialize: (s) => ({ workspace: s.workspace }),
      onRehydrateStorage: () => (state) =>
        setApiWorkspace(state?.workspace?.id ?? null),
    }
  )
)
