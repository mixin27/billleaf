import { describe, expect, it } from "vitest"

import { QUOTE_STATUS_LABELS, quoteDisplay } from "./quote-status"

describe("quoteDisplay", () => {
  it("reads a sent quote past its date as expired", () => {
    expect(quoteDisplay({ status: "sent", isExpired: true })).toBe("expired")
    expect(quoteDisplay({ status: "sent", isExpired: false })).toBe("sent")
  })
  it("keeps answered quotes and drafts as they are", () => {
    expect(quoteDisplay({ status: "accepted", isExpired: true })).toBe(
      "accepted"
    )
    expect(quoteDisplay({ status: "declined", isExpired: true })).toBe(
      "declined"
    )
    expect(quoteDisplay({ status: "draft", isExpired: false })).toBe("draft")
  })
  it("has a label for every state", () => {
    expect(
      QUOTE_STATUS_LABELS[quoteDisplay({ status: "sent", isExpired: true })]
    ).toBe("Expired")
  })
})
