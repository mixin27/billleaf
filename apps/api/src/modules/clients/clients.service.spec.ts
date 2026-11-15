import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common"
import { describe, expect, it, vi } from "vitest"

import type { EntitlementsService } from "../../billing/entitlements.service.js"
import type { AuditService } from "../../iam/audit/audit.service.js"
import type { ClientRow, ClientsRepository } from "./clients.repository.js"
import { ClientsService } from "./clients.service.js"

const now = new Date("2026-11-15T00:00:00Z")
const row = (over: Partial<ClientRow> = {}): ClientRow => ({
  id: "c1",
  workspaceId: "w1",
  type: "company",
  name: "Acme",
  email: null,
  phone: null,
  website: null,
  taxId: null,
  addressLine1: null,
  addressLine2: null,
  city: null,
  state: null,
  postalCode: null,
  country: null,
  currency: null,
  paymentTermsDays: null,
  notes: null,
  archivedAt: null,
  createdAt: now,
  updatedAt: now,
  deletedAt: null,
  ...over,
})

function setup(
  opts: {
    existing?: ClientRow | null
    active?: number
    limitHit?: boolean
  } = {}
) {
  const repo = {
    findById: vi
      .fn()
      .mockResolvedValue(opts.existing === undefined ? row() : opts.existing),
    countActive: vi.fn().mockResolvedValue(opts.active ?? 0),
    create: vi.fn().mockImplementation(async (v) => row(v)),
    update: vi.fn().mockImplementation(async (_id, v) => row(v)),
    listContacts: vi.fn().mockResolvedValue([]),
    createContact: vi.fn(),
    deleteContact: vi.fn().mockResolvedValue(false),
  } as unknown as ClientsRepository
  const entitlements = {
    assertWithinLimit: vi.fn().mockImplementation(async () => {
      if (opts.limitHit)
        throw new ForbiddenException("Plan limit reached for clients")
    }),
  } as unknown as EntitlementsService
  const audit = { record: vi.fn() } as unknown as AuditService
  return {
    service: new ClientsService(repo, entitlements, audit),
    repo,
    entitlements,
    audit,
  }
}

describe("ClientsService", () => {
  it("creates a client after checking the plan limit", async () => {
    const { service, entitlements, audit } = setup({ active: 3 })
    const client = await service.create({ type: "company", name: "Acme" })
    expect(entitlements.assertWithinLimit).toHaveBeenCalledWith("clients", 3)
    expect(client.status).toBe("active")
    expect(audit.record).toHaveBeenCalledWith(
      "client.created",
      expect.anything()
    )
  })

  it("refuses to create beyond the plan limit", async () => {
    const { service, repo } = setup({ limitHit: true })
    await expect(
      service.create({ type: "company", name: "X" })
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(repo.create).not.toHaveBeenCalled()
  })

  it("404s for clients outside the workspace or deleted", async () => {
    const { service } = setup({ existing: null })
    await expect(service.get("c1")).rejects.toBeInstanceOf(NotFoundException)
    await expect(service.update("c1", { name: "Y" })).rejects.toBeInstanceOf(
      NotFoundException
    )
  })

  it("archives and restores, re-checking the limit on restore", async () => {
    const archived = row({ archivedAt: now })
    const { service, entitlements } = setup({ existing: archived, active: 1 })
    const restored = await service.restore("c1")
    expect(entitlements.assertWithinLimit).toHaveBeenCalledWith("clients", 1)
    expect(restored.status).toBe("active")

    const a = setup()
    expect((await a.service.archive("c1")).status).toBe("archived")
  })

  it("soft-deletes instead of removing rows", async () => {
    const { service, repo } = setup()
    await service.remove("c1")
    expect(repo.update).toHaveBeenCalledWith("c1", {
      deletedAt: expect.any(Date),
    })
  })

  it("blocks contact edits on archived clients", async () => {
    const { service } = setup({ existing: row({ archivedAt: now }) })
    await expect(
      service.addContact("c1", { name: "Jane", isPrimary: false })
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it("404s when deleting an unknown contact", async () => {
    const { service } = setup()
    await expect(service.removeContact("c1", "x")).rejects.toBeInstanceOf(
      NotFoundException
    )
  })
})
