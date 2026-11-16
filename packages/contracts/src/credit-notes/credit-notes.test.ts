import { describe, expect, it } from "vitest"

import { invoiceState } from "../invoices/invoices.schema.js"
import { splitCredit } from "./credit-notes.schema.js"

describe("credit notes", () => {
  it("lowers what's owed first, the rest is a refund", () => {
    expect(
      splitCredit({
        credit: 3_000,
        total: 10_000,
        amountPaid: 0,
        amountCredited: 0,
      })
    ).toEqual({ applied: 3_000, refund: 0, creditable: 10_000 })
    expect(
      splitCredit({
        credit: 3_000,
        total: 10_000,
        amountPaid: 8_000,
        amountCredited: 0,
      })
    ).toEqual({ applied: 2_000, refund: 1_000, creditable: 10_000 })
    expect(
      splitCredit({
        credit: 1_000,
        total: 10_000,
        amountPaid: 10_000,
        amountCredited: 4_000,
      })
    ).toEqual({ applied: 0, refund: 1_000, creditable: 6_000 })
  })

  it("count towards an invoice being settled", () => {
    const base = {
      status: "issued" as const,
      total: 10_000,
      amountPaid: 7_000,
      dueDate: "2026-11-01",
    }
    expect(invoiceState(base, "2026-12-01")).toMatchObject({
      displayStatus: "overdue",
      amountDue: 3_000,
    })
    expect(
      invoiceState({ ...base, amountCredited: 3_000 }, "2026-12-01")
    ).toMatchObject({
      displayStatus: "paid",
      paymentStatus: "paid",
      amountDue: 0,
    })
    expect(
      invoiceState(
        { ...base, amountPaid: 0, amountCredited: 2_000 },
        "2026-10-01"
      )
    ).toMatchObject({ paymentStatus: "partially_paid", amountDue: 8_000 })
  })
})
