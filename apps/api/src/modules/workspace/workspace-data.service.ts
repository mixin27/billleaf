import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common"
import {
  auditLogs,
  clientContacts,
  clients,
  contracts,
  contractTemplates,
  files,
  invoiceLines,
  invoices,
  member,
  organization,
  paymentAccounts,
  paymentProofs,
  payments,
  projects,
  quoteLines,
  quotes,
  receipts,
  recurringInvoices,
  session,
  subscriptionPayments,
  tags,
  tasks,
  timeEntries,
  timeEntryTags,
  user,
  workspaceProfiles,
} from "@workspace/db"
import { eq, inArray } from "drizzle-orm"
import type { PgTable } from "drizzle-orm/pg-core"
import { strToU8, zipSync } from "fflate"

import { RequestContext } from "../../common/context/request-context.js"
import { InjectDb, type Database } from "../../core/database/database.module.js"
import { StorageService } from "../../core/storage/storage.service.js"
import { AuditService } from "../../iam/audit/audit.service.js"
import { PermissionResolver } from "../../iam/permissions/permission-resolver.service.js"

type Row = Record<string, unknown>

/** One CSV cell: dates as ISO, objects as JSON, null as empty. */
function cell(v: unknown): string {
  if (v === null || v === undefined) return ""
  const s =
    v instanceof Date
      ? v.toISOString()
      : typeof v === "object"
        ? JSON.stringify(v)
        : String(v)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Rows → CSV with a header from the first row's keys (snake_case). */
export function toCsv(rows: Row[]): string {
  if (rows.length === 0) return ""
  const keys = Object.keys(rows[0]!)
  const header = keys.map((k) =>
    k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)
  )
  return [
    header.join(","),
    ...rows.map((r) => keys.map((k) => cell(r[k])).join(",")),
  ]
    .join("\r\n")
    .concat("\r\n")
}

const README = `Billleaf data export
====================

One CSV file per kind of record, as stored in Billleaf.

- Money amounts are integers in minor units (cents): 12345 USD = 123.45.
  Currencies without minor units (e.g. JPY) are whole amounts.
- Times are UTC (ISO 8601). Dates without a time are YYYY-MM-DD.
- Ids link files together, e.g. invoice_lines.invoice_id = invoices.id.
- Document PDFs and uploaded images are not included; download PDFs from
  the app while the workspace exists.
`

/**
 * Settings → Workspace → Data: download everything as CSV (a ZIP), and
 * delete the workspace with all its data and files.
 */
@Injectable()
export class WorkspaceDataService {
  private readonly logger = new Logger(WorkspaceDataService.name)

  constructor(
    @InjectDb() private readonly db: Database,
    private readonly ctx: RequestContext,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly permissions: PermissionResolver
  ) {}

  private rows(table: PgTable & { workspaceId: unknown }) {
    const ws = this.ctx.workspaceId
    return this.db
      .select()
      .from(table)
      .where(
        eq((table as unknown as typeof clients).workspaceId, ws)
      ) as Promise<Row[]>
  }

  /** A ZIP of CSVs with every record the workspace owns. */
  async export(): Promise<{ filename: string; body: Buffer }> {
    const { name, files } = await this.csvFiles()
    await this.audit.record("workspace.exported")
    return {
      filename: `${name}.zip`,
      body: Buffer.from(zipSync(files, { level: 6 })),
    }
  }

  /**
   * The export's files (README + one CSV per kind of record) and its base
   * name, e.g. `billleaf-acme-2026-11-15`. Also used by the export with PDFs.
   */
  async csvFiles(): Promise<{
    name: string
    files: Record<string, Uint8Array>
  }> {
    const ws = this.ctx.workspaceId
    const [org] = await this.db
      .select({ slug: organization.slug })
      .from(organization)
      .where(eq(organization.id, ws))
    if (!org) throw new NotFoundException("Workspace not found")

    const tables: Record<string, PgTable & { workspaceId: unknown }> = {
      workspace_profile: workspaceProfiles,
      clients,
      client_contacts: clientContacts,
      quotes,
      quote_lines: quoteLines,
      invoices,
      invoice_lines: invoiceLines,
      recurring_invoices: recurringInvoices,
      payments,
      receipts,
      payment_accounts: paymentAccounts,
      payment_proofs: paymentProofs,
      contracts,
      contract_templates: contractTemplates,
      projects,
      tasks,
      time_entries: timeEntries,
      tags,
      files,
      subscription_payments: subscriptionPayments,
      audit_log: auditLogs,
    }
    const out: Record<string, Uint8Array> = { "README.txt": strToU8(README) }
    for (const [name, table] of Object.entries(tables)) {
      const rows = await this.rows(table)
      // Internal storage keys aren't useful outside Billleaf.
      for (const r of rows) {
        delete r.key
        delete r.fileKey
      }
      out[`${name}.csv`] = strToU8(toCsv(rows))
    }

    const entryIds = (await this.rows(timeEntries)).map((e) => e.id as string)
    out["time_entry_tags.csv"] = strToU8(
      toCsv(
        entryIds.length
          ? await this.db
              .select()
              .from(timeEntryTags)
              .where(inArray(timeEntryTags.entryId, entryIds))
          : []
      )
    )
    out["members.csv"] = strToU8(
      toCsv(
        await this.db
          .select({
            userId: member.userId,
            name: user.name,
            email: user.email,
            role: member.role,
            joinedAt: member.createdAt,
          })
          .from(member)
          .innerJoin(user, eq(user.id, member.userId))
          .where(eq(member.organizationId, ws))
      )
    )

    const date = new Date().toISOString().slice(0, 10)
    return { name: `billleaf-${org.slug ?? ws}-${date}`, files: out }
  }

  /**
   * Delete the workspace: every row cascades from `organization`, then the
   * stored files go. Needs the slug typed back as confirmation.
   */
  async remove(confirmSlug: string) {
    const ws = this.ctx.workspaceId
    const [org] = await this.db
      .select({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
      })
      .from(organization)
      .where(eq(organization.id, ws))
    if (!org) throw new NotFoundException("Workspace not found")
    if (confirmSlug.trim() !== org.slug)
      throw new BadRequestException({
        message: "Type the workspace's URL name exactly to confirm",
        code: "confirmation_mismatch",
      })

    await this.db.transaction(async (tx) => {
      await tx
        .update(session)
        .set({ activeOrganizationId: null })
        .where(eq(session.activeOrganizationId, ws))
      await tx.delete(organization).where(eq(organization.id, ws))
    })
    await this.permissions.invalidateWorkspace(ws).catch(() => undefined)
    // Platform-level entry: the workspace's own log is gone with it.
    await this.audit.record("workspace.deleted", {
      workspaceId: null,
      resourceType: "workspace",
      resourceId: ws,
      metadata: { name: org.name, slug: org.slug },
    })
    for (const prefix of [`${ws}/`, `_platform/subscription-proofs/${ws}/`])
      await this.storage
        .deletePrefix(prefix)
        .catch((err) =>
          this.logger.warn({ err, prefix }, "Couldn't delete stored files")
        )
  }
}
