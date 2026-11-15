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

export function formatMoney(money: Money, locale = "en-US"): string {
  const fmt = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: money.currency,
  })
  const digits = fmt.resolvedOptions().maximumFractionDigits ?? 2
  return fmt.format(money.amount / 10 ** digits)
}
