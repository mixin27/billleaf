import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common"
import { ApiTags } from "@nestjs/swagger"
import { Throttle } from "@nestjs/throttler"
import {
  ADMIN_QUEUES,
  adminAuditQuerySchema,
  adminBanSchema,
  adminJobListSchema,
  adminJobsQuerySchema,
  adminOverviewSchema,
  adminReasonSchema,
  adminSetPlanSchema,
  adminUserListQuerySchema,
  adminUserListSchema,
  adminUserSchema,
  adminWorkspaceListQuerySchema,
  adminWorkspaceListSchema,
  adminWorkspaceSchema,
  auditListSchema,
} from "@workspace/contracts"
import { createZodDto, ZodResponse } from "nestjs-zod"
import { z } from "zod"

import {
  type AuditFilter,
  AuditQueryService,
} from "../iam/audit/audit-query.service.js"
import { AdminService } from "./admin.service.js"
import { PlatformAdminGuard } from "./platform-admin.guard.js"

class AdminOverviewDto extends createZodDto(adminOverviewSchema) {}
class AdminWorkspaceListQueryDto extends createZodDto(
  adminWorkspaceListQuerySchema
) {}
class AdminWorkspaceListDto extends createZodDto(adminWorkspaceListSchema) {}
class AdminWorkspaceDto extends createZodDto(adminWorkspaceSchema) {}
class AdminSetPlanDto extends createZodDto(adminSetPlanSchema) {}
class AdminUserListQueryDto extends createZodDto(adminUserListQuerySchema) {}
class AdminUserListDto extends createZodDto(adminUserListSchema) {}
class AdminUserDto extends createZodDto(adminUserSchema) {}
class AdminBanDto extends createZodDto(adminBanSchema) {}
class AdminReasonDto extends createZodDto(adminReasonSchema) {}
class AdminImpersonationDto extends createZodDto(
  z.object({ userId: z.string() })
) {}
class AdminJobsQueryDto extends createZodDto(adminJobsQuerySchema) {}
class AdminJobListDto extends createZodDto(adminJobListSchema) {}
class AdminAuditQueryDto extends createZodDto(adminAuditQuerySchema) {}
class AdminAuditListDto extends createZodDto(auditListSchema) {}

const uuid = new ParseUUIDPipe()
const queue = (v: string) => {
  if (!(ADMIN_QUEUES as readonly string[]).includes(v))
    throw new NotFoundException("Unknown queue")
  return v as (typeof ADMIN_QUEUES)[number]
}

/** Platform admin portal (Billleaf staff). 404 for everyone else. */
@ApiTags("admin")
@Controller({ path: "admin", version: "1" })
@UseGuards(PlatformAdminGuard)
@Throttle({ default: { limit: 120, ttl: 60_000 } })
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly audit: AuditQueryService
  ) {}

  @Get("overview")
  @ZodResponse({ status: 200, type: AdminOverviewDto })
  overview() {
    return this.admin.overview()
  }

  @Get("workspaces")
  @ZodResponse({ status: 200, type: AdminWorkspaceListDto })
  workspaces(@Query() q: AdminWorkspaceListQueryDto) {
    return this.admin.workspaces(q as never)
  }

  @Get("workspaces/:id")
  @ZodResponse({ status: 200, type: AdminWorkspaceDto })
  workspace(@Param("id", uuid) id: string) {
    return this.admin.workspace(id)
  }

  @Put("workspaces/:id/plan")
  @ZodResponse({ status: 200, type: AdminWorkspaceDto })
  setPlan(@Param("id", uuid) id: string, @Body() body: AdminSetPlanDto) {
    return this.admin.setPlan(id, body as never)
  }

  @Get("users")
  @ZodResponse({ status: 200, type: AdminUserListDto })
  users(@Query() q: AdminUserListQueryDto) {
    return this.admin.users(q as never)
  }

  @Get("users/:id")
  @ZodResponse({ status: 200, type: AdminUserDto })
  user(@Param("id", uuid) id: string) {
    return this.admin.user(id)
  }

  @Post("users/:id/ban")
  @HttpCode(200)
  @ZodResponse({ status: 200, type: AdminUserDto })
  ban(@Param("id", uuid) id: string, @Body() body: AdminBanDto) {
    return this.admin.ban(id, body.reason, body.expiresAt)
  }

  @Post("users/:id/unban")
  @HttpCode(200)
  @ZodResponse({ status: 200, type: AdminUserDto })
  unban(@Param("id", uuid) id: string, @Body() body: AdminReasonDto) {
    return this.admin.unban(id, body.reason)
  }

  @Post("users/:id/revoke-sessions")
  @HttpCode(200)
  @ZodResponse({ status: 200, type: AdminUserDto })
  revokeSessions(@Param("id", uuid) id: string, @Body() body: AdminReasonDto) {
    return this.admin.revokeSessions(id, body.reason)
  }

  @Post("users/:id/resend-verification")
  @HttpCode(204)
  resendVerification(@Param("id", uuid) id: string) {
    return this.admin.resendVerification(id)
  }

  /**
   * Step 1 of impersonation: record the reason. The web app then calls
   * Better Auth's /api/auth/admin/impersonate-user, which only works right
   * after this (one use, two minutes).
   */
  @Post("users/:id/impersonation")
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ZodResponse({ status: 200, type: AdminImpersonationDto })
  impersonate(@Param("id", uuid) id: string, @Body() body: AdminReasonDto) {
    return this.admin.startImpersonation(id, body.reason)
  }

  @Get("jobs")
  @ZodResponse({ status: 200, type: AdminJobListDto })
  jobs(@Query() q: AdminJobsQueryDto) {
    return this.admin.jobs(q as never)
  }

  @Post("jobs/:queue/:id/retry")
  @HttpCode(204)
  retryJob(@Param("queue") q: string, @Param("id") id: string) {
    return this.admin.retryJob(queue(q), id)
  }

  @Delete("jobs/:queue/:id")
  @HttpCode(204)
  removeJob(@Param("queue") q: string, @Param("id") id: string) {
    return this.admin.removeJob(queue(q), id)
  }

  @Get("audit")
  @ZodResponse({ status: 200, type: AdminAuditListDto })
  auditLog(@Query() q: AdminAuditQueryDto) {
    return this.audit.list(q as unknown as AuditFilter)
  }
}
