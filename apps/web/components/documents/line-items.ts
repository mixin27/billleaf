import {
  fromMinorUnits,
  type LineItem,
  toMinorUnits,
} from "@workspace/contracts"

/** Line item as edited in forms (strings, so partial input is allowed). */
export type LineFormValues = {
  description: string
  quantity: string
  unitPrice: string
  taxRate: string
}

export const emptyLine = (taxBps = 0): LineFormValues => ({
  description: "",
  quantity: "1",
  unitPrice: "",
  taxRate: taxBps ? String(taxBps / 100) : "",
})

export function toLineFormValues(
  lines: Pick<
    LineItem,
    "description" | "quantity" | "unitPrice" | "taxRateBps"
  >[],
  currency: string
): LineFormValues[] {
  return lines.map((l) => ({
    description: l.description,
    quantity: String(l.quantity),
    unitPrice: fromMinorUnits(l.unitPrice, currency),
    taxRate: l.taxRateBps ? String(l.taxRateBps / 100) : "",
  }))
}

/** Parse a line's strings; null fields mean "invalid" (shown inline). */
export function parseLine(l: LineFormValues, currency: string) {
  const quantity = Number.parseFloat(l.quantity)
  const unitPrice = toMinorUnits(l.unitPrice || "0", currency)
  const taxRateBps = Math.round(Number.parseFloat(l.taxRate || "0") * 100)
  return {
    description: l.description.trim(),
    quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : null,
    unitPrice: unitPrice !== null && unitPrice >= 0 ? unitPrice : null,
    taxRateBps:
      Number.isFinite(taxRateBps) && taxRateBps >= 0 && taxRateBps <= 10_000
        ? taxRateBps
        : null,
  }
}

/** Parsed lines ready for the API, or null if any line is invalid. */
export function toApiLines(lines: LineFormValues[], currency: string) {
  const parsed = lines.map((l) => parseLine(l, currency))
  if (
    parsed.some(
      (l) =>
        !l.description ||
        l.quantity === null ||
        l.unitPrice === null ||
        l.taxRateBps === null
    )
  ) {
    return null
  }
  return parsed.map((l) => ({
    description: l.description,
    quantity: l.quantity!,
    unitPrice: l.unitPrice!,
    taxRateBps: l.taxRateBps!,
  }))
}
