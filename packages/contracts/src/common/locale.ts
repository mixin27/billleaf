import { z } from "zod"

/** Currencies offered in pickers. Any valid ISO 4217 code is accepted by the API. */
export const COMMON_CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "JPY",
  "SGD",
  "THB",
  "MMK",
  "AUD",
  "CAD",
  "CHF",
  "CNY",
  "HKD",
  "INR",
  "IDR",
  "MYR",
  "PHP",
  "VND",
  "KRW",
  "NZD",
  "AED",
] as const

export const countryCodeSchema = z
  .string()
  .regex(/^[A-Z]{2}$/, "Must be an ISO 3166-1 alpha-2 code, e.g. US")

/** Optional free-text field: trims, and turns "" into null so clearing a field works. */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null))

export const optionalEmail = z
  .union([z.literal(""), z.email().max(254)])
  .nullish()
  .transform((v) => (v ? v : null))

export const optionalUrl = z
  .union([z.literal(""), z.url().max(500)])
  .nullish()
  .transform((v) => (v ? v : null))

export const addressSchema = z.object({
  addressLine1: optionalText(200),
  addressLine2: optionalText(200),
  city: optionalText(100),
  state: optionalText(100),
  postalCode: optionalText(20),
  country: countryCodeSchema.nullish().transform((v) => v ?? null),
})
export type Address = z.infer<typeof addressSchema>
