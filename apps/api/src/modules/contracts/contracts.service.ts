import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common"
import {
  type Contract,
  type ContractList,
  type ContractStatus,
  type ContractSummary,
  type ContractTemplate,
  type CreateContractInput,
  type CreateContractTemplateInput,
  formatMoney,
  type MergeValues,
  type PartySnapshot,
  renderMergeFields,
  type SignContractInput,
  unresolvedFields,
  type UpdateContractInput,
  type UpdateContractTemplateInput,
} from "@workspace/contracts"
import { documentEmail } from "@workspace/emails"

import { type PageArgs } from "../../common/pagination.js"
import { AuditService } from "../../iam/audit/audit.service.js"
import { MailService } from "../../mail/mail.service.js"
import { ClientsRepository } from "../clients/clients.repository.js"
import { renderContractPdf } from "../documents/contract-pdf.js"
import { DocumentNumberingService } from "../documents/document-numbering.service.js"
import {
  formatDocDate,
  partySnapshot,
  todayIn,
} from "../documents/party-snapshot.js"
import { WorkspaceProfileService } from "../workspace/workspace-profile.service.js"
import {
  type ContractRow,
  ContractsRepository,
  type TemplateRow,
} from "./contracts.repository.js"

export function toContractSummary(c: ContractRow): ContractSummary {
  return {
    id: c.id,
    number: c.number,
    status: c.status,
    title: c.title,
    clientId: c.clientId,
    clientName: c.clientName,
    effectiveDate: c.effectiveDate,
    endDate: c.endDate,
    sentAt: c.sentAt?.toISOString() ?? null,
    signedAt: c.signedAt,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  }
}

const toTemplate = (t: TemplateRow): ContractTemplate => ({
  id: t.id,
  name: t.name,
  body: t.body,
  createdAt: t.createdAt.toISOString(),
  updatedAt: t.updatedAt.toISOString(),
})

const oneLine = (p: PartySnapshot) => p.addressLines.join(", ") || null

/**
 * Contracts: draft → sent → signed | declined, and sent/signed → void.
 * Sending assigns CON-#### and freezes the merge-resolved text and both
 * parties; signatures are recorded manually until e-sign lands.
 */
@Injectable()
export class ContractsService {
  constructor(
    private readonly repo: ContractsRepository,
    private readonly clients: ClientsRepository,
    private readonly profile: WorkspaceProfileService,
    private readonly numbering: DocumentNumberingService,
    private readonly audit: AuditService,
    private readonly mail: MailService
  ) {}

  // ── Templates ──────────────────────────────────────────────────────────

  async listTemplates(): Promise<ContractTemplate[]> {
    return (await this.repo.listTemplates()).map(toTemplate)
  }

  async getTemplate(id: string): Promise<ContractTemplate> {
    return toTemplate(await this.requireTemplate(id))
  }

  async createTemplate(input: CreateContractTemplateInput) {
    const id = await this.repo.createTemplate({
      name: input.name,
      body: input.body,
    })
    return this.getTemplate(id)
  }

  async updateTemplate(id: string, input: UpdateContractTemplateInput) {
    await this.requireTemplate(id)
    await this.repo.updateTemplate(id, input)
    return this.getTemplate(id)
  }

  async removeTemplate(id: string) {
    await this.requireTemplate(id)
    await this.repo.deleteTemplate(id) // contracts keep their copied text
  }

  // ── Contracts ──────────────────────────────────────────────────────────

  async list(
    query: PageArgs & {
      status?: ContractStatus
      clientId?: string
      q?: string
    }
  ): Promise<ContractList> {
    const { items, total } = await this.repo.list(query)
    return {
      items: items.map(toContractSummary),
      total,
      page: query.page,
      pageSize: query.pageSize,
    }
  }

  async get(id: string): Promise<Contract> {
    return this.toContract(await this.require(id))
  }

  async create(input: CreateContractInput): Promise<Contract> {
    let clientId = input.clientId
    let title = input.title
    if (input.quoteId) {
      const quote = await this.repo.quote(input.quoteId)
      if (!quote) throw new BadRequestException("Quote not found")
      if (clientId && clientId !== quote.clientId)
        throw new BadRequestException("The quote belongs to another client")
      clientId = quote.clientId
      title ||= quote.title ?? undefined
    }
    const client = clientId ? await this.clients.findById(clientId) : null
    if (!client) throw new BadRequestException("Client not found")
    if (client.archivedAt)
      throw new BadRequestException("Restore the client first")
    if (input.projectId) await this.assertProject(input.projectId, client.id)

    const template = input.templateId
      ? await this.requireTemplate(input.templateId)
      : null
    const body = input.body ?? template?.body
    if (!body)
      throw new BadRequestException("Choose a template or write the contract")

    const id = await this.repo.create({
      clientId: client.id,
      templateId: template?.id ?? null,
      quoteId: input.quoteId ?? null,
      projectId: input.projectId ?? null,
      title: title || template?.name || "Contract",
      body,
      effectiveDate: input.effectiveDate ?? null,
      endDate: input.endDate ?? null,
    })
    await this.audit.record("contract.created", {
      resourceType: "contract",
      resourceId: id,
    })
    return this.get(id)
  }

  async update(id: string, input: UpdateContractInput): Promise<Contract> {
    const c = await this.require(id)
    if (c.status !== "draft")
      throw new ConflictException("Only draft contracts can be edited")
    if (input.quoteId) {
      const quote = await this.repo.quote(input.quoteId)
      if (!quote || quote.clientId !== c.clientId)
        throw new BadRequestException("Choose a quote for this client")
    }
    if (input.projectId) await this.assertProject(input.projectId, c.clientId)
    const effective =
      input.effectiveDate !== undefined ? input.effectiveDate : c.effectiveDate
    const end = input.endDate !== undefined ? input.endDate : c.endDate
    if (effective && end && end < effective)
      throw new BadRequestException("End date must be after the start date")
    await this.repo.update(id, input)
    return this.get(id)
  }

  async remove(id: string) {
    const c = await this.require(id)
    if (c.status !== "draft")
      throw new ConflictException(
        "Sent contracts are part of your records; void them instead"
      )
    await this.repo.delete(id)
    await this.audit.record("contract.deleted", {
      resourceType: "contract",
      resourceId: id,
    })
  }

  /** Assign the number, resolve merge fields and freeze the text and parties. */
  async send(id: string): Promise<Contract> {
    const profile = await this.profile.get()
    await this.repo.database.transaction(async (tx) => {
      const c = await this.repo.findById(id, tx, { forUpdate: true })
      if (!c) throw new NotFoundException("Contract not found")
      if (c.status !== "draft")
        throw new ConflictException("Contract has already been sent")
      const client = await this.clients.findById(c.clientId)
      if (!client) throw new BadRequestException("Client not found")
      const issuer = partySnapshot(profile)
      const recipient = partySnapshot(client)
      const today = todayIn(profile.timezone)
      // Check before taking a number so a failure never burns one.
      const probe = await this.mergeValues(c, issuer, recipient, "CON", today)
      const missing = unresolvedFields(c.body, probe)
      if (missing.length) {
        throw new BadRequestException({
          message: `Fill in or remove these fields before sending: ${missing.join(", ")}`,
          code: "unresolved_fields",
        })
      }
      const number = await this.numbering.next(tx, "contract")
      const values = await this.mergeValues(c, issuer, recipient, number, today)
      await this.repo.update(
        id,
        {
          number,
          status: "sent",
          sentAt: new Date(),
          renderedBody: renderMergeFields(c.body, values),
          clientSnapshot: recipient,
          issuerSnapshot: issuer,
        },
        tx
      )
    })
    await this.audit.record("contract.sent", {
      resourceType: "contract",
      resourceId: id,
    })
    return this.get(id)
  }

  /** Record the client's signature (manual until e-sign). */
  async sign(id: string, input: SignContractInput): Promise<Contract> {
    const today = todayIn((await this.profile.get()).timezone)
    const signedAt = input.signedAt ?? today
    if (signedAt > today)
      throw new BadRequestException("The signing date can't be in the future")
    await this.transition(id, ["sent"], "signed", {
      signedAt,
      signedByName: input.signedByName,
    })
    await this.audit.record("contract.signed", {
      resourceType: "contract",
      resourceId: id,
      metadata: { signedByName: input.signedByName, signedAt },
    })
    return this.get(id)
  }

  async decline(id: string): Promise<Contract> {
    await this.transition(id, ["sent"], "declined", { declinedAt: new Date() })
    await this.audit.record("contract.declined", {
      resourceType: "contract",
      resourceId: id,
    })
    return this.get(id)
  }

  async void(id: string, reason: string | null): Promise<Contract> {
    await this.transition(id, ["sent", "signed"], "void", {
      voidedAt: new Date(),
      voidReason: reason,
    })
    await this.audit.record("contract.voided", {
      resourceType: "contract",
      resourceId: id,
      metadata: { reason },
    })
    return this.get(id)
  }

  async pdf(id: string): Promise<{ filename: string; content: Buffer }> {
    const c = await this.require(id)
    const profile = await this.profile.get()
    const { issuer, recipient } = await this.parties(c)
    const contract = await this.toContract(c)
    const stamp =
      c.status === "draft"
        ? "DRAFT"
        : c.status === "declined"
          ? "DECLINED"
          : c.status === "void"
            ? "VOID"
            : null
    const content = await renderContractPdf({
      title: c.title,
      number: c.number,
      stamp,
      body: contract.renderedBody,
      meta: [
        { label: "Contract", value: c.number ?? "Draft" },
        {
          label: "Starts",
          value: formatDocDate(c.effectiveDate, profile.locale),
        },
        { label: "Ends", value: formatDocDate(c.endDate, profile.locale) },
        ...(c.quoteNumber ? [{ label: "Quote", value: c.quoteNumber }] : []),
      ],
      issuer,
      client: recipient,
      signature:
        c.status === "signed" && c.signedByName && c.signedAt
          ? {
              name: c.signedByName,
              date: formatDocDate(c.signedAt, profile.locale),
            }
          : null,
      ...(await this.profile.documentBranding()),
    })
    return { filename: `${c.number ?? "contract-draft"}.pdf`, content }
  }

  /** Email the PDF (primary contact → client email, or `to`). */
  async email(
    id: string,
    opts: { to?: string; message?: string | null }
  ): Promise<Contract> {
    const c = await this.require(id)
    if (c.status !== "sent" && c.status !== "signed")
      throw new ConflictException(
        c.status === "draft"
          ? "Mark the contract as sent before emailing it"
          : "This contract can no longer be emailed"
      )
    let to = opts.to
    if (!to) {
      const [client, contacts] = await Promise.all([
        this.clients.findById(c.clientId),
        this.clients.listContacts(c.clientId),
      ])
      to =
        contacts.find((x) => x.isPrimary && x.email)?.email ??
        client?.email ??
        contacts.find((x) => x.email)?.email ??
        undefined
    }
    if (!to) {
      throw new BadRequestException({
        message:
          "This client has no email address. Add one or enter a recipient.",
        code: "no_recipient",
      })
    }
    const profile = await this.profile.get()
    const { filename, content } = await this.pdf(id)
    await this.mail.send(
      documentEmail({
        to,
        kind: "Contract",
        number: c.number!,
        workspaceName: profile.name,
        amount: c.title,
        message: opts.message,
        replyTo: profile.email,
        pdf: { filename, contentBase64: content.toString("base64") },
      })
    )
    await this.audit.record("contract.emailed", {
      resourceType: "contract",
      resourceId: id,
      metadata: { to },
    })
    return this.get(id)
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  private async transition(
    id: string,
    from: ContractStatus[],
    to: ContractStatus,
    values: Record<string, unknown>
  ) {
    await this.repo.database.transaction(async (tx) => {
      const c = await this.repo.findById(id, tx, { forUpdate: true })
      if (!c) throw new NotFoundException("Contract not found")
      if (!from.includes(c.status))
        throw new ConflictException(
          `Only ${from.join(" or ")} contracts can be marked ${to}`
        )
      await this.repo.update(id, { status: to, ...values }, tx)
    })
  }

  private async toContract(c: ContractRow): Promise<Contract> {
    let renderedBody = c.renderedBody ?? c.body
    let unresolved: string[] = []
    if (c.status === "draft") {
      const profile = await this.profile.get()
      const { issuer, recipient } = await this.parties(c)
      const values = await this.mergeValues(
        c,
        issuer,
        recipient,
        null,
        todayIn(profile.timezone)
      )
      renderedBody = renderMergeFields(c.body, values)
      unresolved = unresolvedFields(c.body, values)
    }
    return {
      ...toContractSummary(c),
      body: c.body,
      renderedBody,
      unresolvedFields: unresolved,
      templateId: c.templateId,
      quoteId: c.quoteId,
      quoteNumber: c.quoteNumber,
      projectId: c.projectId,
      projectName: c.projectName,
      signedByName: c.signedByName,
      declinedAt: c.declinedAt?.toISOString() ?? null,
      voidedAt: c.voidedAt?.toISOString() ?? null,
      voidReason: c.voidReason,
      clientSnapshot: c.clientSnapshot ?? null,
      issuerSnapshot: c.issuerSnapshot ?? null,
    }
  }

  /** Frozen parties once sent; live client/workspace details while draft. */
  private async parties(c: ContractRow) {
    const issuer = c.issuerSnapshot ?? partySnapshot(await this.profile.get())
    let recipient = c.clientSnapshot
    if (!recipient) {
      const client = await this.clients.findById(c.clientId)
      recipient = client
        ? partySnapshot(client)
        : { name: c.clientName, addressLines: [] }
    }
    return { issuer, recipient }
  }

  /** `number` null = draft preview (the field shows as unresolved-but-OK). */
  private async mergeValues(
    c: ContractRow,
    issuer: PartySnapshot,
    client: PartySnapshot,
    number: string | null,
    today: string
  ): Promise<MergeValues> {
    const { locale } = await this.profile.get()
    const date = (d: string | null) => (d ? formatDocDate(d, locale) : null)
    const quote = c.quoteId ? await this.repo.quote(c.quoteId) : null
    return {
      "client.name": client.name,
      "client.legal_name": client.legalName || client.name,
      "client.email": client.email ?? null,
      "client.address": oneLine(client),
      "client.tax_id": client.taxId ?? null,
      "business.name": issuer.name,
      "business.legal_name": issuer.legalName || issuer.name,
      "business.email": issuer.email ?? null,
      "business.address": oneLine(issuer),
      "business.tax_id": issuer.taxId ?? null,
      // Drafts preview the number as a marker that never blocks sending.
      "contract.number": number ?? "[number on send]",
      "contract.title": c.title,
      "contract.effective_date": date(c.effectiveDate),
      "contract.end_date": date(c.endDate),
      "quote.number": quote?.number ?? null,
      "quote.title": quote?.title ?? null,
      "quote.total": quote
        ? formatMoney({ amount: quote.total, currency: quote.currency }, locale)
        : null,
      "project.name": c.projectName,
      today: date(today),
    }
  }

  private async assertProject(projectId: string, clientId: string) {
    const project = await this.repo.project(projectId)
    if (!project || (project.clientId && project.clientId !== clientId))
      throw new BadRequestException("Choose a project for this client")
  }

  private async require(id: string) {
    const c = await this.repo.findById(id)
    if (!c) throw new NotFoundException("Contract not found")
    return c
  }

  private async requireTemplate(id: string) {
    const t = await this.repo.findTemplate(id)
    if (!t) throw new NotFoundException("Template not found")
    return t
  }
}
