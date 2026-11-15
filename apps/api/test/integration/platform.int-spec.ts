import zlib from "node:zlib"

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

describe("workspace logo", () => {
  /** A valid 4x4 RGBA PNG built with zlib (a hand-typed one is easy to get wrong). */
  const png = (() => {
    const chunk = (type: string, data: Buffer) => {
      const td = Buffer.concat([Buffer.from(type), data])
      const len = Buffer.alloc(4)
      len.writeUInt32BE(data.length)
      const crc = Buffer.alloc(4)
      crc.writeUInt32BE(zlib.crc32(td) >>> 0)
      return Buffer.concat([len, td, crc])
    }
    const ihdr = Buffer.alloc(13)
    ihdr.writeUInt32BE(4, 0)
    ihdr.writeUInt32BE(4, 4)
    ihdr.set([8, 6, 0, 0, 0], 8)
    const rows = Buffer.concat(
      Array.from({ length: 4 }, () => Buffer.from([0, ...Array(16).fill(0x80)]))
    )
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", ihdr),
      chunk("IDAT", zlib.deflateSync(rows)),
      chunk("IEND", Buffer.alloc(0)),
    ])
  })()
  const multipart = (filename: string, body: Buffer, contentType: string) => {
    const boundary = "----billleaf-test"
    const payload = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`
      ),
      body,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ])
    return { payload, contentType: `multipart/form-data; boundary=${boundary}` }
  }

  it("uploads to object storage, serves a presigned URL, embeds it in PDFs, and validates type", async () => {
    const owner = new Client(t)
    await owner.signUp("Brand")
    await owner.createWorkspace("Branding")
    const upload = async (filename: string, body: Buffer, type: string) => {
      const m = multipart(filename, body, type)
      const res = await t.app.inject({
        method: "PUT",
        url: "/v1/workspace/logo",
        headers: { ...owner.headers(), "content-type": m.contentType },
        payload: m.payload,
      })
      return { status: res.statusCode, body: JSON.parse(res.body) }
    }

    // Content-type is ignored: a "PNG" that isn't one is rejected by magic bytes.
    const fake = await upload(
      "evil.png",
      Buffer.from("<svg onload=alert(1)>"),
      "image/png"
    )
    expect(fake.status).toBe(400)
    expect(fake.body.code).toBe("unsupported_file_type")

    const ok = await upload("logo.png", png, "image/png")
    expect(ok.status).toBe(200)
    expect(ok.body.logoUrl).toMatch(
      /^http.*billleaf-test.*\.png.*X-Amz-Signature=/
    )
    const fetched = await fetch(ok.body.logoUrl)
    expect(fetched.status).toBe(200)
    expect(Buffer.from(await fetched.arrayBuffer()).equals(png)).toBe(true)

    const client = (await owner.post("/v1/clients", { name: "ရွှေ ကုမ္ပဏီ" })).body
    const inv = (
      await owner.post("/v1/invoices", {
        clientId: client.id,
        lines: [{ description: "ออกแบบ", quantity: 1, unitPrice: 100 }],
      })
    ).body
    const pdf = await t.app.inject({
      method: "GET",
      url: `/v1/invoices/${inv.id}/pdf`,
      headers: owner.headers(),
    })
    const text = pdf.rawPayload.toString("latin1")
    expect(text).toContain("/Subtype /Image")
    expect(text).toContain("NotoSansMyanmar")

    const removed = await t.app.inject({
      method: "DELETE",
      url: "/v1/workspace/logo",
      headers: owner.headers(),
    })
    expect(JSON.parse(removed.body).logoUrl).toBeNull()
    expect((await fetch(ok.body.logoUrl)).status).toBe(404)
  })
})

describe("projects & tasks", () => {
  it("creates projects (incl. from an accepted quote) and orders tasks across columns", async () => {
    const owner = new Client(t)
    await owner.signUp("Planner")
    await owner.createWorkspace("Projects")
    const client = (
      await owner.post("/v1/clients", { name: "Acme", currency: "EUR" })
    ).body

    const p = await owner.post("/v1/projects", {
      name: "Retainer",
      clientId: client.id,
      hourlyRate: 9_000,
    })
    expect(p.status).toBe(201)
    expect(p.body).toMatchObject({
      currency: "EUR",
      billing: "hourly",
      hourlyRate: 9_000,
      budgetAmount: null,
      clientName: "Acme",
    })
    const bad = await owner.post("/v1/projects", {
      name: "x",
      startDate: "2026-12-01",
      dueDate: "2026-11-01",
    })
    expect(bad.status).toBe(422)

    const internal = (
      await owner.post("/v1/projects", {
        name: "Internal",
        billing: "non_billable",
      })
    ).body
    expect(internal.clientId).toBeNull()

    // Accepted quote → fixed-price project (once).
    const quote = (
      await owner.post("/v1/quotes", {
        clientId: client.id,
        title: "Website",
        lines: [{ description: "Build", quantity: 1, unitPrice: 500_000 }],
      })
    ).body
    expect(
      (await owner.post(`/v1/projects/from-quote/${quote.id}`)).status
    ).toBe(409)
    await owner.post(`/v1/quotes/${quote.id}/send`)
    await owner.post(`/v1/quotes/${quote.id}/accept`)
    const fromQuote = await owner.post(`/v1/projects/from-quote/${quote.id}`)
    expect(fromQuote.body).toMatchObject({
      name: "Website",
      billing: "fixed",
      budgetAmount: 500_000,
      quoteNumber: "QUO-0001",
    })
    expect(
      (await owner.post(`/v1/projects/from-quote/${quote.id}`)).body.code
    ).toBe("quote_has_project")

    // Tasks: create three, move "c" to the top, then move "a" to done.
    const pid = p.body.id
    const ids: Record<string, string> = {}
    for (const title of ["a", "b", "c"])
      ids[title] = (
        await owner.post(`/v1/projects/${pid}/tasks`, { title })
      ).body.id
    await owner.patch(`/v1/projects/${pid}/tasks/${ids.c}`, {
      afterTaskId: null,
    })
    let tasks = (await owner.get(`/v1/projects/${pid}/tasks`)).body
    expect(
      tasks
        .filter((x: { status: string }) => x.status === "todo")
        .map((x: { title: string }) => x.title)
    ).toEqual(["c", "a", "b"])

    const done = await owner.patch(`/v1/projects/${pid}/tasks/${ids.a}`, {
      status: "done",
    })
    expect(done.body.completedAt).not.toBeNull()
    tasks = (await owner.get(`/v1/projects/${pid}/tasks`)).body
    expect(
      tasks
        .filter((x: { status: string }) => x.status === "todo")
        .map((x: { title: string }) => x.title)
    ).toEqual(["c", "b"])

    const me = (await owner.get("/v1/members")).body[0]
    expect(
      (
        await owner.patch(`/v1/projects/${pid}/tasks/${ids.b}`, {
          assigneeMemberId: me.id,
        })
      ).body.assigneeName
    ).toBe(me.name)
    expect(
      (
        await owner.patch(`/v1/projects/${pid}/tasks/${ids.b}`, {
          assigneeMemberId: "00000000-0000-4000-8000-000000000000",
        })
      ).status
    ).toBe(400)

    expect((await owner.get(`/v1/projects/${pid}`)).body.taskCounts).toEqual({
      todo: 2,
      in_progress: 0,
      done: 1,
    })
    // Clients with projects can't be deleted.
    expect((await owner.del(`/v1/clients/${client.id}`)).body.code).toBe(
      "client_has_documents"
    )
  })
})

describe("time tracking", () => {
  it("runs one timer per member, enforces own-vs-all permissions, invoices unbilled time once", async () => {
    const owner = new Client(t)
    await owner.signUp("Tracker")
    const ws = await owner.createWorkspace("Timekeeping")
    await owner.patch("/v1/workspace", {
      timezone: "UTC",
      defaultTaxRateBps: 0,
    })
    const client = (await owner.post("/v1/clients", { name: "Billable Co" }))
      .body
    const project = (
      await owner.post("/v1/projects", {
        name: "Retainer",
        clientId: client.id,
        hourlyRate: 10_000,
      })
    ).body
    const other = (
      await owner.post("/v1/projects", {
        name: "Side",
        clientId: client.id,
        hourlyRate: 10_000,
      })
    ).body
    const task = (
      await owner.post(`/v1/projects/${project.id}/tasks`, { title: "Design" })
    ).body

    // Timer: starting a second one stops the first.
    const first = await owner.post("/v1/time-entries/start", {
      projectId: project.id,
      taskId: task.id,
    })
    expect(first.status).toBe(201)
    expect(first.body.isRunning).toBe(true)
    const second = await owner.post("/v1/time-entries/start", {
      projectId: other.id,
    })
    expect(second.body.projectName).toBe("Side")
    expect((await owner.get("/v1/time-entries/running")).body.entry.id).toBe(
      second.body.id
    )
    const stopped = await owner.post("/v1/time-entries/stop")
    expect(stopped.body).toMatchObject({
      isRunning: false,
      durationSeconds: expect.any(Number),
    })
    expect((await owner.post("/v1/time-entries/stop")).body.code).toBe(
      "no_timer"
    )
    expect(
      (
        await owner.post("/v1/time-entries/start", {
          projectId: project.id,
          taskId: other.id,
        })
      ).status
    ).toBe(400) // task not in project

    // Manual entries: 1.5 h on Design, 30 min general.
    const today = new Date().toISOString().slice(0, 10)
    const design = await owner.post("/v1/time-entries", {
      projectId: project.id,
      taskId: task.id,
      entryDate: today,
      durationMinutes: 90,
    })
    expect(design.body.durationSeconds).toBe(5_400)
    await owner.post("/v1/time-entries", {
      projectId: project.id,
      startedAt: `${today}T08:00:00.000Z`,
      endedAt: `${today}T08:30:00.000Z`,
    })
    expect(
      (
        await owner.post("/v1/time-entries", {
          projectId: project.id,
          startedAt: `${today}T09:00:00.000Z`,
          endedAt: `${today}T08:00:00.000Z`,
        })
      ).status
    ).toBe(422)

    // A Member (time.track, no time.manage) sees and edits only their own time.
    const member = new Client(t)
    const { email } = await member.signUp("Contractor")
    await t.db
      .update(workspaceSubscriptions)
      .set({ planKey: "team" })
      .where(eq(workspaceSubscriptions.workspaceId, ws.id))
    const role = (
      await owner.post("/v1/roles", {
        name: "Tracker only",
        permissions: ["project.read", "time.track"],
      })
    ).body
    const inv = (
      await owner.post("/v1/invitations", { email, roleId: role.id })
    ).body
    await member.post("/api/auth/organization/accept-invitation", {
      invitationId: inv.id,
    })
    member.workspaceId = ws.id
    const mine = await member.post("/v1/time-entries", {
      projectId: project.id,
      entryDate: today,
      durationMinutes: 60,
    })
    expect(mine.status).toBe(201)
    const memberList = (
      await member.get(`/v1/time-entries?from=${today}&to=${today}`)
    ).body
    expect(memberList.items.every((e: { isMine: boolean }) => e.isMine)).toBe(
      true
    )
    expect(
      (
        await member.patch(`/v1/time-entries/${design.body.id}`, {
          description: "hijack",
        })
      ).status
    ).toBe(404)
    const ownerList = (
      await owner.get(
        `/v1/time-entries?from=${today}&to=${today}&projectId=${project.id}`
      )
    ).body
    expect(ownerList.items).toHaveLength(4) // first timer + 2 manual + the member's

    // Summary + invoice from time: one line per task, priced at the hourly rate.
    const summary = (await owner.get(`/v1/projects/${project.id}/time-summary`))
      .body
    // 1.5 h + 0.5 h + member's 1 h + the (seconds-long) first timer
    expect(summary.unbilledSeconds).toBeGreaterThan(10_800)
    expect(summary.unbilledAmount).toBe(
      Math.round((Math.round(summary.unbilledSeconds / 36) / 100) * 10_000)
    )
    const invoice = await owner.post("/v1/invoices/from-time", {
      projectId: project.id,
    })
    expect(invoice.status).toBe(201)
    expect(invoice.body.status).toBe("draft")
    const designLine = invoice.body.lines.find((l: { description: string }) =>
      l.description.startsWith("Design")
    )
    expect(designLine).toMatchObject({ unitPrice: 10_000 })
    expect(
      (await owner.post("/v1/invoices/from-time", { projectId: project.id }))
        .body.code
    ).toBe("no_unbilled_time")

    // Invoiced entries are locked; deleting the draft releases them; voiding releases too.
    expect(
      (
        await owner.patch(`/v1/time-entries/${design.body.id}`, {
          description: "x",
        })
      ).body.code
    ).toBe("time_entry_invoiced")
    await owner.del(`/v1/invoices/${invoice.body.id}`)
    expect(
      (await owner.get(`/v1/projects/${project.id}/time-summary`)).body
        .unbilledSeconds
    ).toBe(summary.unbilledSeconds)
    const again = (
      await owner.post("/v1/invoices/from-time", { projectId: project.id })
    ).body
    await owner.post(`/v1/invoices/${again.id}/issue`)
    expect(
      (await owner.get(`/v1/projects/${project.id}/time-summary`)).body
        .unbilledSeconds
    ).toBe(0)
    await owner.post(`/v1/invoices/${again.id}/void`, {
      reason: "Wrong rate used",
    })
    expect(
      (await owner.get(`/v1/projects/${project.id}/time-summary`)).body
        .unbilledSeconds
    ).toBe(summary.unbilledSeconds)

    // Projects with time can't be deleted.
    expect((await owner.del(`/v1/projects/${project.id}`)).body.code).toBe(
      "project_has_time"
    )
  })
})

describe("time after a member leaves", () => {
  it("keeps their entries (incl. invoiced ones) with their name, and stops their running timer", async () => {
    const owner = new Client(t)
    await owner.signUp("Lead")
    const ws = await owner.createWorkspace("Agency")
    await t.db
      .update(workspaceSubscriptions)
      .set({ planKey: "team" })
      .where(eq(workspaceSubscriptions.workspaceId, ws.id))
    const client = (await owner.post("/v1/clients", { name: "Retainer Co" }))
      .body
    const project = (
      await owner.post("/v1/projects", {
        name: "Ongoing",
        clientId: client.id,
        hourlyRate: 5_000,
      })
    ).body

    const contractor = new Client(t)
    const { email } = await contractor.signUp("Casey Contractor")
    const role = (
      await owner.post("/v1/roles", {
        name: "Contractor",
        permissions: ["project.read", "time.track"],
      })
    ).body
    const inv = (
      await owner.post("/v1/invitations", { email, roleId: role.id })
    ).body
    await contractor.post("/api/auth/organization/accept-invitation", {
      invitationId: inv.id,
    })
    contractor.workspaceId = ws.id

    const today = new Date().toISOString().slice(0, 10)
    const logged = (
      await contractor.post("/v1/time-entries", {
        projectId: project.id,
        entryDate: today,
        durationMinutes: 120,
      })
    ).body
    expect(logged.memberName).toBe("Casey Contractor")
    const invoice = (
      await owner.post("/v1/invoices/from-time", { projectId: project.id })
    ).body
    await contractor.post("/v1/time-entries/start", { projectId: project.id })

    const members = (await owner.get("/v1/members")).body
    const casey = members.find((m: { email: string }) => m.email === email)
    expect((await owner.del(`/v1/members/${casey.id}`)).status).toBe(204)

    const entries = (
      await owner.get(
        `/v1/time-entries?from=${today}&to=${today}&projectId=${project.id}`
      )
    ).body.items
    expect(entries).toHaveLength(2)
    for (const e of entries) {
      expect(e).toMatchObject({
        memberId: null,
        memberName: "Casey Contractor",
        isRunning: false,
      })
    }
    expect(
      entries.find((e: { id: string }) => e.id === logged.id).invoiceId
    ).toBe(invoice.id)
    // Former members' entries can still be managed by someone with time.manage.
    const timer = entries.find((e: { id: string }) => e.id !== logged.id)
    expect(
      (
        await owner.patch(`/v1/time-entries/${timer.id}`, {
          description: "Wrap-up",
        })
      ).status
    ).toBe(200)
  })
})
