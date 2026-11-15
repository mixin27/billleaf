import { Controller, Get, Query } from "@nestjs/common"
import { ApiTags } from "@nestjs/swagger"
import { auditListSchema, auditQuerySchema } from "@workspace/contracts"
import { createZodDto, ZodResponse } from "nestjs-zod"

import { RequestContext } from "../../common/context/request-context.js"
import { RequirePermission } from "../../common/decorators/require-permission.decorator.js"
import { type AuditFilter, AuditQueryService } from "./audit-query.service.js"

class AuditQueryDto extends createZodDto(auditQuerySchema) {}
class AuditListDto extends createZodDto(auditListSchema) {}

/** Settings → Audit log: this workspace's history. */
@ApiTags("audit")
@Controller({ path: "audit", version: "1" })
export class AuditController {
  constructor(
    private readonly audit: AuditQueryService,
    private readonly ctx: RequestContext
  ) {}

  @Get()
  @RequirePermission("audit.read")
  @ZodResponse({ status: 200, type: AuditListDto })
  list(@Query() q: AuditQueryDto) {
    return this.audit.list({
      ...(q as unknown as AuditFilter),
      workspaceId: this.ctx.workspaceId,
    })
  }
}
