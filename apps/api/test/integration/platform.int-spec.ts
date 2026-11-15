import { workspaceSubscriptions } from "@workspace/db"
import { eq } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { Client, startApp, type TestApp } from "./harness.js"

let t: TestApp

beforeAll(async () => {
  t = await startApp()
})

afterAll(async () => {
  await t?.close()
})

describe("workspace bootstrap & RBAC", () => {
  it("gives the creator an Owner role with every permission", async () => {
    const owner = new Client(t)
    await owner.signUp("Owner")
    await owner.createWorkspace("Bootstrap")

    const roles = await owner.get("/v1/roles")
    expect(roles.status).toBe(200)
    expect(roles.body.map((r: { slug: string }) => r.slug).sort()).toEqual([
      "accountant",
      "admin",
      "member",
      "owner",
    ])

    const me = await owner.get("/v1/me")
    expect(me.status).toBe(200)
    expect(me.body.permissions).toContain("workspace.delete")
    expect(me.body.permissions).toContain("invoice.void")

    const profile = await owner.get("/v1/workspace")
    expect(profile.body).toMatchObject({
      defaultCurrency: "USD",
      paymentTermsDays: 14,
    })
  })

  it("rejects anonymous requests and validates input", async () => {
    const anon = new Client(t)
    expect((await anon.get("/v1/clients")).status).toBe(401)

    const owner = new Client(t)
    await owner.signUp("Validator")
    await owner.createWorkspace("Validation")
    const bad = await owner.post("/v1/clients", {
      name: "",
      email: "nope",
      country: "usa",
    })
    expect(bad.status).toBe(422)
    expect(bad.body.errors.map((e: { path: string }) => e.path).sort()).toEqual(
      ["country", "email", "name"]
    )
  })
})

describe("tenant isolation", () => {
  it("never exposes one workspace's data to another workspace's members", async () => {
    const alice = new Client(t)
    await alice.signUp("Alice")
    await alice.createWorkspace("Alpha")
    const created = await alice.post("/v1/clients", { name: "Alpha's client" })
    expect(created.status).toBe(201)
    const clientId = created.body.id

    const bob = new Client(t)
    await bob.signUp("Bob")
    const bobWs = await bob.createWorkspace("Beta")

    // Bob in his own workspace sees nothing, and cannot fetch Alice's client by id.
    expect((await bob.get("/v1/clients")).body.items).toEqual([])
    expect((await bob.get(`/v1/clients/${clientId}`)).status).toBe(404)
    expect(
      (await bob.patch(`/v1/clients/${clientId}`, { name: "hijack" })).status
    ).toBe(404)

    // Pointing the header at Alice's workspace is rejected: not a member.
    bob.workspaceId = alice.workspaceId
    const res = await bob.get("/v1/clients")
    expect(res.status).toBe(403)
    expect(res.body.detail).toMatch(/not a member/i)
    bob.workspaceId = bobWs.id
  })
})

describe("quotes", () => {
  it("assigns gap-free numbers under concurrent sends", async () => {
    const owner = new Client(t)
    await owner.signUp("Quoter")
    await owner.createWorkspace("Quotes")
    const client = (await owner.post("/v1/clients", { name: "Buyer" })).body
    const line = {
      description: "Work",
      quantity: 1.5,
      unitPrice: 333333,
      taxRateBps: 900,
    }

    const drafts = await Promise.all(
      [1, 2, 3].map(() =>
        owner.post("/v1/quotes", { clientId: client.id, lines: [line] })
      )
    )
    for (const d of drafts) {
      expect(d.status).toBe(201)
      expect(d.body).toMatchObject({
        subtotal: 500000,
        taxTotal: 45000,
        total: 545000,
      })
    }

    // Send the same quote 3× at once: exactly one wins.
    const sameQuote = await Promise.all(
      [1, 2, 3].map(() => owner.post(`/v1/quotes/${drafts[0]!.body.id}/send`))
    )
    expect(sameQuote.filter((r) => r.status === 200)).toHaveLength(1)
    expect(sameQuote.filter((r) => r.status === 409)).toHaveLength(2)

    // Send the other two concurrently: distinct, consecutive numbers.
    const others = await Promise.all(
      drafts.slice(1).map((d) => owner.post(`/v1/quotes/${d.body.id}/send`))
    )
    const numbers = [
      sameQuote.find((r) => r.status === 200)!.body.number,
      ...others.map((r) => r.body.number),
    ].sort()
    expect(numbers).toEqual(["QUO-0001", "QUO-0002", "QUO-0003"])

    // Sent quotes are frozen, and the client can no longer be deleted.
    expect(
      (await owner.patch(`/v1/quotes/${drafts[1]!.body.id}`, { title: "x" }))
        .status
    ).toBe(409)
    const del = await owner.del(`/v1/clients/${client.id}`)
    expect(del.status).toBe(409)
    expect(del.body.code).toBe("client_has_documents")
  })
})

describe("invitations", () => {
  it("enforces the seat limit, then grants exactly the invited role on accept", async () => {
    const owner = new Client(t)
    await owner.signUp("Inviter")
    const ws = await owner.createWorkspace("Team")
    const accountant = (await owner.get("/v1/roles")).body.find(
      (r: { slug: string }) => r.slug === "accountant"
    )

    const invitee = new Client(t)
    const { email } = await invitee.signUp("Invitee")

    // Free plan: one seat, already used by the owner.
    const blocked = await owner.post("/v1/invitations", {
      email,
      roleId: accountant.id,
    })
    expect(blocked.status).toBe(403)
    expect(blocked.body.code).toBe("plan_limit_reached")

    await t.db
      .update(workspaceSubscriptions)
      .set({ planKey: "team" })
      .where(eq(workspaceSubscriptions.workspaceId, ws.id))

    const inv = await owner.post("/v1/invitations", {
      email: email.toUpperCase(),
      roleId: accountant.id,
    })
    expect(inv.status).toBe(201)
    expect(inv.body).toMatchObject({
      email,
      status: "pending",
      role: { slug: "accountant" },
    })

    // Better Auth's own invite endpoint is disabled in favour of ours.
    expect(
      (
        await owner.post("/api/auth/organization/invite-member", {
          email,
          role: "member",
        })
      ).status
    ).toBe(404)

    const accepted = await invitee.post(
      "/api/auth/organization/accept-invitation",
      { invitationId: inv.body.id }
    )
    expect(accepted.status).toBe(200)

    invitee.workspaceId = ws.id
    const me = await invitee.get("/v1/me")
    expect(me.status).toBe(200)
    expect(me.body.permissions).toContain("invoice.send")
    expect(me.body.permissions).not.toContain("client.create")
    expect((await invitee.post("/v1/clients", { name: "nope" })).status).toBe(
      403
    )

    // Removal revokes access immediately (permission cache invalidated).
    const members = (await owner.get("/v1/members")).body
    const target = members.find((m: { email: string }) => m.email === email)
    expect((await owner.del(`/v1/members/${target.id}`)).status).toBe(204)
    expect((await invitee.get("/v1/me")).status).toBe(403)
  })
})

describe("invoices", () => {
  it("converts an accepted quote once, issues with a gap-free number, renders a PDF, voids", async () => {
    const owner = new Client(t)
    await owner.signUp("Biller")
    await owner.createWorkspace("Billing")
    const client = (
      await owner.post("/v1/clients", {
        name: "Payer",
        email: "ap@payer.test",
        paymentTermsDays: 30,
      })
    ).body

    const quote = (
      await owner.post("/v1/quotes", {
        clientId: client.id,
        lines: [
          {
            description: "Build",
            quantity: 2,
            unitPrice: 50_000,
            taxRateBps: 700,
          },
        ],
      })
    ).body
    expect(
      (await owner.post(`/v1/invoices/from-quote/${quote.id}`)).status
    ).toBe(409) // not accepted yet
    await owner.post(`/v1/quotes/${quote.id}/send`)
    await owner.post(`/v1/quotes/${quote.id}/accept`)

    // Two concurrent conversions: exactly one invoice.
    const conversions = await Promise.all(
      [1, 2].map(() => owner.post(`/v1/invoices/from-quote/${quote.id}`))
    )
    expect(conversions.map((r) => r.status).sort()).toEqual([201, 409])
    const draft = conversions.find((r) => r.status === 201)!.body
    expect(draft).toMatchObject({
      status: "draft",
      quoteId: quote.id,
      total: 107_000,
      displayStatus: "draft",
    })
    expect((await owner.get(`/v1/quotes/${quote.id}`)).body.invoiceId).toBe(
      draft.id
    )

    const issued = await owner.post(`/v1/invoices/${draft.id}/issue`)
    expect(issued.status).toBe(200)
    expect(issued.body).toMatchObject({
      number: "INV-0001",
      displayStatus: "open",
      amountDue: 107_000,
    })
    expect(issued.body.clientSnapshot.email).toBe("ap@payer.test")
    expect(issued.body.dueDate > issued.body.issueDate).toBe(true)

    const pdf = await t.app.inject({
      method: "GET",
      url: `/v1/invoices/${draft.id}/pdf`,
      headers: owner.headers(),
    })
    expect(pdf.statusCode).toBe(200)
    expect(pdf.headers["content-type"]).toBe("application/pdf")
    expect(pdf.rawPayload.subarray(0, 4).toString()).toBe("%PDF")

    expect(
      (await owner.patch(`/v1/invoices/${draft.id}`, { title: "x" })).status
    ).toBe(409)
    expect((await owner.post(`/v1/invoices/${draft.id}/send`, {})).status).toBe(
      200
    )

    const voided = await owner.post(`/v1/invoices/${draft.id}/void`, {
      reason: "Issued to wrong entity",
    })
    expect(voided.body).toMatchObject({ status: "void", displayStatus: "void" })
    expect(
      (await owner.get("/v1/invoices?status=void")).body.items
    ).toHaveLength(1)
    expect(
      (await owner.get("/v1/invoices?status=open")).body.items
    ).toHaveLength(0)

    // A second invoice continues the sequence (void numbers are not reused).
    const second = (
      await owner.post("/v1/invoices", {
        clientId: client.id,
        lines: [{ description: "Support", quantity: 1, unitPrice: 1000 }],
      })
    ).body
    expect(
      (await owner.post(`/v1/invoices/${second.id}/issue`)).body.number
    ).toBe("INV-0002")
  })
})

describe("payments & receipts", () => {
  it("prevents overpayment under concurrency, issues receipts, refunds, and blocks void while paid", async () => {
    const owner = new Client(t)
    await owner.signUp("Collector")
    await owner.createWorkspace("Collections")
    const client = (
      await owner.post("/v1/clients", {
        name: "Debtor",
        email: "ap@debtor.test",
      })
    ).body
    const draft = (
      await owner.post("/v1/invoices", {
        clientId: client.id,
        lines: [{ description: "Work", quantity: 1, unitPrice: 10_000 }],
      })
    ).body
    expect(
      (await owner.post(`/v1/invoices/${draft.id}/payments`, { amount: 100 }))
        .status
    ).toBe(409) // draft
    await owner.post(`/v1/invoices/${draft.id}/issue`)

    // Three concurrent 4,000 payments on a 10,000 invoice: only two fit.
    const attempts = await Promise.all(
      [1, 2, 3].map(() =>
        owner.post(`/v1/invoices/${draft.id}/payments`, {
          amount: 4_000,
          method: "card",
        })
      )
    )
    expect(attempts.map((r) => r.status).sort()).toEqual([201, 201, 400])
    expect(attempts.find((r) => r.status === 400)!.body.code).toBe(
      "overpayment"
    )
    const receipts = attempts
      .filter((r) => r.status === 201)
      .map((r) => r.body.receiptNumber)
      .sort()
    expect(receipts).toEqual(["RCT-0001", "RCT-0002"])

    let inv = (await owner.get(`/v1/invoices/${draft.id}`)).body
    expect(inv).toMatchObject({
      amountPaid: 8_000,
      amountDue: 2_000,
      displayStatus: "partially_paid",
    })
    expect(
      (await owner.get("/v1/invoices?status=partially_paid")).body.items
    ).toHaveLength(1)

    const final = await owner.post(`/v1/invoices/${draft.id}/payments`, {
      amount: 2_000,
    })
    expect(final.status).toBe(201)
    expect(final.body.receiptNumber).toBe("RCT-0003")
    inv = (await owner.get(`/v1/invoices/${draft.id}`)).body
    expect(inv).toMatchObject({
      amountDue: 0,
      paymentStatus: "paid",
      displayStatus: "paid",
    })
    expect(
      (await owner.post(`/v1/invoices/${draft.id}/payments`, { amount: 1 }))
        .body.code
    ).toBe("invoice_paid")

    // Can't void a paid invoice.
    expect(
      (
        await owner.post(`/v1/invoices/${draft.id}/void`, {
          reason: "nope nope",
        })
      ).body.code
    ).toBe("invoice_has_payments")

    // Receipt PDF + email.
    const pdf = await t.app.inject({
      method: "GET",
      url: `/v1/payments/${final.body.id}/receipt/pdf`,
      headers: owner.headers(),
    })
    expect(pdf.statusCode).toBe(200)
    expect(pdf.rawPayload.subarray(0, 4).toString()).toBe("%PDF")
    expect(
      (await owner.post(`/v1/payments/${final.body.id}/receipt/send`, {}))
        .status
    ).toBe(200)

    // Refund the final payment: balance reopens, receipt voided, can't refund twice.
    const refunded = await owner.post(`/v1/payments/${final.body.id}/refund`, {
      reason: "Paid twice by mistake",
    })
    expect(refunded.body).toMatchObject({
      status: "refunded",
      refundReason: "Paid twice by mistake",
    })
    expect(
      (
        await owner.post(`/v1/payments/${final.body.id}/refund`, {
          reason: "again!",
        })
      ).status
    ).toBe(409)
    inv = (await owner.get(`/v1/invoices/${draft.id}`)).body
    expect(inv).toMatchObject({
      amountPaid: 8_000,
      displayStatus: "partially_paid",
    })

    const list = (await owner.get(`/v1/payments?invoiceId=${draft.id}`)).body
      .items
    expect(list).toHaveLength(3)
    expect(
      list.filter((p: { status: string }) => p.status === "refunded")
    ).toHaveLength(1)
    expect(
      (await owner.get("/v1/payments?q=RCT-0003")).body.items
    ).toHaveLength(1)
  })
})

describe("dashboard", () => {
  it("aggregates receivables, aging, payments and quotes by currency, filtered by permission", async () => {
    const owner = new Client(t)
    await owner.signUp("Dash")
    const ws = await owner.createWorkspace("Dashboard")
    await owner.patch("/v1/workspace", {
      defaultCurrency: "USD",
      timezone: "UTC",
    })
    const client = (
      await owner.post("/v1/clients", { name: "Big Co", email: "ap@big.test" })
    ).body
    const today = (await owner.get("/v1/dashboard")).body.today as string
    const daysAgo = (n: number) => {
      const d = new Date(`${today}T00:00:00Z`)
      d.setUTCDate(d.getUTCDate() - n)
      return d.toISOString().slice(0, 10)
    }

    const issue = async (amount: number, dueDate: string, currency = "USD") => {
      const inv = (
        await owner.post("/v1/invoices", {
          clientId: client.id,
          currency,
          issueDate: daysAgo(120),
          dueDate,
          lines: [{ description: "Work", quantity: 1, unitPrice: amount }],
        })
      ).body
      await owner.post(`/v1/invoices/${inv.id}/issue`)
      return inv.id as string
    }
    const notDue = await issue(10_000, daysAgo(-10)) // current
    await issue(20_000, daysAgo(15)) // 1–30
    await issue(30_000, daysAgo(100)) // 90+
    await issue(5_000, daysAgo(45), "EUR") // 31–60 in EUR
    await owner.post(`/v1/invoices/${notDue}/payments`, {
      amount: 4_000,
      paidOn: today,
    })
    await owner.post("/v1/invoices", {
      clientId: client.id,
      lines: [{ description: "Draft", quantity: 1, unitPrice: 1 }],
    })

    const quote = (
      await owner.post("/v1/quotes", {
        clientId: client.id,
        lines: [{ description: "Q", quantity: 1, unitPrice: 7_500 }],
      })
    ).body
    await owner.post(`/v1/quotes/${quote.id}/send`)

    const d = (await owner.get("/v1/dashboard")).body
    expect(d.primaryCurrency).toBe("USD")
    expect(
      d.receivables.totals.map((t: { currency: string }) => t.currency)
    ).toEqual(["USD", "EUR"])
    expect(d.receivables.totals[0]).toMatchObject({
      outstanding: 56_000,
      overdue: 50_000,
      openCount: 3,
      overdueCount: 2,
    })
    expect(d.receivables.draftCount).toBe(1)
    const usdAging = Object.fromEntries(
      d.receivables.aging[0].buckets.map(
        (b: { bucket: string; amount: number }) => [b.bucket, b.amount]
      )
    )
    expect(usdAging).toEqual({
      current: 6_000,
      "1_30": 20_000,
      "31_60": 0,
      "61_90": 0,
      "90_plus": 30_000,
    })
    expect(
      d.receivables.aging[1].buckets.find(
        (b: { bucket: string }) => b.bucket === "31_60"
      ).amount
    ).toBe(5_000)
    expect(d.receivables.overdueInvoices[0]).toMatchObject({
      amountDue: 30_000,
      daysOverdue: 100,
    })

    expect(d.received.thisMonth).toEqual([
      { currency: "USD", amount: 4_000, count: 1 },
    ])
    expect(d.received.monthly[0].months).toHaveLength(6)
    expect(d.received.monthly[0].months.at(-1)).toEqual({
      month: today.slice(0, 7),
      amount: 4_000,
    })
    expect(d.received.recent[0]).toMatchObject({
      amount: 4_000,
      receiptNumber: "RCT-0001",
    })

    expect(d.quotes.open).toEqual([
      { currency: "USD", amount: 7_500, count: 1 },
    ])

    // A custom role that can only read quotes sees just the quotes section.
    const viewer = new Client(t)
    const { email } = await viewer.signUp("Viewer")
    await t.db
      .update(workspaceSubscriptions)
      .set({ planKey: "team" })
      .where(eq(workspaceSubscriptions.workspaceId, ws.id))
    const role = (
      await owner.post("/v1/roles", {
        name: "Quote viewer",
        permissions: ["quote.read"],
      })
    ).body
    const inv = (
      await owner.post("/v1/invitations", { email, roleId: role.id })
    ).body
    await viewer.post("/api/auth/organization/accept-invitation", {
      invitationId: inv.id,
    })
    viewer.workspaceId = ws.id
    const vd = (await viewer.get("/v1/dashboard")).body
    expect(vd.received).toBeNull()
    expect(vd.receivables).toBeNull()
    expect(vd.quotes.open).toEqual([
      { currency: "USD", amount: 7_500, count: 1 },
    ])
  })
})
