import { create } from "zustand"

export interface ActiveWorkspace {
  id: string
  slug: string
  name: string
}

interface WorkspaceState {
  workspace: ActiveWorkspace | null
  setWorkspace: (workspace: ActiveWorkspace | null) => void
}

/**
 * Client-only state: which workspace is active in this tab. Server data about
 * the workspace lives in TanStack Query, not here.
 */
export const useWorkspaceStore = create<WorkspaceState>()((set) => ({
  workspace: null,
  setWorkspace: (workspace) => set({ workspace }),
}))
