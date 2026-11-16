import { BadRequestException, ConflictException } from "@nestjs/common"
import { describe, expect, it, vi } from "vitest"

import type { AuditService } from "../../iam/audit/audit.service.js"
import type { ClientsRepository } from "../clients/clients.repository.js"
import type { DocumentNumberingService } from "../documents/document-numbering.service.js"
import type { WorkspaceProfileService } from "../workspace/workspace-profile.service.js"
import type { QuotesRepository, QuoteWithClient } from "./quotes.repository.js"
import { QuotesService, toQuoteSummary } from "./quotes.service.js"

const now = new Date("2026-11-15T00:00:00Z")
const quote = (over: Partial<QuoteWithClient> = {}): QuoteWithClient => ({
  id: "q1",
  workspaceId: "w1",
  clientId: "c1",
  clientName: "Acme",
  number: null,
  status: "draft",
  title: null,
  currency: "USD",
  issueDate: "2026-11-15",
  validUntil: "2026-12-15",
  notes: null,
  terms: null,
  subtotal: 0,
  taxTotal: 0,
  total: 0,
  clientSnapshot: null,
  issuerSnapshot: null,
  respondedByName: null,
  respondedVia: null,
  declineReason: null,
  sentAt: null,
  acceptedAt: null,
  declinedAt: null,
  createdAt: now,
  updatedAt: now,
  ...over,
})

const client = {
  id: "c1",
  name: "Acme",
  currency: null as string | null,
  archivedAt: null as Date | null,
  email: "a@acme.test",
  phone: null,
  taxId: null,
  addressLine1: "1 Main St",
  addressLine2: null,
  city: "Singapore",
  state: null,
  postalCode: "018956",
  country: "SG",
}

function setup(
  opts: {
    existing?: QuoteWithClient
    lines?: number
    clientArchived?: boolean
  } = {}
) {
  const tx = {}
  const repo = {
    database: { transaction: (fn: (t: unknown) => unknown) => fn(tx) },
    findById: vi.fn().mockResolvedValue(opts.existing ?? quote()),
    lines: vi.fn().mockResolvedValue(
      Array.from({ length: opts.lines ?? 1 }, (_, i) => ({
        id: `l${i}`,
        position: i,
        description: "Work",
        quantity: 1,
        unitPrice: 1000,
        taxRateBps: 0,
        amount: 1000,
        taxAmount: 0,
      }))
    ),
    create: vi.fn().mockResolvedValue("q1"),
    update: vi.fn(),
    delete: vi.fn(),
  } as unknown as QuotesRepository
  const clients = {
    findById: vi.fn().mockResolvedValue({
      ...client,
      archivedAt: opts.clientArchived ? now : null,
    }),
  } as unknown as ClientsRepository
  const profile = {
    logoImage: vi.fn().mockResolvedValue(null),
    get: vi.fn().mockResolvedValue({
      name: "Studio",
      legalName: "Studio LLC",
      email: null,
      phone: null,
      taxId: "T1",
      addressLine1: null,
      addressLine2: null,
      city: null,
      state: null,
      postalCode: null,
      country: "SG",
      defaultCurrency: "SGD",
      timezone: "Asia/Singapore",
    }),
  } as unknown as WorkspaceProfileService
  const numbering = {
    next: vi.fn().mockResolvedValue("QUO-0001"),
  } as unknown as DocumentNumberingService
  const audit = { record: vi.fn() } as unknown as AuditService
  const mail = { send: vi.fn() } as never
  const service = new QuotesService(
    repo,
    clients,
    profile,
    numbering,
    audit,
    mail,
    { documentLink: vi.fn().mockResolvedValue("http://portal.test") } as never,
    { emit: vi.fn() } as never
  )
  return { service, repo, numbering, tx }
}

describe("QuotesService", () => {
  it("creates drafts with computed totals and workspace currency fallback", async () => {
    const { service, repo } = setup()
    await service.create({
      clientId: "c1",
      issueDate: "2026-11-15",
      lines: [
        {
          description: "Design",
          quantity: 2,
          unitPrice: 5000,
          taxRateBps: 900,
        },
        { description: "Hosting", quantity: 1, unitPrice: 1999, taxRateBps: 0 },
      ],
    })
    const [values, lines] = (repo.create as ReturnType<typeof vi.fn>).mock
      .calls[0]!
    expect(values).toMatchObject({
      currency: "SGD",
      validUntil: "2026-12-15",
      subtotal: 11999,
      taxTotal: 900,
      total: 12899,
    })
    expect(lines.map((l: { position: number }) => l.position)).toEqual([0, 1])
  })

  it("refuses to quote archived clients", async () => {
    const { service } = setup({ clientArchived: true })
    await expect(service.create({ clientId: "c1" })).rejects.toBeInstanceOf(
      BadRequestException
    )
  })

  it("only edits drafts", async () => {
    const { service } = setup({
      existing: quote({ status: "sent", number: "QUO-0001" }),
    })
    await expect(service.update("q1", { title: "x" })).rejects.toBeInstanceOf(
      ConflictException
    )
  })

  it("sends: assigns the number in the transaction and freezes snapshots", async () => {
    const { service, repo, numbering, tx } = setup()
    await service.send("q1")
    expect(numbering.next).toHaveBeenCalledWith(tx, "quote")
    const update = (repo.update as ReturnType<typeof vi.fn>).mock.calls[0]!
    expect(update[0]).toBe(tx)
    expect(update[2]).toMatchObject({
      number: "QUO-0001",
      status: "sent",
      clientSnapshot: {
        name: "Acme",
        addressLines: ["1 Main St", "Singapore 018956", "SG"],
      },
      issuerSnapshot: { name: "Studio", legalName: "Studio LLC", taxId: "T1" },
    })
  })

  it("will not send an empty quote or send twice", async () => {
    await expect(setup({ lines: 0 }).service.send("q1")).rejects.toBeInstanceOf(
      BadRequestException
    )
    await expect(
      setup({ existing: quote({ status: "sent" }) }).service.send("q1")
    ).rejects.toBeInstanceOf(ConflictException)
  })

  it("accepts/declines only sent quotes", async () => {
    await expect(
      setup().service.respond("q1", "accepted")
    ).rejects.toBeInstanceOf(ConflictException)
    const { service, repo } = setup({ existing: quote({ status: "sent" }) })
    await service.respond("q1", "declined")
    expect(
      (repo.update as ReturnType<typeof vi.fn>).mock.calls[0]![2]
    ).toMatchObject({
      status: "declined",
    })
  })

  it("never deletes sent quotes", async () => {
    const { service, repo } = setup({ existing: quote({ status: "accepted" }) })
    await expect(service.remove("q1")).rejects.toBeInstanceOf(ConflictException)
    expect(repo.delete).not.toHaveBeenCalled()
  })

  it("flags sent quotes past validUntil as expired", () => {
    const sent = quote({ status: "sent", validUntil: "2026-11-01" })
    expect(toQuoteSummary(sent, "2026-11-15").isExpired).toBe(true)
    expect(
      toQuoteSummary({ ...sent, status: "accepted" }, "2026-11-15").isExpired
    ).toBe(false)
  })
})
