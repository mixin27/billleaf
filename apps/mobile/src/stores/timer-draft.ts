import { create } from "zustand"

export type DraftProject = {
  projectId: string | null
  taskId: string | null
  projectName: string | null
  clientName: string | null
  taskTitle: string | null
}

export const NO_PROJECT: DraftProject = {
  projectId: null,
  taskId: null,
  projectName: null,
  clientName: null,
  taskTitle: null,
}

/**
 * What the next timer starts with, while none is running. The project
 * picker is its own screen, so the choice lives here rather than in the
 * Time screen's state.
 */
export const useTimerDraft = create<{
  description: string
  project: DraftProject
  /** Null follows the project's billing. */
  billable: boolean | null
  setDescription: (d: string) => void
  setProject: (p: DraftProject) => void
  setBillable: (b: boolean | null) => void
  reset: () => void
}>((set) => ({
  description: "",
  project: NO_PROJECT,
  billable: null,
  setDescription: (description) => set({ description }),
  setProject: (project) => set({ project }),
  setBillable: (billable) => set({ billable }),
  reset: () => set({ description: "", project: NO_PROJECT, billable: null }),
}))

/**
 * The project picked for the entry being edited, until Save. Null means
 * "unchanged". The edit sheet clears it when it opens.
 */
export const useEditDraft = create<{
  project: DraftProject | null
  setProject: (p: DraftProject | null) => void
}>((set) => ({
  project: null,
  setProject: (project) => set({ project }),
}))
