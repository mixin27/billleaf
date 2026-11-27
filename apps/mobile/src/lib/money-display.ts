import { displayDigits, fromMinorUnits } from "@workspace/contracts"

export type AmountSign = "in" | "out" | "auto" | "none"

/**
 * A money amount as CashBook shows it: a plain grouped number in the
 * currency's own decimals (whole kyat for MMK), signed and toned by
 * direction. `in` → "+150,000" green, `out` → "−45,000" red, `auto` signs
 * by value (negative is red), `none` shows the bare number.
 */
export function signedAmount(
  minor: number,
  currency: string,
  locale: string | undefined,
  sign: AmountSign = "none"
): { text: string; tone: "in" | "out" | "default" } {
  const digits = displayDigits(currency)
  const nf = new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
  const abs = nf.format(Number(fromMinorUnits(Math.abs(minor), currency)))
  if (sign === "in") return { text: `+${abs}`, tone: "in" }
  if (sign === "out") return { text: `−${abs}`, tone: "out" }
  if (sign === "auto")
    return minor < 0
      ? { text: `−${abs}`, tone: "out" }
      : { text: abs, tone: "default" }
  return { text: minor < 0 ? `−${abs}` : abs, tone: "default" }
}
