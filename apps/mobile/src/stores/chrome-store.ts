import { create } from "zustand"

/**
 * Heights of the bars at the bottom of the screen, so the timer's
 * mini-player can float just above whichever one is showing: the tab bar
 * (measured by TabBar) and a focused screen's own BottomActionBar (Cash in /
 * Cash out), registered while that screen is focused.
 */
export const useChrome = create<{
  tabBar: number
  bottomBar: { owner: string; height: number } | null
  setTabBar: (h: number) => void
  setBottomBar: (owner: string, height: number) => void
  clearBottomBar: (owner: string) => void
}>((set, get) => ({
  tabBar: 0,
  bottomBar: null,
  setTabBar: (tabBar) => {
    if (get().tabBar !== tabBar) set({ tabBar })
  },
  setBottomBar: (owner, height) => {
    const b = get().bottomBar
    if (b?.owner !== owner || b.height !== height)
      set({ bottomBar: { owner, height } })
  },
  clearBottomBar: (owner) => {
    if (get().bottomBar?.owner === owner) set({ bottomBar: null })
  },
}))
