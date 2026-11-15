import { readFileSync } from "node:fs"
import zlib from "node:zlib"

import { createHash } from "node:crypto"

import {
  auditLogs,
  user as userTable,
  billingEvents,
  portalResponses,
  rolePermissions,
  roles,
  syncPermissions,
  timeEntries,
  workspaceSubscriptions,
} from "@workspace/db"
import { and, eq } from "drizzle-orm"
import { ClsService } from "nestjs-cls"
import { strFromU8, unzipSync } from "fflate"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import { BILLING_PROVIDER } from "../../src/billing/providers/billing-provider.js"
import { REDIS } from "../../src/core/cache/redis.module.js"
import { WORKER_HEARTBEAT_KEY } from "../../src/jobs/worker-heartbeat.js"
import { addInterval } from "../../src/billing/period.js"
import { DataExportService } from "../../src/modules/data-export/data-export.service.js"
import { InvoiceRemindersService } from "../../src/modules/invoices/invoice-reminders.service.js"
import { SubscriptionRemindersService } from "../../src/billing/manual/subscription-reminders.service.js"
import { MailService } from "../../src/mail/mail.service.js"
import type { TestBillingProvider } from "../../src/billing/providers/test-billing.provider.js"
import { RecurringService } from "../../src/modules/recurring/recurring.service.js"
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
    const brandingWs = await owner.createWorkspace("Branding")
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
    const pdfText = async () =>
      (
        await t.app.inject({
          method: "GET",
          url: `/v1/invoices/${inv.id}/pdf`,
          headers: owner.headers(),
        })
      ).rawPayload.toString("latin1")
    // Free plan: default look, no logo (custom branding is a paid feature).
    expect(await pdfText()).not.toContain("/Subtype /Image")
    await t.db
      .update(workspaceSubscriptions)
      .set({ planKey: "pro" })
      .where(eq(workspaceSubscriptions.workspaceId, brandingWs.id))
    const text = await pdfText()
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

describe("recurring invoices", () => {
  it("is plan-gated, generates one invoice per period (month-end safe), catches up, sends, and ends", async () => {
    const owner = new Client(t)
    await owner.signUp("Retainer")
    const ws = await owner.createWorkspace("Retainers")
    const client = (
      await owner.post("/v1/clients", {
        name: "Monthly Co",
        email: "ap@monthly.test",
      })
    ).body
    const body = {
      clientId: client.id,
      title: "Retainer",
      startDate: "2026-01-31",
      dueDays: 10,
      maxOccurrences: 4,
      lines: [{ description: "Retainer", quantity: 1, unitPrice: 100_000 }],
    }
    const gated = await owner.post("/v1/recurring-invoices", body)
    expect(gated.status).toBe(403)
    expect(gated.body.code).toBe("feature_not_in_plan")

    await t.db
      .update(workspaceSubscriptions)
      .set({ planKey: "pro" })
      .where(eq(workspaceSubscriptions.workspaceId, ws.id))
    const schedule = (await owner.post("/v1/recurring-invoices", body)).body
    expect(schedule).toMatchObject({
      nextRunDate: "2026-01-31",
      total: 100_000,
    })

    const first = await owner.post(`/v1/recurring-invoices/${schedule.id}/run`)
    expect(first.status).toBe(200)
    expect(first.body.schedule.nextRunDate).toBe("2026-02-28")
    const inv = (await owner.get(`/v1/invoices/${first.body.invoiceId}`)).body
    expect(inv).toMatchObject({
      status: "draft",
      issueDate: "2026-01-31",
      dueDate: "2026-02-10",
      recurringId: schedule.id,
    })

    // Worker path: catches up the missed periods; re-running is a no-op.
    const cls = t.app.get(ClsService)
    const svc = t.app.get(RecurringService)
    const sweep = () =>
      cls.run(async () => {
        cls.set("workspaceId", ws.id)
        return svc.generateDue(schedule.id)
      })
    // Switch to send mode before the catch-up so the last period is emailed.
    await owner.patch(`/v1/recurring-invoices/${schedule.id}`, { mode: "send" })
    expect(await sweep()).toBe(3)
    expect(await sweep()).toBe(0)

    const history = (
      await owner.get(`/v1/recurring-invoices/${schedule.id}/invoices`)
    ).body
    expect(history.map((h: { period: string }) => h.period)).toEqual([
      "2026-04-30",
      "2026-03-31",
      "2026-02-28",
      "2026-01-31",
    ])
    expect(history[0].status).toBe("issued")
    expect(history[0].number).toMatch(/^INV-/)
    const ended = (await owner.get(`/v1/recurring-invoices/${schedule.id}`))
      .body
    expect(ended).toMatchObject({
      status: "ended",
      nextRunDate: null,
      generatedCount: 4,
    })
    expect(
      (await owner.post(`/v1/recurring-invoices/${schedule.id}/run`)).status
    ).toBe(409)

    // Deleting a schedule keeps its invoices.
    expect(
      (await owner.del(`/v1/recurring-invoices/${schedule.id}`)).status
    ).toBe(204)
    expect((await owner.get(`/v1/invoices/${inv.id}`)).body.recurringId).toBe(
      null
    )
  })

  it("pauses schedules whose workspace lost the feature", async () => {
    const owner = new Client(t)
    await owner.signUp("Downgrade")
    const ws = await owner.createWorkspace("Downgraded")
    const setPlan = (planKey: string) =>
      t.db
        .update(workspaceSubscriptions)
        .set({ planKey })
        .where(eq(workspaceSubscriptions.workspaceId, ws.id))
    await setPlan("pro")
    const client = (await owner.post("/v1/clients", { name: "Weekly Co" })).body
    const schedule = (
      await owner.post("/v1/recurring-invoices", {
        clientId: client.id,
        unit: "week",
        startDate: "2026-11-01",
        lines: [{ description: "Support", quantity: 1, unitPrice: 5_000 }],
      })
    ).body
    await setPlan("free")
    const cls = t.app.get(ClsService)
    const generated = await cls.run(async () => {
      cls.set("workspaceId", ws.id)
      return t.app.get(RecurringService).generateDue(schedule.id)
    })
    expect(generated).toBe(0)
    const paused = (await owner.get(`/v1/recurring-invoices/${schedule.id}`))
      .body
    expect(paused.status).toBe("paused")
    expect(paused.lastError).toMatch(/plan/)
    expect(
      (
        await owner.patch(`/v1/recurring-invoices/${schedule.id}`, {
          status: "active",
        })
      ).status
    ).toBe(403)
  })
})

describe("contracts", () => {
  it("drafts from a quote + template, blocks unresolved fields, sends, signs, voids, and renders a PDF", async () => {
    const owner = new Client(t)
    await owner.signUp("Counsel")
    const ws = await owner.createWorkspace("Agreements")
    await owner.patch("/v1/workspace", { legalName: "Agreements LLC" })
    const client = (
      await owner.post("/v1/clients", {
        name: "Signer Co",
        email: "legal@signer.test",
      })
    ).body
    const quote = (
      await owner.post("/v1/quotes", {
        clientId: client.id,
        title: "Brand refresh",
        lines: [{ description: "Design", quantity: 1, unitPrice: 250_000 }],
      })
    ).body
    await owner.post(`/v1/quotes/${quote.id}/send`)

    const template = (
      await owner.post("/v1/contract-templates", {
        name: "Standard",
        body: "Between {{business.legal_name}} and {{client.legal_name}}.\n\n## Fees\n- {{quote.total}} per {{quote.number}}\n- Starts {{contract.effective_date}}",
      })
    ).body
    expect(template.id).toBeTruthy()

    const draft = (
      await owner.post("/v1/contracts", {
        quoteId: quote.id,
        templateId: template.id,
      })
    ).body
    expect(draft).toMatchObject({
      status: "draft",
      number: null,
      clientId: client.id,
      title: "Brand refresh",
      quoteId: quote.id,
      unresolvedFields: ["contract.effective_date"],
    })
    expect(draft.renderedBody).toContain(
      "Between Agreements LLC and Signer Co."
    )
    expect(draft.renderedBody).toContain("$2,500.00 per QUO-0001")

    const blocked = await owner.post(`/v1/contracts/${draft.id}/send`)
    expect(blocked.status).toBe(400)
    expect(blocked.body.code).toBe("unresolved_fields")

    // Editing the template later never changes existing contracts.
    await owner.patch(`/v1/contract-templates/${template.id}`, {
      body: "Changed",
    })
    await owner.patch(`/v1/contracts/${draft.id}`, {
      effectiveDate: "2026-12-01",
    })
    const sent = (await owner.post(`/v1/contracts/${draft.id}/send`)).body
    expect(sent).toMatchObject({
      status: "sent",
      number: "CON-0001", // the blocked attempt did not burn a number
      unresolvedFields: [],
    })
    expect(sent.renderedBody).toContain("- Starts Dec 1, 2026")
    expect(sent.clientSnapshot.name).toBe("Signer Co")

    // Frozen: edits are rejected, and later client changes don't leak in.
    expect(
      (await owner.patch(`/v1/contracts/${draft.id}`, { title: "x" })).status
    ).toBe(409)
    await owner.patch(`/v1/clients/${client.id}`, { name: "Renamed Co" })
    expect(
      (await owner.get(`/v1/contracts/${draft.id}`)).body.renderedBody
    ).toContain("and Signer Co.")

    const future = await owner.post(`/v1/contracts/${draft.id}/sign`, {
      signedByName: "Sam Signer",
      signedAt: "2999-01-01",
    })
    expect(future.status).toBe(400)
    const signed = (
      await owner.post(`/v1/contracts/${draft.id}/sign`, {
        signedByName: "Sam Signer",
        signedAt: "2026-11-02",
      })
    ).body
    expect(signed).toMatchObject({
      status: "signed",
      signedAt: "2026-11-02",
      signedByName: "Sam Signer",
    })
    expect((await owner.post(`/v1/contracts/${draft.id}/decline`)).status).toBe(
      409
    )
    expect((await owner.del(`/v1/contracts/${draft.id}`)).status).toBe(409)

    const pdf = await t.app.inject({
      method: "GET",
      url: `/v1/contracts/${draft.id}/pdf`,
      headers: owner.headers(),
    })
    expect(pdf.statusCode).toBe(200)
    expect(pdf.rawPayload.subarray(0, 4).toString()).toBe("%PDF")
    expect(
      (await owner.post(`/v1/contracts/${draft.id}/email`, {})).status
    ).toBe(200)

    const voided = (
      await owner.post(`/v1/contracts/${draft.id}/void`, {
        reason: "Superseded",
      })
    ).body
    expect(voided).toMatchObject({ status: "void", voidReason: "Superseded" })
    expect(
      (await owner.post(`/v1/contracts/${draft.id}/email`, {})).status
    ).toBe(409)

    // Drafts without a template need a body; drafts can be deleted.
    expect(
      (await owner.post("/v1/contracts", { clientId: client.id })).status
    ).toBe(400)
    const scratch = (
      await owner.post("/v1/contracts", {
        clientId: client.id,
        title: "NDA",
        body: "Keep it secret.",
      })
    ).body
    expect((await owner.del(`/v1/contracts/${scratch.id}`)).status).toBe(204)

    const list = (await owner.get("/v1/contracts?status=void")).body
    expect(list.items.map((c: { id: string }) => c.id)).toEqual([draft.id])

    // Another workspace can't link this workspace's quote.
    const other = new Client(t)
    await other.signUp("Outsider")
    await other.createWorkspace("Elsewhere")
    const theirs = (await other.post("/v1/clients", { name: "Theirs" })).body
    expect(
      (
        await other.post("/v1/contracts", {
          clientId: theirs.id,
          quoteId: quote.id,
          body: "x",
        })
      ).status
    ).toBe(400)
    expect((await other.get(`/v1/contracts/${draft.id}`)).status).toBe(404)
    void ws
  })

  it("lets members draft contracts but not send them", async () => {
    const owner = new Client(t)
    await owner.signUp("Principal")
    const ws = await owner.createWorkspace("Studio Two")
    await t.db
      .update(workspaceSubscriptions)
      .set({ planKey: "team" })
      .where(eq(workspaceSubscriptions.workspaceId, ws.id))
    const roles = (await owner.get("/v1/roles")).body
    const memberRole = roles.find((r: { slug: string }) => r.slug === "member")
    expect(memberRole.permissions).toContain("contract.create")
    expect(memberRole.permissions).not.toContain("contract.send")
    expect(
      roles.find((r: { slug: string }) => r.slug === "owner").permissions
    ).toContain("contract.send")

    const member = new Client(t)
    const { email } = await member.signUp("Junior")
    const inv = (
      await owner.post("/v1/invitations", { email, roleId: memberRole.id })
    ).body
    await member.post("/api/auth/organization/accept-invitation", {
      invitationId: inv.id,
    })
    member.workspaceId = ws.id

    const client = (await owner.post("/v1/clients", { name: "Client" })).body
    const draft = await member.post("/v1/contracts", {
      clientId: client.id,
      title: "Retainer",
      body: "Work for {{client.name}}.",
    })
    expect(draft.status).toBe(201)
    expect(draft.body.renderedBody).toBe("Work for Client.")
    expect(
      (await member.post(`/v1/contracts/${draft.body.id}/send`)).status
    ).toBe(403)
    expect(
      (await owner.post(`/v1/contracts/${draft.body.id}/send`)).status
    ).toBe(200)
  })
})

describe("permission catalog sync", () => {
  it("grants keys added later to existing Owner roles, and only to them", async () => {
    const owner = new Client(t)
    await owner.signUp("Founder")
    const ws = await owner.createWorkspace("Older")
    const wsRoles = await t.db
      .select()
      .from(roles)
      .where(eq(roles.workspaceId, ws.id))
    const ownerRole = wsRoles.find((r) => r.slug === "owner")!
    const memberRole = wsRoles.find((r) => r.slug === "member")!
    // Simulate a workspace created before `contract.send` existed.
    await t.db
      .delete(rolePermissions)
      .where(
        and(
          eq(rolePermissions.roleId, ownerRole.id),
          eq(rolePermissions.permissionKey, "contract.send")
        )
      )
    await syncPermissions(t.db)
    const granted = await t.db
      .select({ roleId: rolePermissions.roleId })
      .from(rolePermissions)
      .where(eq(rolePermissions.permissionKey, "contract.send"))
    const ids = granted.map((g) => g.roleId)
    expect(ids).toContain(ownerRole.id)
    expect(ids).not.toContain(memberRole.id)
  })
})

describe("SaaS billing", () => {
  it("enforces Free limits, upgrades through the test checkout, switches plans and follows the subscription lifecycle", async () => {
    const owner = new Client(t)
    await owner.signUp("Subscriber")
    const ws = await owner.createWorkspace("Paying")
    const start = (await owner.get("/v1/billing")).body
    expect(start).toMatchObject({
      planKey: "free",
      effectivePlanKey: "free",
      provider: "test",
      checkoutAvailable: true,
      canManage: false,
      usage: { members: 1, clients: 0, invoicesPerMonth: 0 },
    })

    // Free: custom roles are a Team feature; 10 issued invoices per month.
    const role = await owner.post("/v1/roles", {
      name: "Bookkeeper",
      permissions: ["invoice.read"],
    })
    expect(role.status).toBe(403)
    expect(role.body.code).toBe("feature_not_in_plan")
    const client = (await owner.post("/v1/clients", { name: "Busy Co" })).body
    const draft = () =>
      owner.post("/v1/invoices", {
        clientId: client.id,
        lines: [{ description: "Work", quantity: 1, unitPrice: 1_000 }],
      })
    for (let i = 0; i < 10; i++) {
      const inv = (await draft()).body
      expect((await owner.post(`/v1/invoices/${inv.id}/issue`)).status).toBe(
        200
      )
    }
    const eleventh = (await draft()).body // drafts are never limited
    const blocked = await owner.post(`/v1/invoices/${eleventh.id}/issue`)
    expect(blocked.status).toBe(403)
    expect(blocked.body.code).toBe("plan_limit_reached")
    expect(blocked.body.detail).toMatch(/Free plan includes up to 10/)

    // Upgrade via the test provider's hosted checkout.
    const checkout = (
      await owner.post("/v1/billing/checkout", {
        planKey: "pro",
        interval: "month",
      })
    ).body
    expect(checkout.url).toMatch(/\/settings\/billing\/test\?session=/)
    const session = new URL(checkout.url).searchParams.get("session")!
    expect(
      (await owner.get(`/v1/billing/test/session?session=${session}`)).body
    ).toMatchObject({ kind: "checkout", planKey: "pro", interval: "month" })

    // A session can't be used from another workspace.
    const outsider = new Client(t)
    await outsider.signUp("Outsider")
    await outsider.createWorkspace("Not mine")
    expect(
      (await outsider.post("/v1/billing/test/checkout", { session })).status
    ).toBe(403)

    const pro = (await owner.post("/v1/billing/test/checkout", { session }))
      .body
    expect(pro).toMatchObject({
      planKey: "pro",
      effectivePlanKey: "pro",
      status: "active",
      interval: "month",
      canManage: true,
    })
    expect((await owner.post(`/v1/invoices/${eleventh.id}/issue`)).status).toBe(
      200
    )
    expect(
      (
        await owner.post("/v1/billing/checkout", {
          planKey: "team",
          interval: "year",
        })
      ).body.code
    ).toBe("already_subscribed")

    // Switch to Team (yearly): custom roles unlock.
    const team = (
      await owner.post("/v1/billing/change-plan", {
        planKey: "team",
        interval: "year",
      })
    ).body
    expect(team).toMatchObject({ effectivePlanKey: "team", interval: "year" })
    expect(
      (
        await owner.post("/v1/roles", {
          name: "Bookkeeper",
          permissions: ["invoice.read"],
        })
      ).status
    ).toBe(201)

    // Portal lifecycle.
    const portal = (await owner.post("/v1/billing/portal")).body
    const portalSession = new URL(portal.url).searchParams.get("session")!
    const act = async (action: string) =>
      (
        await owner.post("/v1/billing/test/portal", {
          session: portalSession,
          action,
        })
      ).body
    expect(await act("cancel")).toMatchObject({
      cancelAtPeriodEnd: true,
      effectivePlanKey: "team",
    })
    expect(await act("resume")).toMatchObject({ cancelAtPeriodEnd: false })
    expect(await act("payment_failed")).toMatchObject({
      status: "past_due",
      effectivePlanKey: "team", // grace period
    })
    expect(await act("payment_recovered")).toMatchObject({ status: "active" })
    const ended = await act("end_now")
    expect(ended).toMatchObject({
      status: "canceled",
      effectivePlanKey: "free",
      planKey: "team",
    })
    // Data is kept; creating more is limited again.
    expect(
      (await owner.post("/v1/roles", { name: "Another", permissions: [] }))
        .status
    ).toBe(403)

    // Webhooks: idempotent, ordered, signed, and failures are stored.
    const provider = t.app.get<TestBillingProvider>(BILLING_PROVIDER)
    const deliver = (d: { rawBody: Buffer; headers: Record<string, string> }) =>
      t.app.inject({
        method: "POST",
        url: "/v1/billing/webhooks/test",
        headers: { "content-type": "application/json", ...d.headers },
        payload: d.rawBody,
      })
    const data = {
      workspace_id: ws.id,
      customer_id: "cus_x",
      subscription_id: "sub_x",
      plan: "pro" as const,
      interval: "month" as const,
      status: "active" as const,
      current_period_end: new Date(Date.now() + 86_400_000).toISOString(),
      cancel_at_period_end: false,
    }
    const reactivate = provider.delivery({
      type: "subscription.activated",
      data,
    })
    const first = await deliver(reactivate)
    expect(JSON.parse(first.body)).toMatchObject({ duplicate: false })
    const again = await deliver(reactivate)
    expect(JSON.parse(again.body)).toMatchObject({ duplicate: true })
    expect((await owner.get("/v1/billing")).body.effectivePlanKey).toBe("pro")

    // An older event delivered late is stored but doesn't override newer state.
    const stale = provider.delivery(
      { type: "subscription.canceled", data },
      new Date("2000-01-01T00:00:00Z")
    )
    expect((await deliver(stale)).statusCode).toBe(200)
    expect((await owner.get("/v1/billing")).body.effectivePlanKey).toBe("pro")
    // Tampering with a signed body is rejected.
    const tampered = Buffer.from(
      reactivate.rawBody.toString().replace('"pro"', '"team"')
    )
    expect(
      (await deliver({ rawBody: tampered, headers: reactivate.headers }))
        .statusCode
    ).toBe(401)
    const forged = await deliver({
      rawBody: reactivate.rawBody,
      headers: { "x-billleaf-signature": "forged" },
    })
    expect(forged.statusCode).toBe(401)

    const orphan = provider.delivery({
      type: "subscription.activated",
      data: { ...data, workspace_id: "00000000-0000-4000-8000-000000000000" },
    })
    expect((await deliver(orphan)).statusCode).toBe(200)
    const orphanId = JSON.parse(orphan.rawBody.toString()).id
    const [row] = await t.db
      .select()
      .from(billingEvents)
      .where(eq(billingEvents.eventId, orphanId))
    expect(row!.processedAt).toBeNull()
    expect(row!.error).toMatch(/Unknown workspace/)
  })
})

describe("list pagination and sorting", () => {
  it("pages with totals, sorts by allowed fields only, and keeps filters", async () => {
    const owner = new Client(t)
    await owner.signUp("Pager")
    const ws = await owner.createWorkspace("Paging")
    await t.db
      .update(workspaceSubscriptions)
      .set({ planKey: "pro" })
      .where(eq(workspaceSubscriptions.workspaceId, ws.id))
    for (const name of ["Charlie Co", "alpha Co", "Bravo Co"]) {
      await owner.post("/v1/clients", { name })
    }
    const names = (r: { body: { items: { name: string }[] } }) =>
      r.body.items.map((c) => c.name)

    // Default client order is name A→Z, case-insensitive.
    const first = await owner.get("/v1/clients?pageSize=2")
    expect(first.body).toMatchObject({ total: 3, page: 1, pageSize: 2 })
    expect(names(first)).toEqual(["alpha Co", "Bravo Co"])
    const second = await owner.get("/v1/clients?pageSize=2&page=2")
    expect(names(second)).toEqual(["Charlie Co"])
    expect(
      names(await owner.get("/v1/clients?sort=name:desc&pageSize=10"))
    ).toEqual(["Charlie Co", "Bravo Co", "alpha Co"])
    // Past the end: empty page, total still known.
    expect((await owner.get("/v1/clients?page=9")).body).toMatchObject({
      items: [],
      total: 3,
    })
    // Search narrows the total.
    expect((await owner.get("/v1/clients?q=bra")).body.total).toBe(1)

    // Only whitelisted fields; malformed or unknown → 422.
    expect((await owner.get("/v1/clients?sort=archivedAt:asc")).status).toBe(
      422
    )
    expect((await owner.get("/v1/clients?sort=name")).status).toBe(422)
    expect((await owner.get("/v1/clients?pageSize=500")).status).toBe(422)

    // Invoices sort by a computed column (amount due) and by client name.
    const clients = (await owner.get("/v1/clients?pageSize=10")).body.items
    for (const [i, c] of clients.entries()) {
      await owner.post("/v1/invoices", {
        clientId: c.id,
        lines: [
          { description: "Work", quantity: 1, unitPrice: (i + 1) * 10_000 },
        ],
      })
    }
    const byTotal = (
      await owner.get("/v1/invoices?sort=amountDue:desc")
    ).body.items.map((i: { total: number }) => i.total)
    expect(byTotal).toEqual([30_000, 20_000, 10_000])
    const byClient = (
      await owner.get("/v1/invoices?sort=clientName:asc&pageSize=2")
    ).body
    expect(byClient.total).toBe(3)
    expect(
      byClient.items.map((i: { clientName: string }) => i.clientName)
    ).toEqual(["alpha Co", "Bravo Co"])
  })
})

describe("Clockify-style tracker", () => {
  it("tracks without a project, tags entries, edits the running timer, continues, duplicates and bulk-edits", async () => {
    const owner = new Client(t)
    await owner.signUp("Tagger")
    const ws = await owner.createWorkspace("Tag Studio")
    await t.db
      .update(workspaceSubscriptions)
      .set({ planKey: "team" })
      .where(eq(workspaceSubscriptions.workspaceId, ws.id))
    await owner.patch("/v1/workspace", { timezone: "UTC" })
    const client = (await owner.post("/v1/clients", { name: "Tag Co" })).body
    const project = (
      await owner.post("/v1/projects", {
        name: "Website",
        clientId: client.id,
        hourlyRate: 8_000,
      })
    ).body

    // Tags: unique per workspace (case-insensitive).
    const deep = await owner.post("/v1/tags", {
      name: "Deep work",
      color: "green",
    })
    expect(deep.status).toBe(201)
    expect(
      (await owner.post("/v1/tags", { name: "deep WORK" })).body.code
    ).toBe("tag_exists")
    const call = (await owner.post("/v1/tags", { name: "Call" })).body
    expect(
      (await owner.get("/v1/tags")).body.items.map((x: any) => x.name)
    ).toEqual(["Call", "Deep work"])

    // A timer with no project, with tags; a task without a project is rejected.
    const started = await owner.post("/v1/time-entries/start", {
      description: "Inbox zero",
      tagIds: [call.id],
    })
    expect(started.status).toBe(201)
    expect(started.body).toMatchObject({
      projectId: null,
      projectName: null,
      billable: true,
      tags: [{ name: "Call" }],
    })
    const task = (
      await owner.post(`/v1/projects/${project.id}/tasks`, { title: "Build" })
    ).body
    expect(
      (await owner.patch("/v1/time-entries/running", { taskId: task.id }))
        .status
    ).toBe(400)
    expect(
      (await owner.post("/v1/time-entries/start", { tagIds: [ws.id] })).status
    ).toBe(400) // unknown tag

    // Edit the running timer: project, tags, billable, an earlier start.
    const tenMinAgo = new Date(Date.now() - 10 * 60_000).toISOString()
    const edited = await owner.patch("/v1/time-entries/running", {
      projectId: project.id,
      taskId: task.id,
      tagIds: [deep.body.id, call.id],
      billable: false,
      startedAt: tenMinAgo,
    })
    expect(edited.status).toBe(200)
    expect(edited.body).toMatchObject({
      projectName: "Website",
      taskTitle: "Build",
      billable: false,
      isRunning: true,
    })
    expect(edited.body.tags.map((x: any) => x.name)).toEqual([
      "Call",
      "Deep work",
    ])
    expect(
      (
        await owner.patch("/v1/time-entries/running", {
          startedAt: new Date(Date.now() + 60_000).toISOString(),
        })
      ).status
    ).toBe(400)
    const stopped = (await owner.post("/v1/time-entries/stop")).body
    expect(stopped.durationSeconds).toBeGreaterThanOrEqual(600)

    // Continue starts a new timer with the same fields; duplicate copies.
    const cont = await owner.post(`/v1/time-entries/${stopped.id}/continue`)
    expect(cont.status).toBe(201)
    expect(cont.body).toMatchObject({
      isRunning: true,
      description: "Inbox zero",
      projectId: project.id,
      taskId: task.id,
      billable: false,
    })
    expect(cont.body.tags).toHaveLength(2)
    expect(
      (await owner.post(`/v1/time-entries/${cont.body.id}/duplicate`)).status
    ).toBe(400) // still running
    await owner.post("/v1/time-entries/stop")
    const dup = await owner.post(`/v1/time-entries/${stopped.id}/duplicate`)
    expect(dup.body).toMatchObject({
      startedAt: stopped.startedAt,
      durationSeconds: stopped.durationSeconds,
      isRunning: false,
    })
    expect(dup.body.id).not.toBe(stopped.id)

    // Suggestions: one per description + project + task, filterable.
    const sugg = (await owner.get("/v1/time-entries/suggestions?q=inbox")).body
      .items
    expect(sugg).toHaveLength(1)
    expect(sugg[0]).toMatchObject({
      description: "Inbox zero",
      projectName: "Website",
      taskTitle: "Build",
    })
    expect(
      (await owner.get("/v1/time-entries/suggestions?q=nothing-like-this")).body
        .items
    ).toEqual([])

    // Bulk: invoiced entries are skipped.
    const today = new Date().toISOString().slice(0, 10)
    const billable = (
      await owner.post("/v1/time-entries", {
        projectId: project.id,
        entryDate: today,
        durationMinutes: 60,
      })
    ).body
    const invoice = await owner.post("/v1/invoices/from-time", {
      projectId: project.id,
      entryIds: [billable.id],
    })
    expect(invoice.status).toBe(201)
    const ids = [stopped.id, cont.body.id, dup.body.id, billable.id]
    const bulk = await owner.patch("/v1/time-entries/bulk", {
      ids,
      billable: true,
      tagIds: [deep.body.id],
      tagMode: "replace",
    })
    expect(bulk.body).toEqual({ updated: 3, skipped: 1 })
    const list = (
      await owner.get(
        `/v1/time-entries?from=${today}&to=${today}&tagId=${deep.body.id}`
      )
    ).body.items
    expect(list).toHaveLength(3)
    expect(list.every((e: any) => e.billable && e.tags.length === 1)).toBe(true)
    expect(
      (
        await owner.patch("/v1/time-entries/bulk", {
          ids,
          projectId: null,
        })
      ).body
    ).toEqual({ updated: 3, skipped: 1 })
    expect(
      (await owner.post("/v1/time-entries/bulk-delete", { ids })).body
    ).toEqual({ updated: 3, skipped: 1 })

    // A member can create tags but not rename or delete them.
    const member = new Client(t)
    const { email } = await member.signUp("Mo Member")
    const role = (
      await owner.post("/v1/roles", {
        name: "Tracker",
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
    expect((await member.post("/v1/tags", { name: "Admin" })).status).toBe(201)
    expect(
      (await member.patch(`/v1/tags/${call.id}`, { name: "Calls" })).status
    ).toBe(403)
    // …and can't bulk-edit someone else's time (skipped, not changed).
    expect(
      (
        await member.patch("/v1/time-entries/bulk", {
          ids: [billable.id],
          billable: false,
        })
      ).body
    ).toEqual({ updated: 0, skipped: 1 })

    // Deleting a tag removes it from entries.
    expect((await owner.del(`/v1/tags/${call.id}`)).status).toBe(204)
    expect(
      (await owner.get("/v1/tags")).body.items.map((x: any) => x.name)
    ).toEqual(["Admin", "Deep work"])
  })
})

describe("timesheet, reports and Clockify import", () => {
  const upload = async (
    c: Client,
    csv: string,
    query = ""
  ): Promise<{ status: number; body: any }> => {
    const boundary = "----billleaf-import"
    const res = await t.app.inject({
      method: "POST",
      url: `/v1/time/import/clockify${query}`,
      headers: {
        ...c.headers(),
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload: Buffer.concat([
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="clockify.csv"\r\nContent-Type: text/csv\r\n\r\n`
        ),
        Buffer.from(csv),
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]),
    })
    return { status: res.statusCode, body: JSON.parse(res.body) }
  }

  it("edits the weekly grid by cell, never below invoiced time", async () => {
    const owner = new Client(t)
    await owner.signUp("Grid Owner")
    await owner.createWorkspace("Grid")
    await owner.patch("/v1/workspace", { timezone: "UTC" })
    const client = (await owner.post("/v1/clients", { name: "Grid Co" })).body
    const project = (
      await owner.post("/v1/projects", {
        name: "Grid project",
        clientId: client.id,
        hourlyRate: 6_000,
      })
    ).body
    const monday = "2026-11-09"
    const cell = (date: string, seconds: number, projectId = project.id) =>
      owner.put("/v1/time/timesheet/cell", {
        date,
        projectId,
        taskId: null,
        seconds,
      })

    let sheet = (await cell("2026-11-11", 5_400)).body
    expect(sheet.weekStart).toBe(monday)
    expect(sheet.rows).toHaveLength(1)
    expect(sheet.rows[0].seconds).toEqual([0, 0, 5_400, 0, 0, 0, 0])
    // Add more, then trim back below the first entry (newest goes first).
    await cell("2026-11-11", 9_000)
    sheet = (await cell("2026-11-11", 3_600)).body
    expect(sheet.rows[0].seconds[2]).toBe(3_600)
    const entries = (
      await owner.get("/v1/time-entries?from=2026-11-11&to=2026-11-11")
    ).body.items
    expect(entries).toHaveLength(1)
    expect(entries[0].durationSeconds).toBe(3_600)
    // Any day of the week returns the same grid; no-project rows work too.
    sheet = (await cell("2026-11-15", 1_800, null as never)).body
    expect(sheet.rows.map((r: any) => r.projectName)).toEqual([
      "Grid project",
      null,
    ])
    expect(
      (await owner.get("/v1/time/timesheet?week=2026-11-13")).body.weekStart
    ).toBe(monday)

    // Invoiced time can't be removed from the grid.
    await owner.post("/v1/invoices/from-time", { projectId: project.id })
    const locked = await cell("2026-11-11", 1_800)
    expect(locked.status).toBe(409)
    expect(locked.body.code).toBe("time_entry_invoiced")
    sheet = (await cell("2026-11-11", 5_400)).body // adding is fine
    expect(sheet.rows[0]).toMatchObject({
      seconds: [0, 0, 5_400, 0, 0, 0, 0],
      lockedSeconds: [0, 0, 3_600, 0, 0, 0, 0],
    })
    sheet = (await cell("2026-11-15", 0, null as never)).body
    expect(sheet.rows).toHaveLength(1)
  })

  it("reports by project, tag and day with amounts and CSV, own time only without time.read", async () => {
    const owner = new Client(t)
    await owner.signUp("Report Owner")
    const ws = await owner.createWorkspace("Reports")
    await t.db
      .update(workspaceSubscriptions)
      .set({ planKey: "team" })
      .where(eq(workspaceSubscriptions.workspaceId, ws.id))
    await owner.patch("/v1/workspace", { timezone: "UTC" })
    const client = (await owner.post("/v1/clients", { name: "Acme" })).body
    const site = (
      await owner.post("/v1/projects", {
        name: "Site",
        clientId: client.id,
        hourlyRate: 10_000,
      })
    ).body
    const design = (await owner.post("/v1/tags", { name: "Design" })).body
    const meet = (await owner.post("/v1/tags", { name: "Meeting" })).body
    const log = (body: Record<string, unknown>) =>
      owner.post("/v1/time-entries", body)
    await log({
      projectId: site.id,
      description: "=SUM(A1)",
      startedAt: "2026-11-02T09:00:00.000Z",
      endedAt: "2026-11-02T11:00:00.000Z",
      tagIds: [design.id, meet.id],
    })
    await log({
      projectId: site.id,
      startedAt: "2026-11-03T09:00:00.000Z",
      endedAt: "2026-11-03T09:30:00.000Z",
      billable: false,
    })
    await log({
      description: "Admin",
      startedAt: "2026-11-03T13:00:00.000Z",
      endedAt: "2026-11-03T14:00:00.000Z",
    })

    const range = "from=2026-11-02&to=2026-11-08"
    const byProject = (
      await owner.get(`/v1/time/reports/summary?${range}&groupBy=project`)
    ).body
    expect(byProject).toMatchObject({
      totalSeconds: 3.5 * 3600,
      billableSeconds: 3 * 3600,
      amounts: [{ currency: "USD", amount: 20_000 }],
    })
    expect(byProject.days).toHaveLength(7)
    expect(byProject.byDay[1]).toMatchObject({
      date: "2026-11-03",
      seconds: 1.5 * 3600,
    })
    expect(
      byProject.groups.map((g: any) => [g.label, g.detail, g.seconds])
    ).toEqual([
      ["Site", "Acme", 2.5 * 3600],
      ["No project", null, 3600],
    ])
    const byTag = (
      await owner.get(`/v1/time/reports/summary?${range}&groupBy=tag`)
    ).body.groups
    expect(byTag.map((g: any) => [g.label, g.seconds])).toEqual([
      ["Design", 7200],
      ["Meeting", 7200],
      ["No tag", 1.5 * 3600],
    ])
    // Filters: a tag, and entries without a project.
    expect(
      (await owner.get(`/v1/time/reports/summary?${range}&tagId=${meet.id}`))
        .body.totalSeconds
    ).toBe(7200)
    expect(
      (await owner.get(`/v1/time/reports/summary?${range}&withoutProject=true`))
        .body.totalSeconds
    ).toBe(3600)

    const detailed = (
      await owner.get(
        `/v1/time/reports/detailed?${range}&pageSize=2&sort=duration:asc`
      )
    ).body
    expect(detailed).toMatchObject({
      total: 3,
      totalSeconds: 3.5 * 3600,
      page: 1,
    })
    expect(detailed.items.map((e: any) => e.durationSeconds)).toEqual([
      1800, 3600,
    ])
    expect(
      (await owner.get(`/v1/time/reports/detailed?${range}&sort=secret:asc`))
        .status
    ).toBe(422)

    const csv = await t.app.inject({
      method: "GET",
      url: `/v1/time/reports/detailed.csv?${range}`,
      headers: owner.headers(),
    })
    expect(csv.headers["content-type"]).toContain("text/csv")
    const lines = csv.body.replace(/^\uFEFF/, "").split("\r\n")
    expect(lines[0]).toMatch(/^Date,Start Time,End Date,End Time,/)
    expect(lines).toHaveLength(4)
    // Formula-looking text is neutralised; amounts use the hourly rate.
    expect(lines.find((l) => l.includes("SUM"))).toContain(
      '\'=SUM(A1),"Design, Meeting",Yes,100.00,200.00,USD'
    )

    // A member without time.read only ever sees their own time.
    const member = new Client(t)
    const { email } = await member.signUp("Report Member")
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
    await member.post("/v1/time-entries", {
      startedAt: "2026-11-04T09:00:00.000Z",
      endedAt: "2026-11-04T10:00:00.000Z",
    })
    expect(
      (await member.get(`/v1/time/reports/summary?${range}`)).body.totalSeconds
    ).toBe(3600)
    const ownerMemberId = detailed.items[0].memberId
    expect(
      (
        await member.get(
          `/v1/time/reports/summary?${range}&memberId=${ownerMemberId}`
        )
      ).status
    ).toBe(403)
    expect(
      (
        await owner.get(`/v1/time/reports/summary?${range}&groupBy=member`)
      ).body.groups.map((g: any) => g.label)
    ).toEqual(["Report Owner", "Report Member"])
  })

  it("previews, imports and re-imports a Clockify CSV without duplicates", async () => {
    const owner = new Client(t)
    const { email } = await owner.signUp("Importer")
    await owner.createWorkspace("Import")
    await owner.patch("/v1/workspace", { timezone: "Asia/Yangon" })
    await owner.post("/v1/clients", { name: "northwind" }) // matched case-insensitively
    const csv = readFileSync(
      new URL("../fixtures/clockify-detailed.csv", import.meta.url),
      "utf8"
    ).replaceAll("IMPORTER_EMAIL", email.toUpperCase())

    const preview = await upload(owner, csv, "?dryRun=true")
    expect(preview.status).toBe(201)
    expect(preview.body).toMatchObject({
      dryRun: true,
      batchId: null,
      rows: 5,
      imported: 4,
      duplicates: 0,
      invalid: [{ line: 6, message: 'Unreadable date "11/31/2026"' }],
      totalSeconds: (2.5 + 0.75 + 0.5 + 2) * 3600,
      dateFormat: "MDY",
      newClients: [],
      newProjects: [{ name: "Brand refresh", clientName: "Northwind" }],
      newTasks: 1,
      newTags: ["Deep work", "Design", "Meeting"],
    })
    expect(preview.body.members).toEqual([
      { name: "Importer", email, matched: true, entries: 3 },
      {
        name: "Sam Stranger",
        email: "sam@elsewhere.test",
        matched: false,
        entries: 1,
      },
    ])
    // Nothing was written.
    expect((await owner.get("/v1/tags")).body.items).toEqual([])

    const done = await upload(owner, csv)
    expect(done.body).toMatchObject({
      dryRun: false,
      imported: 4,
      duplicates: 0,
      batchId: expect.any(String),
    })
    const items = (
      await owner.get("/v1/time-entries?from=2026-11-01&to=2026-11-30")
    ).body.items
    expect(items).toHaveLength(4)
    const logo = items.find((e: any) => e.description === "Logo concepts")
    expect(logo).toMatchObject({
      projectName: "Brand refresh",
      clientName: "northwind",
      taskTitle: "Sketching",
      entryDate: "2026-11-03",
      // 09:00 in Yangon (UTC+6:30)
      startedAt: "2026-11-03T02:30:00.000Z",
      durationSeconds: 9_000,
      billable: true,
    })
    expect(logo.tags.map((x: any) => x.name)).toEqual(["Deep work", "Design"])
    // Unknown people's time is assigned to the importer; midnight-crossing works.
    const late = items.find((e: any) => e.description === "Late fixes")
    expect(late).toMatchObject({
      memberName: "Importer",
      durationSeconds: 7200,
    })
    expect(
      items.find((e: any) => e.description === 'Admin, "inbox" and invoices')
    ).toMatchObject({ projectId: null, billable: false })

    const again = await upload(owner, csv)
    expect(again.body).toMatchObject({ imported: 0, duplicates: 4 })
    expect(
      (await owner.get("/v1/time-entries?from=2026-11-01&to=2026-11-30")).body
        .items
    ).toHaveLength(4)

    expect((await upload(owner, "Name,Amount\nA,1\n")).body.code).toBe(
      "invalid_csv"
    )
  })
})

describe("client portal", () => {
  /** A browser-like client for the portal (only the portal cookie). */
  class PortalVisitor {
    cookie: string | null = null
    async request(method: string, url: string, body?: unknown) {
      const res = await t.app.inject({
        method: method as "GET",
        url,
        headers: {
          origin: "http://localhost:3000",
          ...(body !== undefined ? { "content-type": "application/json" } : {}),
          ...(this.cookie ? { cookie: this.cookie } : {}),
        },
        payload: body === undefined ? undefined : JSON.stringify(body),
      })
      const set = res.headers["set-cookie"]
      const c = (Array.isArray(set) ? set[0] : set) as string | undefined
      if (c)
        this.cookie = c.split(";")[0]!.endsWith("=") ? null : c.split(";")[0]!
      let json: any
      try {
        json = res.body ? JSON.parse(res.body) : undefined
      } catch {
        json = res.body
      }
      return { status: res.statusCode, body: json, headers: res.headers }
    }
    get = (url: string) => this.request("GET", url)
    post = (url: string, body: unknown = {}) => this.request("POST", url, body)
  }

  const tokenFrom = (url: string) => new URL(url).searchParams.get("token")!

  it("signs clients in by emailed link and shows only their own, non-draft documents", async () => {
    const mail = t.app.get(MailService)
    const sent: any[] = []
    const spy = vi
      .spyOn(mail, "send")
      .mockImplementation(async (m) => void sent.push(m))
    try {
      const owner = new Client(t)
      await owner.signUp("Portal Owner")
      const ws = await owner.createWorkspace("Portal Studio")
      await owner.patch("/v1/workspace", { timezone: "UTC" })
      const client = (
        await owner.post("/v1/clients", {
          name: "Portal Co",
          email: "Billing@Portal.test",
        })
      ).body
      await owner.post(`/v1/clients/${client.id}/contacts`, {
        name: "Pat",
        email: "pat@portal.test",
      })
      const other = (
        await owner.post("/v1/clients", {
          name: "Someone Else",
          email: "else@portal.test",
        })
      ).body
      const line = { description: "Design", quantity: 2, unitPrice: 50_000 }

      const quote = (
        await owner.post("/v1/quotes", { clientId: client.id, lines: [line] })
      ).body
      await owner.post(`/v1/quotes/${quote.id}/send`)
      const draftQuote = (
        await owner.post("/v1/quotes", { clientId: client.id, lines: [line] })
      ).body
      const invoice = (
        await owner.post("/v1/invoices", { clientId: client.id, lines: [line] })
      ).body
      await owner.post(`/v1/invoices/${invoice.id}/issue`)
      const payment = (
        await owner.post(`/v1/invoices/${invoice.id}/payments`, {
          amount: 40_000,
        })
      ).body
      const contract = (
        await owner.post("/v1/contracts", {
          clientId: client.id,
          title: "Services agreement",
          body: "We agree.",
        })
      ).body
      await owner.post(`/v1/contracts/${contract.id}/send`)
      const otherInvoice = (
        await owner.post("/v1/invoices", { clientId: other.id, lines: [line] })
      ).body
      await owner.post(`/v1/invoices/${otherInvoice.id}/issue`)

      const visitor = new PortalVisitor()
      const base = `/v1/portal/${encodeURIComponent(ws.slug)}`

      // Public branding; unknown portals 404.
      expect((await visitor.get(base)).body).toMatchObject({
        name: "Portal Studio",
        showBadge: true,
        logoUrl: null,
      })
      expect((await visitor.get("/v1/portal/no-such-portal")).status).toBe(404)
      expect((await visitor.get(`${base}/me`)).status).toBe(401)

      // Unknown emails get the same answer and no email.
      sent.length = 0
      expect(
        (await visitor.post(`${base}/sign-in`, { email: "who@nowhere.test" }))
          .status
      ).toBe(202)
      expect(sent).toHaveLength(0)

      // A contact's email (any case) gets a single-use sign-in link.
      expect(
        (await visitor.post(`${base}/sign-in`, { email: "PAT@portal.test" }))
          .status
      ).toBe(202)
      expect(sent).toHaveLength(1)
      expect(sent[0]).toMatchObject({ to: "pat@portal.test" })
      const link = /https?:\/\/\S+?token=[\w-]+/.exec(sent[0].text)![0]
      expect(link).toContain(
        `/portal/${encodeURIComponent(ws.slug)}/auth?token=`
      )
      const token = tokenFrom(link)
      const session = await visitor.post("/v1/portal/session", { token })
      expect(session.status).toBe(200)
      expect(session.body).toEqual({ workspaceSlug: ws.slug })
      expect(String(session.headers["set-cookie"])).toMatch(
        /billleaf_portal=.+; Path=\/; HttpOnly; SameSite=Lax; Max-Age=2592000/
      )
      // Used once only.
      expect(
        (await new PortalVisitor().post("/v1/portal/session", { token })).body
          .code
      ).toBe("portal_link_invalid")

      const me = (await visitor.get(`${base}/me`)).body
      expect(me).toMatchObject({
        client: { id: client.id, name: "Portal Co" },
        email: "pat@portal.test",
        summary: {
          openInvoices: 1,
          amountDue: [{ currency: "USD", amount: 60_000 }],
          quotesAwaitingReply: 1,
          contractsAwaitingSignature: 1,
        },
      })

      const quotes = (await visitor.get(`${base}/quotes`)).body.items
      expect(quotes.map((q: any) => q.id)).toEqual([quote.id])
      expect(quotes[0]).toMatchObject({ status: "sent", total: 100_000 })
      const inv = (await visitor.get(`${base}/invoices/${invoice.id}`)).body
      expect(inv).toMatchObject({
        status: "partially_paid",
        amountDue: 60_000,
        lines: [{ description: "Design" }],
        receipts: [{ id: payment.id, amount: 40_000 }],
      })
      expect(inv).not.toHaveProperty("lastSentTo")
      expect(
        (await visitor.get(`${base}/contracts/${contract.id}`)).body
      ).toMatchObject({ status: "sent", body: "We agree." })
      expect((await visitor.get(`${base}/receipts`)).body.items).toHaveLength(1)

      const pdf = await visitor.get(`${base}/invoices/${invoice.id}/pdf`)
      expect(pdf.status).toBe(200)
      expect(pdf.headers["content-type"]).toBe("application/pdf")
      expect(
        (await visitor.get(`${base}/receipts/${payment.id}/pdf`)).status
      ).toBe(200)

      // Drafts and other clients' documents don't exist here.
      for (const url of [
        `${base}/quotes/${draftQuote.id}`,
        `${base}/invoices/${otherInvoice.id}`,
        `${base}/invoices/${otherInvoice.id}/pdf`,
      ])
        expect((await visitor.get(url)).status).toBe(404)

      // A session is only good for its own workspace's portal.
      const owner2 = new Client(t)
      await owner2.signUp("Other Owner")
      const ws2 = await owner2.createWorkspace("Elsewhere")
      expect(
        (await visitor.get(`/v1/portal/${encodeURIComponent(ws2.slug)}/me`))
          .status
      ).toBe(401)

      // A member session alone doesn't open the portal.
      expect((await owner.get(`${base}/me`)).status).toBe(401)

      // Document emails carry a reusable link straight to the document.
      sent.length = 0
      await owner.post(`/v1/invoices/${invoice.id}/send`, {})
      expect(sent[0].text).toContain("View invoice online:")
      const docLink = /https?:\/\/\S+?token=[\w-]+\S*/.exec(sent[0].text)![0]
      expect(new URL(docLink).searchParams.get("next")).toBe(
        `/invoices/${invoice.id}`
      )
      const fresh = new PortalVisitor()
      for (let i = 0; i < 2; i++)
        expect(
          (
            await fresh.post("/v1/portal/session", {
              token: tokenFrom(docLink),
            })
          ).status
        ).toBe(200)
      expect((await fresh.get(`${base}/me`)).body.email).toBe(
        "billing@portal.test"
      )

      // Signing out ends the session.
      expect((await visitor.post("/v1/portal/sign-out")).status).toBe(204)
      expect((await visitor.get(`${base}/me`)).status).toBe(401)
    } finally {
      spy.mockRestore()
    }
  })

  it("lets clients accept or decline quotes and e-sign contracts, with evidence", async () => {
    const mail = t.app.get(MailService)
    const sent: any[] = []
    const spy = vi
      .spyOn(mail, "send")
      .mockImplementation(async (m) => void sent.push(m))
    try {
      const owner = new Client(t)
      const { email: ownerEmail } = await owner.signUp("Responder Owner")
      const ws = await owner.createWorkspace("Respond Studio")
      await owner.patch("/v1/workspace", { timezone: "UTC" })
      const client = (
        await owner.post("/v1/clients", {
          name: "Answer Co",
          email: "boss@answer.test",
        })
      ).body
      const line = { description: "Build", quantity: 1, unitPrice: 90_000 }
      const sentQuote = async (extra: Record<string, unknown> = {}) => {
        const q = (
          await owner.post("/v1/quotes", {
            clientId: client.id,
            lines: [line],
            ...extra,
          })
        ).body
        await owner.post(`/v1/quotes/${q.id}/send`)
        return q
      }
      const toAccept = await sentQuote()
      const toDecline = await sentQuote()
      const expired = await sentQuote({
        issueDate: "2020-01-01",
        validUntil: "2020-01-31",
      })
      const sentContract = async (title: string) => {
        const c = (
          await owner.post("/v1/contracts", {
            clientId: client.id,
            title,
            body: "## Terms\nWe build, you pay.",
          })
        ).body
        await owner.post(`/v1/contracts/${c.id}/send`)
        return c
      }
      const toSign = await sentContract("Build agreement")
      const toRefuse = await sentContract("Retainer")

      const base = `/v1/portal/${encodeURIComponent(ws.slug)}`
      const visitor = new PortalVisitor()
      sent.length = 0
      await visitor.post(`${base}/sign-in`, { email: "boss@answer.test" })
      const link = /https?:\/\/\S+?token=[\w-]+/.exec(sent[0].text)![0]
      await visitor.post("/v1/portal/session", { token: tokenFrom(link) })
      sent.length = 0

      // Accept with a typed name; only once.
      expect(
        (
          await visitor.post(`${base}/quotes/${toAccept.id}/accept`, {
            name: "B",
          })
        ).status
      ).toBe(422)
      const accepted = await visitor.post(
        `${base}/quotes/${toAccept.id}/accept`,
        { name: "Bea Boss" }
      )
      expect(accepted.status).toBe(200)
      expect(accepted.body).toMatchObject({
        status: "accepted",
        respondedByName: "Bea Boss",
      })
      expect(
        (
          await visitor.post(`${base}/quotes/${toAccept.id}/accept`, {
            name: "Bea Boss",
          })
        ).body.code
      ).toBe("quote_not_open")
      expect((await owner.get(`/v1/quotes/${toAccept.id}`)).body).toMatchObject(
        {
          status: "accepted",
          respondedByName: "Bea Boss",
          respondedVia: "portal",
        }
      )
      // The business hears about it (no business email set → owners).
      expect(sent[0]).toMatchObject({
        to: ownerEmail,
        subject: `Answer Co accepted quote ${toAccept.number ?? accepted.body.number}`,
      })

      expect(
        (
          await visitor.post(`${base}/quotes/${toDecline.id}/decline`, {
            reason: "Over budget",
          })
        ).body
      ).toMatchObject({ status: "declined", declineReason: "Over budget" })
      expect(
        (
          await visitor.post(`${base}/quotes/${expired.id}/accept`, {
            name: "Bea Boss",
          })
        ).body.code
      ).toBe("quote_expired")

      // E-sign: the box must be ticked; then signed, with evidence.
      expect(
        (
          await visitor.post(`${base}/contracts/${toSign.id}/sign`, {
            name: "Bea Boss",
            agree: false,
          })
        ).status
      ).toBe(422)
      const pages = async (id: string) =>
        Number(
          /\/Type \/Pages[\s\S]*?\/Count (\d+)/.exec(
            (
              await t.app.inject({
                method: "GET",
                url: `/v1/contracts/${id}/pdf`,
                headers: owner.headers(),
              })
            ).body
          )?.[1]
        )
      const before = await pages(toSign.id)
      sent.length = 0
      const signed = await visitor.post(`${base}/contracts/${toSign.id}/sign`, {
        name: "Bea Boss",
        agree: true,
      })
      expect(signed.body).toMatchObject({
        status: "signed",
        signedByName: "Bea Boss",
        signedVia: "portal",
      })
      expect(await pages(toSign.id)).toBe(before + 1) // signature certificate
      const [evidence] = await t.db
        .select()
        .from(portalResponses)
        .where(eq(portalResponses.documentId, toSign.id))
      expect(evidence).toMatchObject({
        action: "signed",
        name: "Bea Boss",
        email: "boss@answer.test",
        documentHash: createHash("sha256")
          .update("## Terms\nWe build, you pay.")
          .digest("hex"),
      })
      expect(evidence!.ipAddress).toBeTruthy()
      // Owner notice + the signer's copy with the PDF.
      expect(sent.map((m) => m.to).sort()).toEqual(
        [ownerEmail, "boss@answer.test"].sort()
      )
      expect(
        sent.find((m) => m.to === "boss@answer.test").attachments[0]
      ).toMatchObject({ contentType: "application/pdf" })

      expect(
        (await visitor.post(`${base}/contracts/${toRefuse.id}/decline`, {}))
          .body
      ).toMatchObject({ status: "declined", declineReason: null })
      expect(
        (
          await visitor.post(`${base}/contracts/${toSign.id}/sign`, {
            name: "Bea Boss",
            agree: true,
          })
        ).body.code
      ).toBe("contract_not_open")

      // Other clients' documents can't be answered.
      const other = (
        await owner.post("/v1/clients", { name: "Not You", email: "x@y.test" })
      ).body
      const theirs = (
        await owner.post("/v1/quotes", { clientId: other.id, lines: [line] })
      ).body
      await owner.post(`/v1/quotes/${theirs.id}/send`)
      expect(
        (
          await visitor.post(`${base}/quotes/${theirs.id}/accept`, {
            name: "Bea Boss",
          })
        ).status
      ).toBe(404)
    } finally {
      spy.mockRestore()
    }
  })
})

describe("health checks", () => {
  it("reports the build, and runs the token-protected deep check", async () => {
    const anon = new Client(t)
    expect((await anon.get("/health/live")).body).toEqual({
      status: "ok",
      version: "test-build",
    })
    expect((await anon.get("/health")).status).toBe(200)

    // Hidden without the right token.
    expect((await anon.get("/health/deep")).status).toBe(404)
    expect(
      (
        await anon.request("GET", "/health/deep", undefined, {
          "x-health-token": "wrong-token-wrong-token-wrong",
        })
      ).status
    ).toBe(404)

    const deep = () =>
      anon.request("GET", "/health/deep", undefined, {
        "x-health-token": "integration-health-token-0123456789",
      })
    const redis = t.app.get(REDIS)
    await redis.del(WORKER_HEARTBEAT_KEY)
    const down = await deep()
    expect(down.status).toBe(503)
    expect(down.body.error).toHaveProperty("worker")
    expect(Object.keys(down.body.info).sort()).toEqual(
      ["database", "pdf", "queue", "redis", "storage"].sort()
    )

    await redis.set(WORKER_HEARTBEAT_KEY, new Date().toISOString(), "EX", 60)
    const up = await deep()
    expect(up.status).toBe(200)
    expect(up.body.status).toBe("ok")
    await redis.del(WORKER_HEARTBEAT_KEY)
  })
})

describe("payment instructions and proofs", () => {
  /** A tiny valid PNG (1x1). */
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
    ihdr.writeUInt32BE(1, 0)
    ihdr.writeUInt32BE(1, 4)
    ihdr.set([8, 6, 0, 0, 0], 8)
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", ihdr),
      chunk("IDAT", zlib.deflateSync(Buffer.from([0, 0x40, 0x80, 0x40, 0xff]))),
      chunk("IEND", Buffer.alloc(0)),
    ])
  })()

  /** multipart body: text fields + optional file. */
  const form = (
    fields: Record<string, string>,
    file?: { name: string; body: Buffer; type: string }
  ) => {
    const b = "----billleaf-proof"
    const parts: Buffer[] = []
    for (const [k, v] of Object.entries(fields))
      parts.push(
        Buffer.from(
          `--${b}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`
        )
      )
    if (file)
      parts.push(
        Buffer.from(
          `--${b}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: ${file.type}\r\n\r\n`
        ),
        file.body,
        Buffer.from("\r\n")
      )
    parts.push(Buffer.from(`--${b}--\r\n`))
    return {
      payload: Buffer.concat(parts),
      contentType: `multipart/form-data; boundary=${b}`,
    }
  }

  it("shows how to pay, takes the client's proof, and confirms or rejects it", async () => {
    const mail = t.app.get(MailService)
    const sent: any[] = []
    const spy = vi
      .spyOn(mail, "send")
      .mockImplementation(async (m) => void sent.push(m))
    try {
      const owner = new Client(t)
      const { email: ownerEmail } = await owner.signUp("Proof Owner")
      const ws = await owner.createWorkspace("Proof Studio")
      await owner.patch("/v1/workspace", { timezone: "UTC" })
      const client = (
        await owner.post("/v1/clients", {
          name: "Payer Co",
          email: "payer@payer.test",
        })
      ).body

      // Payment accounts.
      expect(
        (
          await owner.post("/v1/payment-accounts", {
            kind: "bank",
            label: "KBZ Bank",
          })
        ).status
      ).toBe(422) // needs a number or instructions
      const wallet = (
        await owner.post("/v1/payment-accounts", {
          kind: "mobile_wallet",
          label: "KBZPay",
          accountName: "Proof Owner",
          accountNumber: "09 123 456 789",
          currencies: ["USD"],
        })
      ).body
      const mmkOnly = (
        await owner.post("/v1/payment-accounts", {
          kind: "bank",
          label: "AYA Bank",
          accountNumber: "0012 3456",
          currencies: ["MMK"],
        })
      ).body
      const upload = (
        url: string,
        f: ReturnType<typeof form>,
        headers: Record<string, string>
      ) =>
        t.app
          .inject({
            method: url.includes("/payment-proofs") ? "POST" : "PUT",
            url,
            headers: { ...headers, "content-type": f.contentType },
            payload: f.payload,
          })
          .then((r) => ({ status: r.statusCode, body: JSON.parse(r.body) }))
      const withQr = await upload(
        `/v1/payment-accounts/${wallet.id}/qr`,
        form({}, { name: "qr.png", body: png, type: "image/png" }),
        owner.headers()
      )
      expect(withQr.status).toBe(200)
      expect(withQr.body.qrUrl).toMatch(/^http/)
      expect(
        (
          await owner.put("/v1/payment-accounts/order", {
            ids: [mmkOnly.id, wallet.id],
          })
        ).body.items.map((a: any) => a.label)
      ).toEqual(["AYA Bank", "KBZPay"])

      // An issued USD invoice: the email says how to pay (USD accounts only).
      const line = { description: "Work", quantity: 1, unitPrice: 100_000 }
      const invoice = (
        await owner.post("/v1/invoices", { clientId: client.id, lines: [line] })
      ).body
      await owner.post(`/v1/invoices/${invoice.id}/issue`)
      expect(
        (
          await t.app.inject({
            method: "GET",
            url: `/v1/invoices/${invoice.id}/pdf`,
            headers: owner.headers(),
          })
        ).statusCode
      ).toBe(200)
      sent.length = 0
      await owner.post(`/v1/invoices/${invoice.id}/send`, {})
      expect(sent[0].text).toContain("How to pay:")
      expect(sent[0].text).toContain(
        "KBZPay · Name: Proof Owner · Number: 09 123 456 789"
      )
      expect(sent[0].text).not.toContain("AYA Bank")

      // The client signs in to the portal and sees the USD account.
      const base = `/v1/portal/${encodeURIComponent(ws.slug)}`
      const portalCookie = async () => {
        sent.length = 0
        await owner.request("POST", `${base}/sign-in`, {
          email: "payer@payer.test",
        })
        const link = /https?:\/\/\S+?token=[\w-]+/.exec(sent[0].text)![0]
        const res = await t.app.inject({
          method: "POST",
          url: "/v1/portal/session",
          headers: {
            origin: "http://localhost:3000",
            "content-type": "application/json",
          },
          payload: JSON.stringify({
            token: new URL(link).searchParams.get("token"),
          }),
        })
        return String(res.headers["set-cookie"]).split(";")[0]!
      }
      const cookie = await portalCookie()
      const portal = { origin: "http://localhost:3000", cookie }
      const view = await t.app.inject({
        method: "GET",
        url: `${base}/invoices/${invoice.id}`,
        headers: portal,
      })
      const inv = JSON.parse(view.body)
      expect(inv.paymentAccounts.map((a: any) => a.label)).toEqual(["KBZPay"])
      expect(inv.paymentAccounts[0].qrUrl).toMatch(/^http/)
      expect(inv.paymentProofs).toEqual([])

      // Submitting a proof.
      const proofUrl = `${base}/invoices/${invoice.id}/payment-proofs`
      const fields = {
        amount: "60000",
        paidOn: "2026-11-15",
        paymentAccountId: wallet.id,
        reference: "TXN-123",
      }
      expect((await upload(proofUrl, form(fields), portal)).body.code).toBe(
        "file_required"
      )
      expect(
        (
          await upload(
            proofUrl,
            form(
              { ...fields, amount: "999999" },
              { name: "shot.png", body: png, type: "image/png" }
            ),
            portal
          )
        ).body.code
      ).toBe("overpayment")
      sent.length = 0
      const submitted = await upload(
        proofUrl,
        form(fields, { name: "shot.png", body: png, type: "image/png" }),
        portal
      )
      expect(submitted.status).toBe(201)
      expect(submitted.body.paymentProofs).toMatchObject([
        { amount: 60_000, status: "pending", reference: "TXN-123" },
      ])
      expect(sent[0]).toMatchObject({ to: ownerEmail })
      expect(sent[0].subject).toContain("Payer Co paid invoice")

      // The business reviews it.
      const pending = (await owner.get("/v1/payment-proofs?status=pending"))
        .body
      expect(pending.total).toBe(1)
      const proof = pending.items[0]
      expect(proof).toMatchObject({
        invoiceId: invoice.id,
        clientName: "Payer Co",
        paymentAccountLabel: "KBZPay",
        hasFile: true,
      })
      const shot = await t.app.inject({
        method: "GET",
        url: `/v1/payment-proofs/${proof.id}/file`,
        headers: owner.headers(),
      })
      expect(shot.statusCode).toBe(200)
      expect(shot.headers["content-type"]).toBe("image/png")
      expect((await owner.get("/v1/dashboard")).body.pendingProofs.count).toBe(
        1
      )

      sent.length = 0
      const confirmed = await owner.post(
        `/v1/payment-proofs/${proof.id}/confirm`,
        {}
      )
      expect(confirmed.body).toMatchObject({
        status: "confirmed",
        paymentId: expect.any(String),
      })
      const afterConfirm = (await owner.get(`/v1/invoices/${invoice.id}`)).body
      expect(afterConfirm).toMatchObject({
        amountPaid: 60_000,
        amountDue: 40_000,
      })
      const payment = (
        await owner.get(`/v1/payments/${confirmed.body.paymentId}`)
      ).body
      expect(payment).toMatchObject({
        method: "mobile_wallet",
        reference: "TXN-123",
        receiptNumber: expect.any(String),
      })
      expect(sent.find((m) => m.to === "payer@payer.test")?.subject).toContain(
        "Receipt"
      )
      expect(
        (await owner.post(`/v1/payment-proofs/${proof.id}/confirm`, {})).body
          .code
      ).toBe("proof_already_reviewed")

      // A second proof is rejected with a reason the client sees.
      const second = await upload(
        proofUrl,
        form(
          { amount: "40000", paidOn: "2026-11-15" },
          { name: "shot.png", body: png, type: "image/png" }
        ),
        portal
      )
      const secondId = second.body.paymentProofs.find(
        (p: any) => p.status === "pending"
      ).id
      sent.length = 0
      expect(
        (
          await owner.post(`/v1/payment-proofs/${secondId}/reject`, {
            reason: "No transfer with that amount arrived",
          })
        ).body
      ).toMatchObject({ status: "rejected" })
      expect(sent[0]).toMatchObject({ to: "payer@payer.test" })
      expect(sent[0].text).toContain("No transfer with that amount arrived")
      const rejectedView = JSON.parse(
        (
          await t.app.inject({
            method: "GET",
            url: `${base}/invoices/${invoice.id}`,
            headers: portal,
          })
        ).body
      )
      expect(
        rejectedView.paymentProofs.find((p: any) => p.id === secondId)
      ).toMatchObject({
        status: "rejected",
        rejectionReason: "No transfer with that amount arrived",
      })

      // Once paid in full there's nothing to prove.
      await owner.post(`/v1/invoices/${invoice.id}/payments`, {
        amount: 40_000,
      })
      expect(
        (
          await upload(
            proofUrl,
            form(
              { amount: "100", paidOn: "2026-11-15" },
              { name: "shot.png", body: png, type: "image/png" }
            ),
            portal
          )
        ).body.code
      ).toBe("nothing_due")
      expect(
        JSON.parse(
          (
            await t.app.inject({
              method: "GET",
              url: `${base}/invoices/${invoice.id}`,
              headers: portal,
            })
          ).body
        ).paymentAccounts
      ).toEqual([])

      // Another workspace's member can't see or confirm these proofs.
      const stranger = new Client(t)
      await stranger.signUp("Stranger")
      await stranger.createWorkspace("Elsewhere Two")
      expect(
        (await stranger.post(`/v1/payment-proofs/${secondId}/confirm`, {}))
          .status
      ).toBe(404)
    } finally {
      spy.mockRestore()
    }
  })
})

describe("platform admin portal", () => {
  it("is hidden from non-admins, needs 2FA, and audits plan changes, bans and impersonation", async () => {
    const setTwoFactor = (email: string, on: boolean) =>
      t.db
        .update(userTable)
        .set({ twoFactorEnabled: on })
        .where(eq(userTable.email, email))

    // A normal workspace owner (the target).
    const target = new Client(t)
    const { email: targetEmail } = await target.signUp("Target Owner")
    const ws = await target.createWorkspace("Target Studio")
    const targetUserId = (await target.get("/v1/me")).body.user.id
    expect((await target.get("/v1/me")).body.user).toMatchObject({
      isPlatformAdmin: false,
      impersonatedBy: null,
    })
    expect((await target.get("/v1/admin/overview")).status).toBe(404)

    // The admin (listed in PLATFORM_ADMIN_EMAILS) needs 2FA first.
    const admin = new Client(t)
    await admin.signUp("Platform Admin", "platform.admin@example.test")
    await admin.createWorkspace("Billleaf HQ")
    const denied = await admin.get("/v1/admin/overview")
    expect(denied.status).toBe(403)
    expect(denied.body.code).toBe("admin_2fa_required")
    await setTwoFactor("platform.admin@example.test", true)
    admin.forgetSessionCache()
    const overview = await admin.get("/v1/admin/overview")
    expect(overview.status).toBe(200)
    expect(overview.body.users.total).toBeGreaterThanOrEqual(2)
    expect(overview.body.signupsByWeek).toHaveLength(12)
    expect((await admin.get("/v1/me")).body.user.isPlatformAdmin).toBe(true)
    const [row] = await t.db
      .select({ role: userTable.role })
      .from(userTable)
      .where(eq(userTable.email, "platform.admin@example.test"))
    expect(row!.role).toBe("admin")

    // Better Auth's own admin routes are closed.
    expect(
      (
        await admin.post("/api/auth/admin/set-role", {
          userId: targetUserId,
          role: "admin",
        })
      ).status
    ).toBe(404)

    // Workspaces: find, open, set a plan with an end date.
    const list = (
      await admin.get(
        `/v1/admin/workspaces?q=${encodeURIComponent("Target Studio")}`
      )
    ).body
    expect(list.items[0]).toMatchObject({
      id: ws.id,
      effectivePlanKey: "free",
      owner: { email: targetEmail },
    })
    const periodEnd = new Date(Date.now() + 30 * 86_400_000)
      .toISOString()
      .slice(0, 10)
    expect(
      (
        await admin.put(`/v1/admin/workspaces/${ws.id}/plan`, {
          planKey: "pro",
          periodEnd,
        })
      ).status
    ).toBe(422) // reason required
    const planned = (
      await admin.put(`/v1/admin/workspaces/${ws.id}/plan`, {
        planKey: "pro",
        interval: "month",
        periodEnd,
        reason: "Early supporter, first month free",
      })
    ).body
    expect(planned.subscription).toMatchObject({
      effectivePlanKey: "pro",
      provider: "manual",
      cancelAtPeriodEnd: true,
    })
    expect(planned.billingEvents[0]).toMatchObject({ provider: "manual" })
    expect((await target.get("/v1/me")).body.plan.key).toBe("pro")
    // The workspace sees it in its own audit log, and nothing else's.
    const wsAudit = (await target.get("/v1/audit?action=admin.")).body
    expect(wsAudit.items.map((e: any) => e.action)).toEqual([
      "admin.workspace_plan_set",
    ])
    expect(wsAudit.items[0].metadata.reason).toBe(
      "Early supporter, first month free"
    )

    // Users: no acting on yourself; ban → signed out and can't sign in.
    const adminId = (await admin.get("/v1/me")).body.user.id
    expect(
      (await admin.post(`/v1/admin/users/${adminId}/ban`, { reason: "test" }))
        .status
    ).toBe(400)
    const users = (
      await admin.get(`/v1/admin/users?q=${encodeURIComponent(targetEmail)}`)
    ).body
    expect(users.items[0]).toMatchObject({ id: targetUserId, workspaces: 1 })
    const banned = (
      await admin.post(`/v1/admin/users/${targetUserId}/ban`, {
        reason: "Chargeback fraud",
      })
    ).body
    expect(banned).toMatchObject({
      banned: true,
      banReason: "Chargeback fraud",
    })
    target.forgetSessionCache()
    expect((await target.get("/v1/me")).status).toBe(401)
    expect(
      (
        await target.post("/api/auth/sign-in/email", {
          email: targetEmail,
          password: "integration-password-123",
        })
      ).status
    ).not.toBe(200)
    await admin.post(`/v1/admin/users/${targetUserId}/unban`, {
      reason: "Resolved with the bank",
    })
    expect(
      (
        await target.post("/api/auth/sign-in/email", {
          email: targetEmail,
          password: "integration-password-123",
        })
      ).status
    ).toBe(200)
    expect(
      (await admin.post(`/v1/admin/users/${targetUserId}/resend-verification`))
        .body.code
    ).toBe("already_verified")

    // Impersonation: only right after a reason is recorded, and only once.
    admin.forgetSessionCache()
    expect(
      (
        await admin.post("/api/auth/admin/impersonate-user", {
          userId: targetUserId,
        })
      ).status
    ).toBe(403)
    expect(
      (
        await admin.post(`/v1/admin/users/${targetUserId}/impersonation`, {
          reason: "Ticket #42: invoice totals look wrong",
        })
      ).status
    ).toBe(200)
    const imp = await admin.post("/api/auth/admin/impersonate-user", {
      userId: targetUserId,
    })
    expect(imp.status).toBe(200)
    // The impersonated session works in the user's own workspace.
    const adminWorkspace = admin.workspaceId
    admin.workspaceId = ws.id
    const asTarget = (await admin.get("/v1/me")).body.user
    expect(asTarget).toMatchObject({
      id: targetUserId,
      impersonatedBy: adminId,
    })
    expect((await admin.get("/v1/admin/overview")).status).toBe(404)
    expect(
      (await admin.post("/api/auth/admin/stop-impersonating")).status
    ).toBe(200)
    admin.workspaceId = adminWorkspace
    admin.forgetSessionCache()
    expect((await admin.get("/v1/me")).body.user.id).toBe(adminId)
    expect(
      (
        await admin.post("/api/auth/admin/impersonate-user", {
          userId: targetUserId,
        })
      ).status
    ).toBe(403) // the reason is single-use

    // Everything is in the platform audit log, with IP addresses.
    const log = (await admin.get("/v1/admin/audit?action=admin.&pageSize=50"))
      .body.items
    expect(log.map((e: any) => e.action)).toEqual(
      expect.arrayContaining([
        "admin.workspace_plan_set",
        "admin.user_banned",
        "admin.user_unbanned",
        "admin.impersonation_started",
      ])
    )
    expect(
      log.find((e: any) => e.action === "admin.user_banned")
    ).toMatchObject({
      actor: { email: "platform.admin@example.test" },
      ipAddress: expect.any(String),
    })
    const [raw] = await t.db
      .select({ ip: auditLogs.ipAddress })
      .from(auditLogs)
      .where(eq(auditLogs.action, "admin.impersonation_started"))
    expect(raw!.ip).toBeTruthy()

    // Jobs: counts per queue.
    const jobs = (await admin.get("/v1/admin/jobs")).body
    expect(jobs.counts.map((c: any) => c.queue)).toEqual([
      "email",
      "recurring",
      "billing",
      "exports",
    ])
  })
})

describe("manual subscriptions", () => {
  const png = (() => {
    const crcTable = Array.from({ length: 256 }, (_, n) => {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      return c >>> 0
    })
    const crc = (buf: Buffer) => {
      let c = 0xffffffff
      for (const b of buf) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8)
      return (c ^ 0xffffffff) >>> 0
    }
    const chunk = (type: string, data: Buffer) => {
      const len = Buffer.alloc(4)
      len.writeUInt32BE(data.length)
      const td = Buffer.concat([Buffer.from(type), data])
      const c = Buffer.alloc(4)
      c.writeUInt32BE(crc(td))
      return Buffer.concat([len, td, c])
    }
    const ihdr = Buffer.alloc(13)
    ihdr.writeUInt32BE(1, 0)
    ihdr.writeUInt32BE(1, 4)
    ihdr.set([8, 6, 0, 0, 0], 8)
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", ihdr),
      chunk("IDAT", zlib.deflateSync(Buffer.from([0, 0x40, 0x80, 0x40, 0xff]))),
      chunk("IEND", Buffer.alloc(0)),
    ])
  })()

  const send = (
    method: "POST" | "PUT",
    url: string,
    headers: Record<string, string>,
    fields: Record<string, string>,
    withFile = true
  ) => {
    const b = "----billleaf-sub"
    const parts: Buffer[] = []
    for (const [k, v] of Object.entries(fields))
      parts.push(
        Buffer.from(
          `--${b}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`
        )
      )
    if (withFile)
      parts.push(
        Buffer.from(
          `--${b}\r\nContent-Disposition: form-data; name="file"; filename="proof.png"\r\nContent-Type: image/png\r\n\r\n`
        ),
        png,
        Buffer.from("\r\n")
      )
    parts.push(Buffer.from(`--${b}--\r\n`))
    return t.app
      .inject({
        method,
        url,
        headers: {
          ...headers,
          "content-type": `multipart/form-data; boundary=${b}`,
        },
        payload: Buffer.concat(parts),
      })
      .then((r) => ({ status: r.statusCode, body: JSON.parse(r.body) }))
  }

  it("takes proof, waits for approval, stacks renewals, rejects, and expires after the grace period", async () => {
    const mail = t.app.get(MailService)
    const sent: any[] = []
    const spy = vi
      .spyOn(mail, "send")
      .mockImplementation(async (m) => void sent.push(m))
    try {
      const day = 86_400_000
      const admin = new Client(t)
      await admin.signUp("Billing Admin", "billing.admin@example.test")
      await t.db
        .update(userTable)
        .set({ twoFactorEnabled: true })
        .where(eq(userTable.email, "billing.admin@example.test"))
      admin.forgetSessionCache()

      const owner = new Client(t)
      const { email: ownerEmail } = await owner.signUp("Paying Owner")
      const ws = await owner.createWorkspace("Paying Studio")
      expect((await owner.get("/v1/admin/prices")).status).toBe(404)

      // Admin: prices and where to pay.
      const price = (
        await admin.post("/v1/admin/prices", {
          planKey: "pro",
          interval: "month",
          currency: "MMK",
          amount: 30_000,
        })
      ).body
      expect(price).toMatchObject({ planKey: "pro", amount: 30_000 })
      expect(
        (
          await admin.post("/v1/admin/prices", {
            planKey: "pro",
            interval: "month",
            currency: "MMK",
            amount: 1,
          })
        ).status
      ).toBe(409)
      const account = (
        await admin.post("/v1/admin/payment-accounts", {
          kind: "mobile_wallet",
          label: "KBZPay",
          accountName: "Billleaf",
          accountNumber: "09 000 000 000",
        })
      ).body
      const qr = await send(
        "PUT",
        `/v1/admin/payment-accounts/${account.id}/qr`,
        admin.headers(),
        {}
      )
      expect(qr.status).toBe(200)
      expect(qr.body.qrUrl).toMatch(/^http/)

      // Workspace: sees the price and account, pays with proof.
      const options = (await owner.get("/v1/billing/manual/options")).body
      expect(options.prices.map((p: any) => p.id)).toContain(price.id)
      expect(options.accounts.map((a: any) => a.id)).toContain(account.id)
      expect(options.pending).toBeNull()
      const today = new Date().toISOString().slice(0, 10)
      const fields = {
        planKey: "pro",
        interval: "month",
        currency: "MMK",
        periods: "2",
        paidOn: today,
        platformPaymentAccountId: account.id,
        reference: "TX-1001",
      }
      const url = "/v1/billing/manual/payments"
      expect(
        (
          await send("POST", url, owner.headers(), {
            ...fields,
            currency: "USD",
          })
        ).status
      ).toBe(400) // no USD price
      expect(
        (await send("POST", url, owner.headers(), fields, false)).status
      ).toBe(400) // proof required
      sent.length = 0
      const paid = await send("POST", url, owner.headers(), fields)
      expect(paid.status).toBe(201)
      expect(paid.body).toMatchObject({
        status: "pending",
        amount: 60_000,
        periods: 2,
        paymentAccountLabel: "KBZPay",
      })
      expect(sent.map((m) => m.to)).toContain("billing.admin@example.test")
      expect((await send("POST", url, owner.headers(), fields)).status).toBe(
        409
      )
      expect(
        (await owner.get("/v1/billing/manual/options")).body.pending.id
      ).toBe(paid.body.id)

      // Admin: approve once → Pro for two months.
      const queue = (
        await admin.get("/v1/admin/subscription-payments?status=pending")
      ).body
      const item = queue.items.find((i: any) => i.id === paid.body.id)
      expect(item).toMatchObject({
        workspace: { id: ws.id },
        submittedBy: { email: ownerEmail },
        currentPlanKey: "free",
      })
      expect(item.fileUrl).toMatch(/^http/)
      expect(
        (await admin.get("/v1/admin/overview")).body.pendingPayments
      ).toBeGreaterThanOrEqual(1)
      sent.length = 0
      const approved = await admin.post(
        `/v1/admin/subscription-payments/${paid.body.id}/approve`,
        {}
      )
      expect(approved.status).toBe(200)
      expect(approved.body.status).toBe("approved")
      expect(
        (
          await admin.post(
            `/v1/admin/subscription-payments/${paid.body.id}/approve`,
            {}
          )
        ).status
      ).toBe(409)
      const events = await t.db
        .select()
        .from(billingEvents)
        .where(eq(billingEvents.eventId, `manual-${paid.body.id}`))
      expect(events).toHaveLength(1)
      expect(sent.map((m) => m.to)).toEqual([ownerEmail])
      const billing = (await owner.get("/v1/billing")).body
      expect(billing).toMatchObject({
        effectivePlanKey: "pro",
        cancelAtPeriodEnd: true,
      })
      const firstEnd = new Date(billing.currentPeriodEnd)
      const twoMonths = addInterval(new Date(), "month", 2)
      expect(Math.abs(firstEnd.getTime() - twoMonths.getTime())).toBeLessThan(
        60_000
      )

      // An early renewal stacks onto the current period.
      const renewal = await send("POST", url, owner.headers(), {
        ...fields,
        periods: "1",
        reference: "TX-1002",
      })
      await admin.post(
        `/v1/admin/subscription-payments/${renewal.body.id}/approve`,
        {}
      )
      const stacked = addInterval(firstEnd, "month")
      expect((await owner.get("/v1/billing")).body.currentPeriodEnd).toBe(
        stacked.toISOString()
      )

      // Reject with a note: the owner is told why.
      const bad = await send("POST", url, owner.headers(), {
        ...fields,
        periods: "1",
        reference: "WRONG",
      })
      sent.length = 0
      expect(
        (
          await admin.post(
            `/v1/admin/subscription-payments/${bad.body.id}/reject`,
            { reason: "No payment with this reference" }
          )
        ).body.status
      ).toBe("rejected")
      expect(sent[0]).toMatchObject({ to: ownerEmail })
      expect(sent[0].text).toContain("No payment with this reference")
      const history = (await owner.get("/v1/billing/manual/payments")).body
      expect(history.items.map((p: any) => p.status)).toEqual([
        "rejected",
        "approved",
        "approved",
      ])

      // Reminders: 7 days before, once; then the day before.
      const reminders = t.app.get(SubscriptionRemindersService)
      const setEnd = (end: Date) =>
        t.db
          .update(workspaceSubscriptions)
          .set({ currentPeriodEnd: end })
          .where(eq(workspaceSubscriptions.workspaceId, ws.id))
      const mine = () => sent.filter((m) => m.to === ownerEmail)
      sent.length = 0
      const end = new Date(Date.now() + 3 * day)
      await setEnd(end)
      await reminders.run()
      await reminders.run()
      expect(mine().map((m) => m.subject)).toEqual([
        "Your Pro plan ends in 7 days",
      ])
      await reminders.run(new Date(end.getTime() - day / 2))
      await reminders.run(new Date(end.getTime() - day / 2))
      expect(mine().map((m) => m.subject)).toEqual([
        "Your Pro plan ends in 7 days",
        "Your Pro plan ends tomorrow",
      ])

      // Grace: still Pro two days after the end, Free after the grace.
      await setEnd(new Date(Date.now() - 2 * day))
      const grace = (await owner.get("/v1/billing")).body
      expect(grace.effectivePlanKey).toBe("pro")
      expect(grace.graceEndsAt).not.toBeNull()
      await reminders.run()
      expect(mine().map((m) => m.subject)).toContain("Your Pro plan has ended")
      await setEnd(new Date(Date.now() - 8 * day))
      expect((await owner.get("/v1/billing")).body.effectivePlanKey).toBe(
        "free"
      )

      const audit = await t.db
        .select({ action: auditLogs.action })
        .from(auditLogs)
        .where(eq(auditLogs.workspaceId, ws.id))
      expect(audit.map((a) => a.action)).toEqual(
        expect.arrayContaining([
          "billing.payment_submitted",
          "admin.subscription_payment_approved",
          "admin.subscription_payment_rejected",
        ])
      )
    } finally {
      spy.mockRestore()
    }
  })
})

describe("launch readiness", () => {
  it("answers malformed JSON with 400, not 500", async () => {
    const owner = new Client(t)
    await owner.signUp("Bad JSON")
    await owner.createWorkspace("Bad JSON Studio")
    const res = await t.app.inject({
      method: "POST",
      url: "/v1/clients",
      headers: { ...owner.headers(), "content-type": "application/json" },
      payload: "{not json",
    })
    expect(res.statusCode).toBe(400)
    expect(res.headers["content-type"]).toContain("application/problem+json")
  })

  it("refuses workspace URLs that clash with the app's pages", async () => {
    const owner = new Client(t)
    await owner.signUp("Slug Picker")
    for (const slug of ["pricing", "admin", "app"]) {
      const res = await owner.post("/api/auth/organization/create", {
        name: "Clash",
        slug,
      })
      expect(res.status, slug).toBe(400)
    }
    const ok = await owner.post("/api/auth/organization/create", {
      name: "Fine",
      slug: `pricing-studio-${Date.now()}`,
    })
    expect(ok.status).toBe(200)
  })

  it("serves public pricing without a session", async () => {
    const anon = new Client(t)
    const res = await anon.get("/v1/billing/pricing")
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty("provider")
    expect(Array.isArray(res.body.prices)).toBe(true)
  })

  it("exports every record as CSV and deletes the workspace for owners only", async () => {
    const owner = new Client(t)
    const { email: ownerEmail } = await owner.signUp("Leaving Owner")
    const ws = await owner.createWorkspace("Leaving Studio")
    await t.db
      .update(workspaceSubscriptions)
      .set({ planKey: "team" })
      .where(eq(workspaceSubscriptions.workspaceId, ws.id))
    const client = (
      await owner.post("/v1/clients", {
        name: 'Quote "Heavy", Ltd',
        email: "heavy@client.test",
      })
    ).body
    await owner.post("/v1/invoices", {
      clientId: client.id,
      lines: [{ description: "Work", quantity: 1, unitPrice: 12_345 }],
    })

    // An Admin (not Owner) can do neither.
    const admin = new Client(t)
    const { email } = await admin.signUp("Leaving Admin")
    const adminRole = (await owner.get("/v1/roles")).body.find(
      (r: { slug: string }) => r.slug === "admin"
    )
    const inv = (
      await owner.post("/v1/invitations", { email, roleId: adminRole.id })
    ).body
    await admin.post("/api/auth/organization/accept-invitation", {
      invitationId: inv.id,
    })
    admin.workspaceId = ws.id
    expect((await admin.get("/v1/workspace/export")).status).toBe(403)
    expect(
      (await admin.post("/v1/workspace/delete", { confirmSlug: ws.slug }))
        .status
    ).toBe(403)

    // Export: a ZIP of CSVs, quoting values with commas and quotes.
    const res = await t.app.inject({
      method: "GET",
      url: "/v1/workspace/export",
      headers: owner.headers(),
    })
    expect(res.statusCode).toBe(200)
    expect(res.headers["content-type"]).toBe("application/zip")
    expect(res.headers["content-disposition"]).toContain(".zip")
    const zip = unzipSync(new Uint8Array(res.rawPayload))
    expect(Object.keys(zip)).toEqual(
      expect.arrayContaining([
        "README.txt",
        "clients.csv",
        "invoices.csv",
        "invoice_lines.csv",
        "members.csv",
      ])
    )
    const clientsCsv = strFromU8(zip["clients.csv"]!)
    expect(clientsCsv.split("\r\n")[0]).toContain("workspace_id")
    expect(clientsCsv).toContain('"Quote ""Heavy"", Ltd"')
    expect(strFromU8(zip["invoice_lines.csv"]!)).toContain("12345")
    expect(strFromU8(zip["members.csv"]!)).toContain(ownerEmail)
    expect(strFromU8(zip["files.csv"]!)).not.toContain("key")

    // Delete: needs the slug; then everything is gone, users stay.
    expect(
      (await owner.post("/v1/workspace/delete", { confirmSlug: "nope" })).status
    ).toBe(400)
    expect(
      (await owner.post("/v1/workspace/delete", { confirmSlug: ws.slug }))
        .status
    ).toBe(204)
    expect((await owner.get("/v1/clients")).status).toBe(403)
    expect((await admin.get("/v1/clients")).status).toBe(403)
    const orgs = await owner.get("/api/auth/organization/list")
    expect(orgs.status).toBe(200) // the account itself stays
    expect(orgs.body.map((o: { id: string }) => o.id)).not.toContain(ws.id)
    const left = await t.db
      .select({ action: auditLogs.action, ws: auditLogs.workspaceId })
      .from(auditLogs)
      .where(eq(auditLogs.resourceId, ws.id))
    expect(left).toContainEqual({ action: "workspace.deleted", ws: null })
  })
})

describe("payment reminders", () => {
  it("emails each reminder once, follows pause and payment, and logs them on the invoice", async () => {
    const mail = t.app.get(MailService)
    const sent: any[] = []
    const spy = vi
      .spyOn(mail, "send")
      .mockImplementation(async (m) => void sent.push(m))
    try {
      const day = 86_400_000
      const owner = new Client(t)
      await owner.signUp("Reminding Owner")
      await owner.createWorkspace("Reminding Studio")
      expect(
        (
          await owner.patch("/v1/workspace", {
            timezone: "UTC",
            invoiceReminderOffsets: [5],
          })
        ).status
      ).toBe(422) // only offsets from the list
      const profile = (
        await owner.patch("/v1/workspace", {
          timezone: "UTC",
          invoiceReminderOffsets: [7, -3, 0, 0],
        })
      ).body
      expect(profile.invoiceReminderOffsets).toEqual([-3, 0, 7])

      const client = (
        await owner.post("/v1/clients", {
          name: "Slow Payer",
          email: "slow@payer.test",
        })
      ).body
      const today = new Date().toISOString().slice(0, 10)
      const due = new Date(Date.now() + 10 * day)
      const dueDate = due.toISOString().slice(0, 10)
      const invoice = (
        await owner.post("/v1/invoices", {
          clientId: client.id,
          issueDate: today,
          dueDate,
          lines: [{ description: "Work", quantity: 1, unitPrice: 50_000 }],
        })
      ).body
      await owner.post(`/v1/invoices/${invoice.id}/issue`)

      const reminders = t.app.get(InvoiceRemindersService)
      const at = (offset: number) =>
        new Date(Date.parse(`${dueDate}T12:00:00Z`) + offset * day)
      const mine = () => sent.filter((m) => m.to === "slow@payer.test")

      sent.length = 0
      await reminders.run(at(-4))
      expect(mine()).toHaveLength(0)
      await reminders.run(at(-3))
      await reminders.run(at(-3))
      expect(mine().map((m) => m.subject)).toEqual([
        expect.stringContaining("is due on"),
      ])
      expect(mine()[0].attachments).toBeUndefined()
      expect(mine()[0].text).toContain("/portal/")

      // Paused: nothing on the due date. Resumed: the due-day one goes out.
      expect(
        (
          await owner.put(`/v1/invoices/${invoice.id}/reminders`, {
            paused: true,
          })
        ).body.remindersPaused
      ).toBe(true)
      await reminders.run(at(0))
      expect(mine()).toHaveLength(1)
      await owner.put(`/v1/invoices/${invoice.id}/reminders`, { paused: false })
      await reminders.run(at(0))
      expect(mine().map((m) => m.subject)).toEqual([
        expect.stringContaining("is due on"),
        expect.stringContaining("is due today"),
      ])

      const detail = (await owner.get(`/v1/invoices/${invoice.id}`)).body
      expect(detail.reminders.map((r: any) => r.offsetDays)).toEqual([-3, 0])
      expect(detail.reminders[0].sentTo).toBe("slow@payer.test")

      // Paid in full: no overdue reminder.
      await owner.post(`/v1/invoices/${invoice.id}/payments`, {
        amount: 50_000,
      })
      await reminders.run(at(7))
      expect(mine()).toHaveLength(2)
    } finally {
      spy.mockRestore()
    }
  })
})

describe("account deletion", () => {
  it("refuses sole owners, removes a member's account but keeps their work", async () => {
    const owner = new Client(t)
    await owner.signUp("Staying Owner")
    const ws = await owner.createWorkspace("Kept Studio")
    await t.db
      .update(workspaceSubscriptions)
      .set({ planKey: "team" })
      .where(eq(workspaceSubscriptions.workspaceId, ws.id))

    // The sole owner can't delete their account yet.
    const check = (await owner.get("/v1/account/deletion-check")).body
    expect(check.soleOwnerOf.map((w: any) => w.id)).toEqual([ws.id])
    const refused = await owner.post("/api/auth/delete-user", {
      password: "integration-password-123",
    })
    expect(refused.status).toBe(400)
    expect(JSON.stringify(refused.body)).toContain("only owner")

    // A member with a running timer deletes their account.
    const leaver = new Client(t)
    const { email } = await leaver.signUp("Leaving Member")
    const memberRole = (await owner.get("/v1/roles")).body.find(
      (r: { slug: string }) => r.slug === "member"
    )
    const inv = (
      await owner.post("/v1/invitations", { email, roleId: memberRole.id })
    ).body
    await leaver.post("/api/auth/organization/accept-invitation", {
      invitationId: inv.id,
    })
    leaver.workspaceId = ws.id
    const timer = await leaver.post("/v1/time-entries/start", {
      description: "Last task",
    })
    expect(timer.status).toBe(201)
    expect(
      (await leaver.get("/v1/account/deletion-check")).body.soleOwnerOf
    ).toEqual([])
    expect(
      (
        await leaver.post("/api/auth/delete-user", {
          password: "wrong-password",
        })
      ).status
    ).toBe(400)
    const deleted = await leaver.post("/api/auth/delete-user", {
      password: "integration-password-123",
    })
    expect(deleted.status).toBe(200)

    leaver.forgetSessionCache()
    expect((await leaver.get("/v1/me")).status).toBe(401)
    const [gone] = await t.db
      .select({ id: userTable.id })
      .from(userTable)
      .where(eq(userTable.email, email))
    expect(gone).toBeUndefined()
    const members = (await owner.get("/v1/members")).body
    expect(JSON.stringify(members)).not.toContain(email)
    // Their time stays in the workspace, stopped, no longer tied to a member.
    const [kept] = await t.db
      .select({
        memberId: timeEntries.memberId,
        endedAt: timeEntries.endedAt,
      })
      .from(timeEntries)
      .where(eq(timeEntries.id, timer.body.id))
    expect(kept).toMatchObject({ memberId: null })
    expect(kept!.endedAt).not.toBeNull()
  })
})

describe("full export with PDFs", () => {
  it("queues for owners, builds a ZIP with every document PDF and emails a link", async () => {
    const mail = t.app.get(MailService)
    const sent: any[] = []
    const spy = vi
      .spyOn(mail, "send")
      .mockImplementation(async (m) => void sent.push(m))
    try {
      const owner = new Client(t)
      const { email: ownerEmail } = await owner.signUp("Exporting Owner")
      const ws = await owner.createWorkspace("Export Studio")
      const ownerId = (await owner.get("/v1/me")).body.user.id
      const client = (
        await owner.post("/v1/clients", {
          name: "Export Client",
          email: "export@client.test",
        })
      ).body
      const line = { description: "Work", quantity: 1, unitPrice: 20_000 }
      const invoice = (
        await owner.post("/v1/invoices", { clientId: client.id, lines: [line] })
      ).body
      await owner.post(`/v1/invoices/${invoice.id}/issue`)
      await owner.post(`/v1/invoices/${invoice.id}/payments`, {
        amount: 20_000,
      })
      await owner.post("/v1/invoices", { clientId: client.id, lines: [line] }) // draft: left out

      const queued = await owner.post("/v1/workspace/export/full")
      expect(queued.status).toBe(202)
      expect(queued.body).toEqual({ queued: true })

      sent.length = 0
      const cls = t.app.get(ClsService)
      const result = await cls.run(async () => {
        cls.set("workspaceId", ws.id)
        cls.set("userId", ownerId)
        return t.app
          .get(DataExportService)
          .build({ workspaceId: ws.id, userId: ownerId })
      })
      expect(result).toMatchObject({ documents: 2, errors: 0 }) // invoice + receipt

      const email = sent.find((m) => m.to === ownerEmail)
      expect(email.subject).toContain("export is ready")
      const url = /Download: (\S+)/.exec(email.text)![1]!
      const res = await fetch(url)
      expect(res.status).toBe(200)
      const zip = unzipSync(new Uint8Array(await res.arrayBuffer()))
      const names = Object.keys(zip)
      expect(names).toContain("invoices.csv")
      const pdfs = names.filter((n) => n.startsWith("pdfs/"))
      expect(pdfs).toHaveLength(2)
      expect(pdfs.some((n) => n.startsWith("pdfs/invoices/"))).toBe(true)
      expect(pdfs.some((n) => n.startsWith("pdfs/receipts/"))).toBe(true)
      expect(strFromU8(zip[pdfs[0]!]!.slice(0, 5))).toBe("%PDF-")
    } finally {
      spy.mockRestore()
    }
  })
})
