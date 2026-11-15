import type { BillingInterval } from "@workspace/contracts"

/**
 * `from` plus `count` billing intervals (calendar months/years, UTC). Month
 * ends clamp, so Jan 31 + 1 month = Feb 28/29 (not Mar 3).
 */
export function addInterval(from: Date, interval: BillingInterval, count = 1) {
  const months = (interval === "year" ? 12 : 1) * count
  const d = new Date(from)
  const day = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + months)
  const lastDay = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)
  ).getUTCDate()
  d.setUTCDate(Math.min(day, lastDay))
  return d
}
