import { formatMoney } from "@workspace/contracts"

/** Display helpers. Pass the workspace locale when available. */
export function money(amount: number, currency: string, locale?: string) {
  try {
    return formatMoney({ amount, currency }, locale)
  } catch {
    return `${currency} ${amount}`
  }
}

/** "2026-11-15" → "Nov 15, 2026" (date-only, no timezone shift). */
export function formatDate(iso: string | null | undefined, locale = "en-US") {
  if (!iso) return "—"
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number)
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y!, m! - 1, d!)))
}
