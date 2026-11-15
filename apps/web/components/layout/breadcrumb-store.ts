"use client"

import * as React from "react"
import { create } from "zustand"

/**
 * The current page's own title (e.g. "INV-0012"), shown as the last
 * breadcrumb after the nav section. Set by PageHeader.
 */
export const useBreadcrumbStore = create<{
  title: string | null
  setTitle: (title: string | null) => void
}>((set) => ({ title: null, setTitle: (title) => set({ title }) }))

export function useBreadcrumbTitle(title: string | null | undefined) {
  const setTitle = useBreadcrumbStore((s) => s.setTitle)
  React.useEffect(() => {
    setTitle(title ?? null)
    return () => setTitle(null)
  }, [title, setTitle])
}
