import { z } from "zod"

/**
 * Money is always stored and transported as an integer amount in the
 * currency's minor unit (e.g. cents) plus an ISO 4217 currency code.
 * Never use floating point for money.
 */
export const currencyCodeSchema = z
  .string()
  .length(3)
  .regex(/^[A-Z]{3}$/, "Must be an ISO 4217 code, e.g. USD")

export const moneySchema = z.object({
  amount: z.number().int(),
  currency: currencyCodeSchema,
})
export type Money = z.infer<typeof moneySchema>

/** Number of minor-unit digits for a currency (USD → 2, JPY → 0). */
export function currencyDigits(currency: string): number {
  try {
    return (
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
      }).resolvedOptions().maximumFractionDigits ?? 2
    )
  } catch {
    return 2
  }
}

/** "12.5" → 1250 (USD). Returns null for input that is not a valid amount. */
export function toMinorUnits(
  value: string | number,
  currency: string
): number | null {
  const s = String(value).trim().replace(/,/g, "")
  if (!/^-?\d*(\.\d*)?$/.test(s) || s === "" || s === "." || s === "-")
    return null
  const digits = currencyDigits(currency)
  const [whole = "0", frac = ""] = s.replace("-", "").split(".")
  if (frac.length > digits) return null
  const minor =
    Number(whole) * 10 ** digits + Number(frac.padEnd(digits, "0") || 0)
  return s.startsWith("-") ? -minor : minor
}

/** 1250 → "12.50" (USD), plain decimal string for inputs. */
export function fromMinorUnits(amount: number, currency: string): string {
  const digits = currencyDigits(currency)
  const sign = amount < 0 ? "-" : ""
  const abs = Math.abs(amount)
  if (digits === 0) return `${sign}${abs}`
  const s = String(abs).padStart(digits + 1, "0")
  return `${sign}${s.slice(0, -digits)}.${s.slice(-digits)}`
}

export function formatMoney(money: Money, locale = "en-US"): string {
  const digits = currencyDigits(money.currency)
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: money.currency,
  }).format(money.amount / 10 ** digits)
}
