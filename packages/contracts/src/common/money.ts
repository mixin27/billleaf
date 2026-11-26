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

/**
 * ISO 4217 minor units for currencies that don't use 2. Fixed here rather
 * than read from Intl, because Intl's answer comes from CLDR and differs
 * between JavaScript engines (MMK is 0 in Node, 2 in some browsers), and
 * the stored integer must mean the same thing everywhere.
 */
const ISO_MINOR_UNITS: Readonly<Record<string, number>> = {
  BIF: 0,
  CLP: 0,
  DJF: 0,
  GNF: 0,
  ISK: 0,
  JPY: 0,
  KMF: 0,
  KRW: 0,
  PYG: 0,
  RWF: 0,
  UGX: 0,
  UYI: 0,
  VND: 0,
  VUV: 0,
  XAF: 0,
  XOF: 0,
  XPF: 0,
  BHD: 3,
  IQD: 3,
  JOD: 3,
  KWD: 3,
  LYD: 3,
  OMR: 3,
  TND: 3,
  CLF: 4,
  UYW: 4,
}

/**
 * Minor-unit digits a currency is stored in (ISO 4217: USD → 2, JPY → 0,
 * MMK → 2). Stored amounts always use this, so it must never change for a
 * currency that has data.
 */
export function currencyDigits(currency: string): number {
  return ISO_MINOR_UNITS[currency] ?? 2
}

/**
 * Currencies whose minor unit exists on paper but isn't used, so amounts
 * are shown and typed as whole numbers (50,000 MMK, not 50,000.00 MMK).
 * Storage is unchanged: MMK is still kept in pya (× 100).
 */
export const WHOLE_NUMBER_CURRENCIES: ReadonlySet<string> = new Set(["MMK"])

/** Decimals shown and accepted for a currency (MMK → 0, USD → 2). */
export function displayDigits(currency: string): number {
  return WHOLE_NUMBER_CURRENCIES.has(currency) ? 0 : currencyDigits(currency)
}

const roundHalfAway = (n: number) => Math.sign(n) * Math.round(Math.abs(n))

/**
 * "12.5" → 1250 (USD), "50,000" → 5000000 (MMK). Returns null for input
 * that is not a valid amount, including more decimals than the currency
 * shows (any decimals for MMK).
 */
export function toMinorUnits(
  value: string | number,
  currency: string
): number | null {
  const s = String(value).trim().replace(/,/g, "")
  if (!/^-?\d*(\.\d*)?$/.test(s) || s === "" || s === "." || s === "-")
    return null
  const digits = currencyDigits(currency)
  const [whole = "0", frac = ""] = s.replace("-", "").split(".")
  if (frac.replace(/0+$/, "").length > displayDigits(currency)) return null
  const minor =
    Number(whole) * 10 ** digits +
    Number(frac.slice(0, digits).padEnd(digits, "0") || 0)
  return s.startsWith("-") ? -minor : minor
}

/**
 * 1250 → "12.50" (USD), 5000000 → "50000" (MMK): a plain decimal string
 * for inputs, with the decimals the currency shows.
 */
export function fromMinorUnits(amount: number, currency: string): string {
  const digits = currencyDigits(currency)
  const shown = displayDigits(currency)
  const scaled = roundHalfAway(amount / 10 ** (digits - shown))
  const sign = scaled < 0 ? "-" : ""
  const abs = Math.abs(scaled)
  if (shown === 0) return `${sign}${abs}`
  const str = String(abs).padStart(shown + 1, "0")
  return `${sign}${str.slice(0, -shown)}.${str.slice(-shown)}`
}

export function formatMoney(money: Money, locale = "en-US"): string {
  const digits = currencyDigits(money.currency)
  const shown = displayDigits(money.currency)
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: money.currency,
    minimumFractionDigits: shown,
    maximumFractionDigits: shown,
  }).format(money.amount / 10 ** digits)
}
