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

export interface DocumentTotals {
  subtotal: number
  taxTotal: number
  total: number
}

export function documentTotals(
  lines: { quantity: number; unitPrice: number; taxRateBps: number }[]
): DocumentTotals {
  let subtotal = 0
  let taxTotal = 0
  for (const l of lines) {
    const { amount, taxAmount } = lineAmounts(l)
    subtotal += amount
    taxTotal += taxAmount
  }
  return { subtotal, taxTotal, total: subtotal + taxTotal }
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
