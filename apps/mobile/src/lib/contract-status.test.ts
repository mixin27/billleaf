import { describe, expect, it } from "vitest"

import { CONTRACT_STATUS_LABELS, contractTone } from "./contract-status"

describe("contract status", () => {
  it("labels every state like the web", () => {
    expect(CONTRACT_STATUS_LABELS.sent).toBe("Awaiting signature")
    expect(Object.keys(CONTRACT_STATUS_LABELS)).toHaveLength(5)
  })
  it("colours signed as good and declined or void as bad", () => {
    expect(contractTone("signed")).toBe("good")
    expect(contractTone("declined")).toBe("bad")
    expect(contractTone("void")).toBe("bad")
    expect(contractTone("sent")).toBe("neutral")
  })
})
