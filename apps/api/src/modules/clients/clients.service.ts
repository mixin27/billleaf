import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common"
import type {
  Client,
  ClientContact,
  ClientDetail,
  ClientList,
} from "@workspace/contracts"

import { type PageArgs } from "../../common/pagination.js"
import { EntitlementsService } from "../../billing/entitlements.service.js"
import { AuditService } from "../../iam/audit/audit.service.js"
import {
  type ClientRow,
  ClientsRepository,
  type ClientValues,
  type ContactRow,
  type ContactValues,
} from "./clients.repository.js"
import { WebhooksService } from "../webhooks/webhooks.service.js"

export function toClientDto(r: ClientRow): Client {
  return {
    id: r.id,
    workspaceId: r.workspaceId,
    type: r.type,
    name: r.name,
    email: r.email,
    phone: r.phone,
    website: r.website,
    taxId: r.taxId,
    addressLine1: r.addressLine1,
    addressLine2: r.addressLine2,
    city: r.city,
    state: r.state,
    postalCode: r.postalCode,
    country: r.country,
    currency: r.currency,
    paymentTermsDays: r.paymentTermsDays,
    notes: r.notes,
    status: r.archivedAt ? "archived" : "active",
    archivedAt: r.archivedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }
}

export function toContactDto(r: ContactRow): ClientContact {
  return {
    id: r.id,
    clientId: r.clientId,
    name: r.name,
    email: r.email,
    phone: r.phone,
    title: r.title,
    isPrimary: r.isPrimary,
    createdAt: r.createdAt.toISOString(),
  }
}

/**
 * Clients business rules. Inputs arrive already validated/normalised by the
 * Zod pipe (schemas in @workspace/contracts).
 */
@Injectable()
export class ClientsService {
  constructor(
    private readonly repo: ClientsRepository,
    private readonly entitlements: EntitlementsService,
    private readonly audit: AuditService,
    private readonly webhooks: WebhooksService
  ) {}

  async list(
    query: PageArgs & { q?: string; status: "active" | "archived" }
  ): Promise<ClientList> {
    const { items, total } = await this.repo.list(query)
    return {
      items: items.map(toClientDto),
      total,
      page: query.page,
      pageSize: query.pageSize,
    }
  }

  async get(id: string): Promise<ClientDetail> {
    const client = await this.require(id)
    const contacts = await this.repo.listContacts(id)
    return { ...toClientDto(client), contacts: contacts.map(toContactDto) }
  }

  async create(input: ClientValues): Promise<Client> {
    await this.entitlements.assertWithinLimit(
      "clients",
      await this.repo.countActive()
    )
    const row = await this.repo.create(input)
    await this.audit.record("client.created", {
      resourceType: "client",
      resourceId: row.id,
    })
    const client = toClientDto(row)
    await this.webhooks.emit("client.created", client)
    return client
  }

  async update(id: string, input: Partial<ClientValues>): Promise<Client> {
    await this.require(id)
    const row = await this.repo.update(id, input)
    if (!row) throw new NotFoundException("Client not found")
    return toClientDto(row)
  }

  async archive(id: string): Promise<Client> {
    const client = await this.require(id)
    if (client.archivedAt) return toClientDto(client)
    const row = await this.repo.update(id, { archivedAt: new Date() })
    await this.audit.record("client.archived", {
      resourceType: "client",
      resourceId: id,
    })
    return toClientDto(row!)
  }

  async restore(id: string): Promise<Client> {
    const client = await this.require(id)
    if (!client.archivedAt) return toClientDto(client)
    await this.entitlements.assertWithinLimit(
      "clients",
      await this.repo.countActive()
    )
    const row = await this.repo.update(id, { archivedAt: null })
    await this.audit.record("client.restored", {
      resourceType: "client",
      resourceId: id,
    })
    return toClientDto(row!)
  }

  /** Soft delete. Clients with quotes/invoices must be archived instead. */
  async remove(id: string): Promise<void> {
    await this.require(id)
    if (await this.repo.hasDocuments(id)) {
      throw new ConflictException({
        message: "This client has quotes or invoices. Archive it instead.",
        code: "client_has_documents",
      })
    }
    await this.repo.update(id, { deletedAt: new Date() })
    await this.audit.record("client.deleted", {
      resourceType: "client",
      resourceId: id,
    })
  }

  // ── contacts ────────────────────────────────────────────────────────────

  async addContact(
    clientId: string,
    input: ContactValues
  ): Promise<ClientContact> {
    const client = await this.require(clientId)
    if (client.archivedAt)
      throw new BadRequestException("Restore the client to edit contacts")
    return toContactDto(await this.repo.createContact(clientId, input))
  }

  async updateContact(
    clientId: string,
    contactId: string,
    input: Partial<ContactValues>
  ): Promise<ClientContact> {
    await this.require(clientId)
    const row = await this.repo.updateContact(clientId, contactId, input)
    if (!row) throw new NotFoundException("Contact not found")
    return toContactDto(row)
  }

  async removeContact(clientId: string, contactId: string): Promise<void> {
    await this.require(clientId)
    if (!(await this.repo.deleteContact(clientId, contactId))) {
      throw new NotFoundException("Contact not found")
    }
  }

  private async require(id: string): Promise<ClientRow> {
    const client = await this.repo.findById(id)
    if (!client) throw new NotFoundException("Client not found")
    return client
  }
}
