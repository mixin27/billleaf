import {
  type Discount,
  discountedLines,
  type LineItem,
  type LineItemInput,
} from "@workspace/contracts"

export type ParsedLine = Required<LineItemInput>

export interface StoredLine {
  position: number
  description: string
  quantity: number
  unitPrice: number
  taxRateBps: number
  amount: number
  taxAmount: number
}

/**
 * Validated input lines → rows with positions and computed amounts. With a
 * document discount, each line's tax is on its discounted share.
 */
export function toLineValues(
  lines: ParsedLine[],
  discount?: Discount | null
): StoredLine[] {
  const values = discountedLines(lines, discount)
  return lines.map((l, i) => ({
    position: i,
    description: l.description,
    quantity: l.quantity,
    unitPrice: l.unitPrice,
    taxRateBps: l.taxRateBps,
    amount: values[i]!.amount,
    taxAmount: values[i]!.taxAmount,
  }))
}

/** Stored line → the input shape (to recompute, copy or convert). */
export function toLineInput(l: {
  description: string
  quantity: number | string
  unitPrice: number
  taxRateBps: number
}): ParsedLine {
  return {
    description: l.description,
    quantity: Number(l.quantity),
    unitPrice: l.unitPrice,
    taxRateBps: l.taxRateBps,
  }
}

/** Discount → its two columns (both null when there's none). */
export function discountColumns(d: Discount | null | undefined) {
  return { discountType: d?.type ?? null, discountValue: d?.value ?? null }
}

/** The two columns → Discount, or null. */
export function discountOf(row: {
  discountType: "percent" | "amount" | null
  discountValue: number | null
}): Discount | null {
  return row.discountType && row.discountValue
    ? { type: row.discountType, value: row.discountValue }
    : null
}

/** DB line row → API line item. */
export function toLineItem(
  l: StoredLine & { id: string; quantity: number | string }
): LineItem {
  return {
    id: l.id,
    position: l.position,
    description: l.description,
    quantity: Number(l.quantity),
    unitPrice: l.unitPrice,
    taxRateBps: l.taxRateBps,
    amount: l.amount,
    taxAmount: l.taxAmount,
  }
}
