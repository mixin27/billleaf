import { Injectable, Logger } from "@nestjs/common"
import { auditLogs } from "@workspace/db"
import { ClsService } from "nestjs-cls"

import type { RequestContextStore } from "../../common/context/request-context.js"
import { InjectDb, type Database } from "../../core/database/database.module.js"

export interface AuditEntry {
  /** Override for system contexts without a request workspace (e.g. webhooks). */
  workspaceId?: string
  resourceType?: string
  resourceId?: string
  metadata?: Record<string, unknown>
}

/** Append-only audit trail for security-sensitive and financial actions. */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name)

  constructor(
    @InjectDb() private readonly db: Database,
    private readonly cls: ClsService<RequestContextStore>
  ) {}

  async record(action: string, entry: AuditEntry = {}) {
    try {
      await this.db.insert(auditLogs).values({
        action,
        actorUserId: this.cls.get("userId") ?? null,
        ipAddress: this.cls.get("ip") ?? null,
        userAgent: this.cls.get("userAgent") ?? null,
        ...entry,
        workspaceId: entry.workspaceId ?? this.cls.get("workspaceId") ?? null,
      })
    } catch (err) {
      // Never break the user's action because the audit insert failed.
      this.logger.error({ err, action }, "Failed to write audit log")
    }
  }
}
