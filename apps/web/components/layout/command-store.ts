"use client"

import { create } from "zustand"

/** Open state of the ⌘K command menu, so any button can open it. */
export const useCommandMenu = create<{
  open: boolean
  setOpen: (open: boolean) => void
}>((set) => ({ open: false, setOpen: (open) => set({ open }) }))
