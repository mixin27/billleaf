import {
  type LineItem,
  type LineItemInput,
  lineAmounts,
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

/** Validated input lines → rows with positions and computed amounts. */
export function toLineValues(lines: ParsedLine[]): StoredLine[] {
  return lines.map((l, i) => ({
    position: i,
    description: l.description,
    quantity: l.quantity,
    unitPrice: l.unitPrice,
    taxRateBps: l.taxRateBps,
    ...lineAmounts(l),
  }))
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
