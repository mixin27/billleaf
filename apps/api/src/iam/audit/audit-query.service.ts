import { Injectable } from "@nestjs/common"
import type { AuditList } from "@workspace/contracts"
import { apiKeys, auditLogs, organization, user } from "@workspace/db"
import { and, count, eq, gte, ilike, lt, or, sql, type SQL } from "drizzle-orm"

import { offsetOf, orderBy } from "../../common/pagination.js"
import { InjectDb, type Database } from "../../core/database/database.module.js"

const escapeLike = (v: string) => v.replace(/[\\%_]/g, (c) => `\\${c}`)

export interface AuditFilter {
  page: number
  pageSize: number
  sort?: string
  /** Scope to one workspace (workspace page) or filter (admin). */
  workspaceId?: string
  /** Action prefix, e.g. "invoice." */
  action?: string
  /** Actor name or email contains. */
  actor?: string
  from?: string
  to?: string
}

/** Reads the audit log, newest first (workspace page and admin portal). */
@Injectable()
export class AuditQueryService {
  constructor(@InjectDb() private readonly db: Database) {}

  async list(f: AuditFilter): Promise<AuditList> {
    const w: SQL[] = []
    if (f.workspaceId) w.push(eq(auditLogs.workspaceId, f.workspaceId))
    if (f.action) w.push(ilike(auditLogs.action, `${escapeLike(f.action)}%`))
    if (f.actor) {
      const like = `%${escapeLike(f.actor)}%`
      w.push(or(ilike(user.email, like), ilike(user.name, like))!)
    }
    if (f.from)
      w.push(gte(auditLogs.createdAt, new Date(`${f.from}T00:00:00Z`)))
    if (f.to)
      w.push(lt(auditLogs.createdAt, sql`(${f.to}::date + interval '1 day')`))
    const where = w.length ? and(...w) : undefined
    const base = () =>
      this.db
        .select({
          log: auditLogs,
          actorName: user.name,
          actorEmail: user.email,
          wsName: organization.name,
          wsSlug: organization.slug,
          apiKeyName: apiKeys.name,
        })
        .from(auditLogs)
        .leftJoin(user, eq(user.id, auditLogs.actorUserId))
        .leftJoin(organization, eq(organization.id, auditLogs.workspaceId))
        .leftJoin(apiKeys, eq(apiKeys.id, auditLogs.apiKeyId))
    const [rows, [total]] = await Promise.all([
      base()
        .where(where)
        .orderBy(
          ...orderBy(f.sort, { createdAt: auditLogs.createdAt }, auditLogs.id, [
            sql`${auditLogs.createdAt} desc`,
            sql`${auditLogs.id} desc`,
          ])
        )
        .limit(f.pageSize)
        .offset(offsetOf(f.page, f.pageSize)),
      this.db
        .select({ n: count() })
        .from(auditLogs)
        .leftJoin(user, eq(user.id, auditLogs.actorUserId))
        .where(where),
    ])
    return {
      items: rows.map((r) => ({
        id: r.log.id,
        createdAt: r.log.createdAt.toISOString(),
        action: r.log.action,
        actor:
          r.log.actorUserId && r.actorEmail
            ? {
                id: r.log.actorUserId,
                name: r.actorName ?? "",
                email: r.actorEmail,
              }
            : null,
        apiKey:
          r.log.apiKeyId && r.apiKeyName
            ? { id: r.log.apiKeyId, name: r.apiKeyName }
            : null,
        workspace:
          r.log.workspaceId && r.wsSlug
            ? { id: r.log.workspaceId, name: r.wsName ?? "", slug: r.wsSlug }
            : null,
        resourceType: r.log.resourceType,
        resourceId: r.log.resourceId,
        metadata: (r.log.metadata as Record<string, unknown> | null) ?? null,
        ipAddress: r.log.ipAddress,
      })),
      total: total?.n ?? 0,
      page: f.page,
      pageSize: f.pageSize,
    }
  }
}
