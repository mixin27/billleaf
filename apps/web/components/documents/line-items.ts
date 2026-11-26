import {
  type Discount,
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

/** The document discount as edited in forms. */
export type DiscountFormValues = {
  discountType: "none" | "percent" | "amount"
  discountValue: string
}

export function toDiscountFormValues(
  d: Discount | null | undefined,
  currency: string
): DiscountFormValues {
  if (!d) return { discountType: "none", discountValue: "" }
  return d.type === "percent"
    ? { discountType: "percent", discountValue: String(d.value / 100) }
    : {
        discountType: "amount",
        discountValue: fromMinorUnits(d.value, currency),
      }
}

/**
 * The form's discount for the API: null for none (or an empty value),
 * undefined when the value can't be read (shown as invalid).
 */
export function parseDiscount(
  v: Partial<DiscountFormValues>,
  currency: string
): Discount | null | undefined {
  const raw = (v.discountValue ?? "").trim()
  if (!v.discountType || v.discountType === "none" || !raw) return null
  if (v.discountType === "percent") {
    const bps = Math.round(Number.parseFloat(raw) * 100)
    return Number.isFinite(bps) && bps >= 1 && bps <= 10_000
      ? { type: "percent", value: bps }
      : undefined
  }
  const minor = toMinorUnits(raw, currency)
  return minor !== null && minor >= 1
    ? { type: "amount", value: minor }
    : undefined
}
