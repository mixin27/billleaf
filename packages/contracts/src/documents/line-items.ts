import { z } from "zod"

/**
 * Line-item math shared by quotes and invoices (and by the web preview, so
 * what the user sees is exactly what the API stores).
 *
 * - unitPrice: integer minor units
 * - quantity: up to 3 decimals (e.g. 1.5 hours)
 * - taxRateBps: basis points (700 = 7%)
 * Rounding: half away from zero, per line, then summed.
 */
export const MAX_LINES = 200

export const lineItemInputSchema = z.object({
  description: z.string().trim().min(1, "Required").max(2000),
  quantity: z
    .number()
    .positive()
    .max(1_000_000)
    .refine(
      (q) => Math.abs(q * 1000 - Math.round(q * 1000)) < 1e-6,
      "At most 3 decimals"
    ),
  unitPrice: z.number().int().min(0).max(1_000_000_000_00),
  taxRateBps: z.number().int().min(0).max(10_000).default(0),
})
export type LineItemInput = z.input<typeof lineItemInputSchema>

export const lineItemSchema = z.object({
  id: z.string(),
  position: z.number().int(),
  description: z.string(),
  quantity: z.number(),
  unitPrice: z.number().int(),
  taxRateBps: z.number().int(),
  amount: z.number().int(),
  taxAmount: z.number().int(),
})
export type LineItem = z.infer<typeof lineItemSchema>

const roundHalfAway = (n: number) => Math.sign(n) * Math.round(Math.abs(n))

export function lineAmounts(line: {
  quantity: number
  unitPrice: number
  taxRateBps: number
}) {
  const qtyMilli = Math.round(line.quantity * 1000)
  const amount = roundHalfAway((qtyMilli * line.unitPrice) / 1000)
  const taxAmount = roundHalfAway((amount * line.taxRateBps) / 10_000)
  return { amount, taxAmount }
}

/**
 * An optional discount on the whole document, taken off before tax.
 * `percent` is in basis points (1000 = 10%); `amount` is minor units in
 * the document's currency (capped at the subtotal).
 */
export const discountSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("percent"),
    value: z.number().int().min(1).max(10_000),
  }),
  z.object({
    type: z.literal("amount"),
    value: z.number().int().min(1).max(1_000_000_000_00),
  }),
])
export type Discount = z.infer<typeof discountSchema>

type LineInput = { quantity: number; unitPrice: number; taxRateBps: number }

/** The discount in minor units for a subtotal. */
export function discountAmount(
  subtotal: number,
  discount: Discount | null | undefined
): number {
  if (!discount || subtotal <= 0) return 0
  return discount.type === "percent"
    ? Math.min(subtotal, roundHalfAway((subtotal * discount.value) / 10_000))
    : Math.min(subtotal, discount.value)
}

/**
 * Per-line values with the document discount applied: the discount is
 * shared across lines in proportion to their amounts (leftover minor
 * units go to the largest remainders), and each line's tax is on what's
 * left. `amount` stays quantity × unit price.
 */
export function discountedLines(
  lines: LineInput[],
  discount?: Discount | null
): { amount: number; discount: number; taxAmount: number }[] {
  const amounts = lines.map((l) => lineAmounts(l).amount)
  const subtotal = amounts.reduce((s, a) => s + a, 0)
  const total = discountAmount(subtotal, discount)
  const shares = amounts.map((a) =>
    total ? Math.floor((total * a) / subtotal) : 0
  )
  let left = total - shares.reduce((s, x) => s + x, 0)
  const order = amounts
    .map((a, i) => ({ i, rest: total ? (total * a) % subtotal : 0 }))
    .sort((x, y) => y.rest - x.rest || x.i - y.i)
  for (const { i } of order) {
    if (left <= 0) break
    shares[i]! += 1
    left -= 1
  }
  return lines.map((l, i) => ({
    amount: amounts[i]!,
    discount: shares[i]!,
    taxAmount: roundHalfAway(
      ((amounts[i]! - shares[i]!) * l.taxRateBps) / 10_000
    ),
  }))
}

export interface DocumentTotals {
  /** Lines before the discount. */
  subtotal: number
  discountTotal: number
  taxTotal: number
  /** subtotal − discountTotal + taxTotal */
  total: number
}

export function documentTotals(
  lines: LineInput[],
  discount?: Discount | null
): DocumentTotals {
  let subtotal = 0
  let discountTotal = 0
  let taxTotal = 0
  for (const l of discountedLines(lines, discount)) {
    subtotal += l.amount
    discountTotal += l.discount
    taxTotal += l.taxAmount
  }
  return {
    subtotal,
    discountTotal,
    taxTotal,
    total: subtotal - discountTotal + taxTotal,
  }
}

/** "10%" for a percentage discount (for a "Discount (10%)" label); null for a fixed amount. */
export function discountLabel(discount: Discount): string | null {
  return discount.type === "percent"
    ? `${(discount.value / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`
    : null
}

/** Party block frozen onto a document when it is issued (immutable afterwards). */
export const partySnapshotSchema = z.object({
  name: z.string(),
  legalName: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  taxId: z.string().nullable().optional(),
  addressLines: z.array(z.string()),
})
export type PartySnapshot = z.infer<typeof partySnapshotSchema>
