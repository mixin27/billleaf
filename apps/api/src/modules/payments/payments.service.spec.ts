import { BadRequestException, ConflictException } from "@nestjs/common"
import { describe, expect, it, vi } from "vitest"

import { PaymentsService } from "./payments.service.js"

const now = new Date("2026-11-15T00:00:00Z")
const invoice = (over: Record<string, unknown> = {}) => ({
  id: "i1",
  status: "issued",
  number: "INV-0001",
  clientId: "c1",
  clientName: "Acme",
  currency: "USD",
  total: 10_000,
  amountPaid: 0,
  clientSnapshot: { name: "Acme", addressLines: [] },
  issuerSnapshot: { name: "Studio", addressLines: [] },
  ...over,
})
const payment = (over: Record<string, unknown> = {}) => ({
  id: "p1",
  invoiceId: "i1",
  invoiceNumber: "INV-0001",
  clientId: "c1",
  clientName: "Acme",
  amount: 4_000,
  currency: "USD",
  paidOn: "2026-11-15",
  method: "bank_transfer",
  reference: null,
  notes: null,
  status: "completed",
  refundedAt: null,
  refundReason: null,
  createdAt: now,
  receipt: {
    id: "r1",
    number: "RCT-0001",
    lastSentAt: null,
    voidedAt: null,
    clientSnapshot: { name: "Acme", addressLines: [] },
    issuerSnapshot: { name: "Studio", addressLines: [] },
  },
  ...over,
})

function setup(
  opts: {
    invoice?: ReturnType<typeof invoice>
    payment?: ReturnType<typeof payment>
  } = {}
) {
  const tx = {}
  const repo = {
    database: { transaction: (fn: (t: unknown) => unknown) => fn(tx) },
    insertPayment: vi.fn().mockResolvedValue({ id: "p1" }),
    insertReceipt: vi.fn(),
    updatePayment: vi.fn(),
    updateReceipt: vi.fn(),
    findById: vi.fn().mockResolvedValue(opts.payment ?? payment()),
  }
  const invoices = {
    findById: vi.fn().mockResolvedValue(opts.invoice ?? invoice()),
    update: vi.fn(),
  }
  const clients = {
    findById: vi.fn().mockResolvedValue({ name: "Acme" }),
    listContacts: vi.fn().mockResolvedValue([]),
  }
  const profile = {
    get: vi
      .fn()
      .mockResolvedValue({ timezone: "UTC", locale: "en-US", name: "Studio" }),
  }
  const numbering = { next: vi.fn().mockResolvedValue("RCT-0001") }
  const ctx = { userId: "u1" }
  const service = new PaymentsService(
    repo as never,
    invoices as never,
    clients as never,
    profile as never,
    numbering as never,
    ctx as never,
    { send: vi.fn() } as never,
    { documentLink: vi.fn().mockResolvedValue("http://portal.test") } as never,
    { record: vi.fn() } as never,
    { get: vi.fn().mockResolvedValue({ amountDue: 0 }) } as never,
    { emit: vi.fn() } as never
  )
  return { service, repo, invoices, numbering, tx }
}

describe("PaymentsService", () => {
  it("records a payment, bumps amountPaid and issues a numbered receipt in one transaction", async () => {
    const { service, repo, invoices, numbering, tx } = setup({
      invoice: invoice({ amountPaid: 2_000 }),
    })
    await service.record("i1", { amount: 3_000, method: "card" })
    expect(invoices.findById).toHaveBeenCalledWith("i1", tx, {
      forUpdate: true,
    })
    expect(repo.insertPayment.mock.calls[0]![1]).toMatchObject({
      amount: 3_000,
      currency: "USD",
      method: "card",
      paidOn: expect.any(String),
    })
    expect(invoices.update).toHaveBeenCalledWith(tx, "i1", {
      amountPaid: 5_000,
    })
    expect(numbering.next).toHaveBeenCalledWith(tx, "receipt")
    expect(repo.insertReceipt.mock.calls[0]![1]).toMatchObject({
      paymentId: "p1",
      number: "RCT-0001",
      balanceAfter: 5_000,
    })
  })

  it("rejects overpayment, payments on drafts/void, and paid invoices", async () => {
    await expect(
      setup({ invoice: invoice({ amountPaid: 9_000 }) }).service.record("i1", {
        amount: 1_001,
      })
    ).rejects.toBeInstanceOf(BadRequestException)
    await expect(
      setup({ invoice: invoice({ status: "draft" }) }).service.record("i1", {
        amount: 1,
      })
    ).rejects.toBeInstanceOf(ConflictException)
    await expect(
      setup({ invoice: invoice({ status: "void" }) }).service.record("i1", {
        amount: 1,
      })
    ).rejects.toBeInstanceOf(ConflictException)
    await expect(
      setup({ invoice: invoice({ amountPaid: 10_000 }) }).service.record("i1", {
        amount: 1,
      })
    ).rejects.toThrow("already paid")
  })

  it("refunds: marks refunded, reduces amountPaid, voids the receipt", async () => {
    const { service, repo, invoices, tx } = setup({
      invoice: invoice({ amountPaid: 4_000 }),
    })
    await service.refund("p1", "Duplicate transfer")
    expect(repo.updatePayment).toHaveBeenCalledWith(
      tx,
      "p1",
      expect.objectContaining({
        status: "refunded",
        refundReason: "Duplicate transfer",
      })
    )
    expect(invoices.update).toHaveBeenCalledWith(tx, "i1", { amountPaid: 0 })
    expect(repo.updateReceipt).toHaveBeenCalledWith(tx, "r1", {
      voidedAt: expect.any(Date),
    })
  })

  it("never refunds twice", async () => {
    const { service } = setup({ payment: payment({ status: "refunded" }) })
    await expect(service.refund("p1", "again")).rejects.toBeInstanceOf(
      ConflictException
    )
  })
})
