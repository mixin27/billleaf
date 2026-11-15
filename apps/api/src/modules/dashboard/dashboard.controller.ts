import { Controller, Get } from "@nestjs/common"
import { ApiTags } from "@nestjs/swagger"
import { dashboardSchema } from "@workspace/contracts"
import { createZodDto, ZodResponse } from "nestjs-zod"

import { RequireWorkspace } from "../../common/decorators/require-permission.decorator.js"
import { DashboardService } from "./dashboard.service.js"

class DashboardDto extends createZodDto(dashboardSchema) {}

@ApiTags("dashboard")
@Controller({ path: "dashboard", version: "1" })
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  /** Any member can open it; each section is filtered by their permissions. */
  @Get()
  @RequireWorkspace()
  @ZodResponse({ status: 200, type: DashboardDto })
  get() {
    return this.dashboard.get()
  }
}
