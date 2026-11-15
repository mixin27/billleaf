/**
 * Parse a human duration into minutes: "1:30", "1.5", "1h 30m", "90m", "45".
 * A bare number ≤ 12 is hours, otherwise minutes. Returns null if invalid.
 */
export function parseDuration(input: string): number | null {
  const s = input.trim().toLowerCase()
  if (!s) return null
  let m = /^(\d+):([0-5]\d)$/.exec(s)
  if (m) return Number(m[1]) * 60 + Number(m[2])
  m = /^(?:(\d+(?:\.\d+)?)\s*h)?\s*(?:(\d+)\s*m(?:in)?)?$/.exec(s)
  if (m && (m[1] || m[2]))
    return Math.round(Number(m[1] ?? 0) * 60) + Number(m[2] ?? 0)
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s)
    return n <= 12 ? Math.round(n * 60) : Math.round(n)
  }
  return null
}

/** Monday of the week containing `iso` (YYYY-MM-DD). */
export function weekStart(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  const day = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - day)
  return d.toISOString().slice(0, 10)
}

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
