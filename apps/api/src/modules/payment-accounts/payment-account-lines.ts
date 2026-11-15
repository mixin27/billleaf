/** Text lines describing a payment account (invoice PDF and email). */
export function paymentAccountLines(a: {
  kind: "bank" | "mobile_wallet" | "other"
  accountName: string | null
  accountNumber: string | null
  instructions: string | null
}): string[] {
  const lines: string[] = []
  if (a.accountName) lines.push(`Name: ${a.accountName}`)
  if (a.accountNumber)
    lines.push(
      `${a.kind === "mobile_wallet" ? "Number" : "Account"}: ${a.accountNumber}`
    )
  if (a.instructions)
    lines.push(...a.instructions.split(/\r?\n/).filter(Boolean))
  return lines
}
