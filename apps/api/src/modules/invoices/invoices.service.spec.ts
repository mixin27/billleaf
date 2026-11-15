import { BadRequestException, ConflictException } from "@nestjs/common"
import { describe, expect, it, vi } from "vitest"

import type {
  InvoicesRepository,
  InvoiceWithRefs,
} from "./invoices.repository.js"
import { InvoicesService, toInvoiceSummary } from "./invoices.service.js"

const now = new Date("2026-11-15T00:00:00Z")
const invoice = (over: Partial<InvoiceWithRefs> = {}): InvoiceWithRefs => ({
  id: "i1",
  workspaceId: "w1",
  clientId: "c1",
  clientName: "Acme",
  quoteId: null,
  quoteNumber: null,
  recurringId: null,
  recurringPeriod: null,
  number: null,
  status: "draft",
  title: null,
  currency: "USD",
  issueDate: "2026-11-15",
  dueDate: null,
  notes: null,
  terms: null,
  subtotal: 10_000,
  taxTotal: 0,
  total: 10_000,
  amountPaid: 0,
  clientSnapshot: null,
  issuerSnapshot: null,
  issuedAt: null,
  voidedAt: null,
  voidReason: null,
  lastSentAt: null,
  lastSentTo: null,
  createdAt: now,
  updatedAt: now,
  ...over,
})

const client = {
  id: "c1",
  name: "Acme",
  email: "billing@acme.test",
  phone: null,
  taxId: null,
  currency: "EUR",
  paymentTermsDays: 30 as number | null,
  archivedAt: null as Date | null,
  addressLine1: null,
  addressLine2: null,
  city: null,
  state: null,
  postalCode: null,
  country: null,
}

function setup(
  opts: {
    existing?: InvoiceWithRefs
    lines?: number
    quote?: { status: string }
    alreadyConverted?: boolean
    contacts?: { email: string | null; isPrimary: boolean }[]
    clientEmail?: string | null
  } = {}
) {
  const tx = {}
  const repo = {
    database: { transaction: (fn: (t: unknown) => unknown) => fn(tx) },
    findById: vi.fn().mockResolvedValue(opts.existing ?? invoice()),
    findByQuote: vi
      .fn()
      .mockResolvedValue(
        opts.alreadyConverted ? invoice({ number: "INV-0001" }) : null
      ),
    lines: vi.fn().mockResolvedValue(
      Array.from({ length: opts.lines ?? 1 }, (_, i) => ({
        id: `l${i}`,
        position: i,
        description: "Work",
        quantity: 1,
        unitPrice: 10_000,
        taxRateBps: 0,
        amount: 10_000,
        taxAmount: 0,
      }))
    ),
    create: vi.fn().mockResolvedValue("i1"),
    update: vi.fn(),
    delete: vi.fn(),
    releaseTime: vi.fn(),
  } as unknown as InvoicesRepository
  const clients = {
    findById: vi.fn().mockResolvedValue({
      ...client,
      email: opts.clientEmail === undefined ? client.email : opts.clientEmail,
    }),
    listContacts: vi.fn().mockResolvedValue(opts.contacts ?? []),
  }
  const quotes = {
    get: vi.fn().mockResolvedValue({
      id: "q1",
      status: opts.quote?.status ?? "accepted",
      clientId: "c1",
      title: "Website",
      currency: "EUR",
      notes: null,
      terms: null,
      lines: [
        { description: "Design", quantity: 2, unitPrice: 5000, taxRateBps: 0 },
      ],
    }),
  }
  const profile = {
    logoImage: vi.fn().mockResolvedValue(null),
    get: vi.fn().mockResolvedValue({
      name: "Studio",
      legalName: null,
      email: "hello@studio.test",
      phone: null,
      taxId: null,
      addressLine1: null,
      addressLine2: null,
      city: null,
      state: null,
      postalCode: null,
      country: null,
      defaultCurrency: "SGD",
      timezone: "UTC",
      locale: "en-US",
      paymentTermsDays: 14,
      documentFooter: null,
      brandColor: null,
    }),
    documentBranding: vi
      .fn()
      .mockResolvedValue({ brandColor: null, logo: null, footer: null }),
  }
  const numbering = { next: vi.fn().mockResolvedValue("INV-0001") }
  const mail = { send: vi.fn() }
  const audit = { record: vi.fn() }
  const service = new InvoicesService(
    repo,
    clients as never,
    quotes as never,
    profile as never,
    numbering as never,
    mail as never,
    { documentLink: vi.fn().mockResolvedValue("http://portal.test") } as never,
    audit as never,
    { assertWithinLimit: vi.fn() } as never,
    { invoicesPerMonth: vi.fn().mockResolvedValue(0) } as never
  )
  return { service, repo, numbering, mail, tx }
}

describe("InvoicesService", () => {
  it("defaults currency and due date from the client's terms", async () => {
    const { service, repo } = setup()
    await service.create({ clientId: "c1", issueDate: "2026-11-15" })
    expect(
      (repo.create as ReturnType<typeof vi.fn>).mock.calls[0]![0]
    ).toMatchObject({
      currency: "EUR",
      dueDate: "2026-12-15",
    })
  })

  it("converts only accepted quotes, once", async () => {
    const { service, repo } = setup()
    await service.createFromQuote("q1")
    const [values, lines] = (repo.create as ReturnType<typeof vi.fn>).mock
      .calls[0]!
    expect(values).toMatchObject({
      quoteId: "q1",
      currency: "EUR",
      total: 10_000,
    })
    expect(lines).toHaveLength(1)

    await expect(
      setup({ quote: { status: "sent" } }).service.createFromQuote("q1")
    ).rejects.toBeInstanceOf(ConflictException)
    await expect(
      setup({ alreadyConverted: true }).service.createFromQuote("q1")
    ).rejects.toThrow("Already converted to INV-0001")
  })

  it("issues: number in the transaction, due date filled, snapshots frozen", async () => {
    const { service, repo, numbering, tx } = setup()
    await service.issue("i1")
    expect(numbering.next).toHaveBeenCalledWith(tx, "invoice")
    expect(
      (repo.update as ReturnType<typeof vi.fn>).mock.calls[0]![2]
    ).toMatchObject({
      number: "INV-0001",
      status: "issued",
      dueDate: "2026-12-15",
      clientSnapshot: { name: "Acme", email: "billing@acme.test" },
      issuerSnapshot: { name: "Studio" },
    })
  })

  it("refuses to issue empty or zero invoices, or issue twice", async () => {
    await expect(
      setup({ lines: 0 }).service.issue("i1")
    ).rejects.toBeInstanceOf(BadRequestException)
    await expect(
      setup({ existing: invoice({ total: 0 }) }).service.issue("i1")
    ).rejects.toBeInstanceOf(BadRequestException)
    await expect(
      setup({ existing: invoice({ status: "issued" }) }).service.issue("i1")
    ).rejects.toBeInstanceOf(ConflictException)
  })

  it("only edits drafts and never deletes issued invoices", async () => {
    const issued = invoice({ status: "issued", number: "INV-0001" })
    await expect(
      setup({ existing: issued }).service.update("i1", { title: "x" })
    ).rejects.toBeInstanceOf(ConflictException)
    await expect(
      setup({ existing: issued }).service.remove("i1")
    ).rejects.toBeInstanceOf(ConflictException)
  })

  it("voids issued invoices without payments", async () => {
    const { service, repo } = setup({ existing: invoice({ status: "issued" }) })
    await service.void("i1", "Wrong client")
    expect(
      (repo.update as ReturnType<typeof vi.fn>).mock.calls[0]![2]
    ).toMatchObject({
      status: "void",
      voidReason: "Wrong client",
    })
    await expect(
      setup({
        existing: invoice({ status: "issued", amountPaid: 1 }),
      }).service.void("i1", "x x x")
    ).rejects.toThrow("Refund them before voiding")
    await expect(setup().service.void("i1", "draft!")).rejects.toBeInstanceOf(
      ConflictException
    )
  })

  it("sends to the primary contact, falls back to client email, else asks for a recipient", async () => {
    const issued = invoice({
      status: "issued",
      number: "INV-0001",
      dueDate: "2026-12-15",
    })
    const a = setup({
      existing: issued,
      contacts: [{ email: "ap@acme.test", isPrimary: true }],
    })
    await a.service.send("i1", {})
    const msg = a.mail.send.mock.calls[0]![0]
    expect(msg).toMatchObject({
      to: "ap@acme.test",
      subject: "Invoice INV-0001 from Studio",
      replyTo: "hello@studio.test",
    })
    expect(msg.attachments[0]).toMatchObject({
      filename: "INV-0001.pdf",
      contentType: "application/pdf",
    })
    expect(
      Buffer.from(msg.attachments[0].contentBase64, "base64")
        .subarray(0, 4)
        .toString()
    ).toBe("%PDF")

    const b = setup({ existing: issued })
    await b.service.send("i1", {})
    expect(b.mail.send.mock.calls[0]![0].to).toBe("billing@acme.test")

    await expect(
      setup({ existing: issued, clientEmail: null }).service.send("i1", {})
    ).rejects.toThrow("no email address")
    await expect(setup().service.send("i1", {})).rejects.toThrow(
      "Issue the invoice"
    )
  })

  it("summarises payment state", () => {
    const s = toInvoiceSummary(
      invoice({ status: "issued", dueDate: "2026-11-01", amountPaid: 2_500 }),
      "2026-11-15"
    )
    expect(s).toMatchObject({
      displayStatus: "overdue",
      paymentStatus: "partially_paid",
      amountDue: 7_500,
    })
  })
})
