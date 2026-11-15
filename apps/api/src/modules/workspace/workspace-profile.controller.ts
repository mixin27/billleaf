import { Body, Controller, Get, Patch } from "@nestjs/common"
import { ApiTags } from "@nestjs/swagger"
import {
  updateWorkspaceProfileSchema,
  workspaceProfileSchema,
} from "@workspace/contracts"
import { createZodDto, ZodResponse } from "nestjs-zod"

import { RequirePermission } from "../../common/decorators/require-permission.decorator.js"
import { WorkspaceProfileService } from "./workspace-profile.service.js"

class WorkspaceProfileDto extends createZodDto(workspaceProfileSchema) {}
class UpdateWorkspaceProfileDto extends createZodDto(
  updateWorkspaceProfileSchema
) {}

@ApiTags("workspace")
@Controller({ path: "workspace", version: "1" })
export class WorkspaceProfileController {
  constructor(private readonly profile: WorkspaceProfileService) {}

  @Get()
  @RequirePermission("workspace.read")
  @ZodResponse({ status: 200, type: WorkspaceProfileDto })
  get() {
    return this.profile.get()
  }

  @Patch()
  @RequirePermission("workspace.update")
  @ZodResponse({ status: 200, type: WorkspaceProfileDto })
  update(@Body() body: UpdateWorkspaceProfileDto) {
    return this.profile.update(body as Record<string, unknown>)
  }
}
