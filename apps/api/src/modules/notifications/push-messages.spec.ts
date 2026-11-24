import { describe, expect, it } from "vitest"

import { isPushEvent, permissionFor, pushContent } from "./push-messages.js"

describe("pushContent", () => {
  it("says who accepted which quote, with its total", () => {
    const c = pushContent("quote.accepted", {
      id: "q1",
      number: "QUO-0004",
      clientName: "Northwind",
      total: 48000,
      currency: "USD",
      title: "Website care",
    })
    expect(c).toEqual({
      type: "quote.answered",
      title: "Northwind accepted QUO-0004",
      body: "$480.00 · Website care",
      path: "/quote/q1",
    })
  })

  it("gives a declined quote's reason", () => {
    expect(
      pushContent("quote.declined", {
        id: "q1",
        number: "QUO-0004",
        clientName: "Northwind",
        total: 1,
        currency: "USD",
        title: null,
        declineReason: "Too expensive",
      })?.body
    ).toBe("“Too expensive”")
  })

  it("covers payments, proofs, contracts and timesheets", () => {
    expect(
      pushContent("payment.recorded", {
        invoiceId: "i1",
        invoiceNumber: "INV-0001",
        clientName: "Northwind",
        amount: 65000,
        currency: "USD",
      })
    ).toMatchObject({
      type: "payment.received",
      title: "Payment received: $650.00",
      body: "Northwind · INV-0001",
      path: "/invoice/i1",
    })
    expect(
      pushContent("payment_proof.submitted", {
        id: "p1",
        invoiceId: "i1",
        invoiceNumber: "INV-0001",
        clientName: "Northwind",
        amount: 100,
        currency: "USD",
      })?.title
    ).toBe("Proof of payment from Northwind")
    expect(
      pushContent("contract.signed", {
        id: "c1",
        number: "CON-0001",
        clientName: "Northwind",
        title: "Care agreement",
        signedByName: "Ada",
      })
    ).toMatchObject({
      title: "Northwind signed CON-0001",
      body: "Care agreement · Signed by Ada",
      path: "/contract/c1",
    })
    expect(
      pushContent("timesheet.submitted", {
        id: "a1",
        memberName: "Sam",
        weekStart: "2026-11-16",
        totalSeconds: 37 * 3600 + 30 * 60,
      })
    ).toMatchObject({
      type: "timesheet.submitted",
      body: "Week of 2026-11-16 · 37:30",
      path: "/approval/a1",
    })
  })

  it("tells the member their week was approved or sent back", () => {
    const week = {
      id: "a1",
      memberId: "m1",
      weekStart: "2026-11-16",
      totalSeconds: 8 * 3600,
      reviewedByName: "Ada",
      note: null,
    }
    expect(pushContent("timesheet.approved", week)).toEqual({
      type: "timesheet.reviewed",
      title: "Your week of 2026-11-16 was approved",
      body: "8 h · Ada",
      path: "/time?week=2026-11-16",
      memberId: "m1",
    })
    expect(
      pushContent("timesheet.rejected", { ...week, note: "Split Monday" })
    ).toMatchObject({
      title: "Your week of 2026-11-16 was sent back",
      body: "Ada: Split Monday",
      memberId: "m1",
    })
  })

  it("ignores events that don't notify", () => {
    expect(isPushEvent("invoice.paid")).toBe(false)
    expect(pushContent("invoice.paid", {})).toBeNull()
  })

  it("maps types to the permission that sees them", () => {
    expect(permissionFor("payment.received")).toBe("invoice.read")
    expect(permissionFor("timesheet.submitted")).toBe("time.approve")
    expect(permissionFor("timesheet.reviewed")).toBe("time.track")
  })
})
