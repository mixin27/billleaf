import { describe, expect, it } from "vitest"

import { invoiceState } from "./invoices.schema.js"

const base = {
  status: "issued" as const,
  total: 10_000,
  amountPaid: 0,
  dueDate: "2026-11-30",
}

describe("invoiceState", () => {
  it("derives open / overdue / partially paid / paid", () => {
    expect(invoiceState(base, "2026-11-15").displayStatus).toBe("open")
    expect(invoiceState(base, "2026-12-01")).toMatchObject({
      displayStatus: "overdue",
      isOverdue: true,
    })
    expect(
      invoiceState({ ...base, amountPaid: 4_000 }, "2026-11-15")
    ).toMatchObject({
      displayStatus: "partially_paid",
      amountDue: 6_000,
    })
    // Partially paid but late still shows overdue.
    expect(
      invoiceState({ ...base, amountPaid: 4_000 }, "2026-12-01").displayStatus
    ).toBe("overdue")
    expect(
      invoiceState({ ...base, amountPaid: 10_000 }, "2026-12-01")
    ).toMatchObject({
      displayStatus: "paid",
      isOverdue: false,
      amountDue: 0,
    })
  })

  it("keeps drafts and void invoices out of overdue", () => {
    expect(
      invoiceState({ ...base, status: "draft" }, "2027-01-01").displayStatus
    ).toBe("draft")
    expect(
      invoiceState({ ...base, status: "void" }, "2027-01-01")
    ).toMatchObject({
      displayStatus: "void",
      isOverdue: false,
    })
  })
})
