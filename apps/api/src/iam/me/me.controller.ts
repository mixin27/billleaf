import { Controller, Get } from "@nestjs/common"
import { ApiTags } from "@nestjs/swagger"
import {
  type Me,
  meSchema,
  PERMISSIONS,
  permissionSchema,
  PLANS,
} from "@workspace/contracts"
import { organization } from "@workspace/db"
import { Session, type UserSession } from "@thallesp/nestjs-better-auth"
import { eq } from "drizzle-orm"
import { createZodDto, ZodResponse } from "nestjs-zod"

import { EntitlementsService } from "../../billing/entitlements.service.js"
import { AdminAccessService } from "../../admin/admin-access.service.js"
import { RequestContext } from "../../common/context/request-context.js"
import { RequireWorkspace } from "../../common/decorators/require-permission.decorator.js"
import { InjectDb, type Database } from "../../core/database/database.module.js"

class MeDto extends createZodDto(meSchema) {}
class PermissionDto extends createZodDto(permissionSchema) {}

@ApiTags("me")
@Controller({ version: "1" })
export class MeController {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly ctx: RequestContext,
    private readonly entitlements: EntitlementsService,
    private readonly adminAccess: AdminAccessService
  ) {}

  /** Current user, active workspace and effective permissions (for UI gating). */
  @Get("me")
  @RequireWorkspace()
  @ZodResponse({ status: 200, type: MeDto })
  async me(@Session() session: UserSession): Promise<Me> {
    const plan = await this.entitlements.plan()
    const [ws] = await this.db
      .select({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
      })
      .from(organization)
      .where(eq(organization.id, this.ctx.workspaceId))
      .limit(1)
    return {
      user: {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        image: session.user.image ?? null,
        isPlatformAdmin: this.adminAccess.isAdminEmail(session.user.email),
        impersonatedBy:
          (session.session as { impersonatedBy?: string | null })
            .impersonatedBy ?? null,
      },
      workspace: ws ?? null,
      permissions: [...this.ctx.permissions],
      plan: { key: plan, features: { ...PLANS[plan].features } },
    }
  }

  /** The full permission catalog (for the role editor UI). */
  @Get("permissions")
  @RequireWorkspace()
  @ZodResponse({ status: 200, type: [PermissionDto] })
  permissions() {
    return [...PERMISSIONS]
  }
}
