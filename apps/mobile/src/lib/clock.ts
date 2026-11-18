/** "1:05:09" from seconds (same as the web's timer clock). */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`
}

/** Whole seconds from an ISO start to `now` (never negative). */
export function elapsedSeconds(startedAt: string, now: number): number {
  return Math.max(0, Math.floor((now - Date.parse(startedAt)) / 1000))
}
