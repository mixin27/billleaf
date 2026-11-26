import { describe, expect, it, vi } from "vitest"

import type { RecurringRow } from "./recurring.repository.js"
import { isFinished, RecurringService } from "./recurring.service.js"

const now = new Date("2026-11-15T00:00:00Z")
const schedule = (over: Partial<RecurringRow> = {}): RecurringRow => ({
  id: "r1",
  workspaceId: "w1",
  clientId: "c1",
  clientName: "Acme",
  title: null,
  currency: "USD",
  discountType: null,
  discountValue: null,
  lines: [
    { description: "Retainer", quantity: 1, unitPrice: 1000, taxRateBps: 0 },
  ],
  every: 1,
  unit: "month",
  startDate: "2026-09-30",
  anchorDay: 30,
  endDate: null,
  maxOccurrences: null,
  nextRunDate: "2026-09-30",
  dueDays: null,
  mode: "draft",
  status: "active",
  notes: null,
  terms: null,
  generatedCount: 0,
  lastRunAt: null,
  lastError: null,
  createdAt: now,
  updatedAt: now,
  ...over,
})

function setup(
  opts: {
    row?: RecurringRow
    createFails?: unknown
    sendFails?: boolean
    feature?: boolean
  } = {}
) {
  let row = opts.row ?? schedule()
  const repo = {
    findById: vi.fn(async () => row),
    update: vi.fn(async (_id: string, v: Partial<RecurringRow>) => {
      row = { ...row, ...v }
    }),
    advance: vi.fn(
      async (_id: string, from: string, v: Partial<RecurringRow>) => {
        if (row.nextRunDate !== from) return false
        row = { ...row, ...v }
        return true
      }
    ),
  }
  const invoices = {
    create: vi.fn(async () => {
      if (opts.createFails) throw opts.createFails
      return { id: "inv-new" }
    }),
    get: vi.fn(async () => ({
      id: "inv",
      status: "draft",
      number: null,
      lastSentAt: null,
    })),
    issue: vi.fn(async () => ({
      id: "inv",
      status: "issued",
      number: "INV-0001",
      lastSentAt: null,
    })),
    send: vi.fn(async () => {
      if (opts.sendFails) throw new Error("Client has no email")
    }),
  }
  const invoicesRepo = {
    findByRecurringPeriod: vi.fn(async () => ({ id: "inv-existing" })),
  }
  const profile = { get: vi.fn(async () => ({ timezone: "UTC" })) }
  const entitlements = { hasFeature: vi.fn(async () => opts.feature ?? true) }
  const audit = { record: vi.fn() }
  const svc = new RecurringService(
    repo as never,
    invoices as never,
    invoicesRepo as never,
    {} as never,
    profile as never,
    entitlements as never,
    audit as never
  )
  return { svc, repo, invoices, invoicesRepo, row: () => row }
}

describe("isFinished", () => {
  it("ends on occurrence count or when the next date passes the end date", () => {
    expect(
      isFinished({ endDate: null, maxOccurrences: 3 }, 3, "2027-01-01")
    ).toBe(true)
    expect(
      isFinished({ endDate: null, maxOccurrences: 3 }, 2, "2027-01-01")
    ).toBe(false)
    expect(
      isFinished(
        { endDate: "2026-12-31", maxOccurrences: null },
        9,
        "2027-01-01"
      )
    ).toBe(true)
    expect(
      isFinished(
        { endDate: "2026-12-31", maxOccurrences: null },
        9,
        "2026-12-31"
      )
    ).toBe(false)
  })
})

describe("RecurringService.generateDue", () => {
  it("catches up every due period, month-end safe, and stops at the future", async () => {
    vi.useFakeTimers({ now })
    const { svc, invoices, row } = setup()
    expect(await svc.generateDue("r1")).toBe(2) // Sep 30, Oct 30 (anchor 30); Nov 30 is future
    expect(invoices.create).toHaveBeenCalledTimes(2)
    expect(row()).toMatchObject({
      nextRunDate: "2026-11-30",
      generatedCount: 2,
      status: "active",
    })
    vi.useRealTimers()
  })

  it("reuses the existing invoice when the period was already generated (retry after crash)", async () => {
    vi.useFakeTimers({ now })
    const dup = Object.assign(new Error("duplicate"), {
      cause: { code: "23505" },
    })
    const { svc, invoicesRepo, row } = setup({
      row: schedule({
        nextRunDate: "2026-11-15",
        anchorDay: 15,
        maxOccurrences: 1,
      }),
      createFails: dup,
    })
    expect(await svc.generateDue("r1")).toBe(1)
    expect(invoicesRepo.findByRecurringPeriod).toHaveBeenCalledWith(
      "r1",
      "2026-11-15"
    )
    expect(row()).toMatchObject({ status: "ended", nextRunDate: null })
    vi.useRealTimers()
  })

  it("issues and sends in send mode; a send failure is recorded but the period still advances", async () => {
    vi.useFakeTimers({ now })
    const { svc, invoices, row } = setup({
      row: schedule({ nextRunDate: "2026-11-15", anchorDay: 15, mode: "send" }),
      sendFails: true,
    })
    expect(await svc.generateDue("r1")).toBe(1)
    expect(invoices.issue).toHaveBeenCalledOnce()
    expect(row().lastError).toMatch(/not sent/)
    expect(row().nextRunDate).toBe("2026-12-15")
    vi.useRealTimers()
  })

  it("pauses when the plan no longer includes the feature", async () => {
    vi.useFakeTimers({ now })
    const { svc, invoices, row } = setup({ feature: false })
    expect(await svc.generateDue("r1")).toBe(0)
    expect(invoices.create).not.toHaveBeenCalled()
    expect(row().status).toBe("paused")
    vi.useRealTimers()
  })

  it("rethrows unexpected failures after recording them", async () => {
    vi.useFakeTimers({ now })
    const { svc, row } = setup({ createFails: new Error("db down") })
    await expect(svc.generateDue("r1")).rejects.toThrow("db down")
    expect(row()).toMatchObject({
      lastError: "db down",
      nextRunDate: "2026-09-30",
    })
    vi.useRealTimers()
  })
})
