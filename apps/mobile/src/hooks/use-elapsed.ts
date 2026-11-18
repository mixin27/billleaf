import * as React from "react"
import { AppState } from "react-native"

import { elapsedSeconds } from "@/lib/clock"

/**
 * Seconds since `startedAt`, ticking once a second. The tick stops while the
 * app is in the background and the clock is recomputed from `startedAt` when
 * it comes back, so it never drifts.
 */
export function useElapsed(startedAt: string | undefined): number {
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    if (!startedAt) return
    let timer: ReturnType<typeof setInterval> | undefined
    const run = () => {
      setNow(Date.now())
      timer ??= setInterval(() => setNow(Date.now()), 1000)
    }
    const pause = () => {
      if (timer) clearInterval(timer)
      timer = undefined
    }
    run()
    const sub = AppState.addEventListener("change", (s) =>
      s === "active" ? run() : pause()
    )
    return () => {
      pause()
      sub.remove()
    }
  }, [startedAt])
  return startedAt ? elapsedSeconds(startedAt, now) : 0
}
