import type { QuoteStatus, QuoteSummary } from "@workspace/contracts"

/** What a quote is now: sent quotes past their date read "Expired". */
export type QuoteDisplay = QuoteStatus | "expired"

export function quoteDisplay(q: Pick<QuoteSummary, "status" | "isExpired">) {
  return q.status === "sent" && q.isExpired ? "expired" : q.status
}

export const QUOTE_STATUS_LABELS: Record<QuoteDisplay, string> = {
  draft: "Draft",
  sent: "Sent",
  accepted: "Accepted",
  declined: "Declined",
  expired: "Expired",
}
