import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Put,
  Req,
} from "@nestjs/common"
import type { FastifyRequest } from "fastify"
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

  /** multipart/form-data with a single `file` field (PNG or JPEG, ≤ 1 MB). */
  @Put("logo")
  @RequirePermission("workspace.update")
  @ZodResponse({ status: 200, type: WorkspaceProfileDto })
  async uploadLogo(@Req() req: FastifyRequest) {
    if (!req.isMultipart())
      throw new BadRequestException("Send the image as multipart/form-data")
    const file = await req.file()
    if (!file) throw new BadRequestException("No file uploaded")
    let body: Buffer
    try {
      body = await file.toBuffer()
    } catch {
      throw new BadRequestException({
        message: "Images must be 1024 KB or smaller",
        code: "file_too_large",
      })
    }
    return this.profile.setLogo(file.filename, body)
  }

  @Delete("logo")
  @RequirePermission("workspace.update")
  @ZodResponse({ status: 200, type: WorkspaceProfileDto })
  removeLogo() {
    return this.profile.removeLogo()
  }
}
