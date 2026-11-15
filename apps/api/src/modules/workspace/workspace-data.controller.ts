import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Post,
  Res,
} from "@nestjs/common"
import { ApiTags } from "@nestjs/swagger"
import { Throttle } from "@nestjs/throttler"
import { deleteWorkspaceSchema } from "@workspace/contracts"
import type { FastifyReply } from "fastify"
import { createZodDto } from "nestjs-zod"

import { RequirePermission } from "../../common/decorators/require-permission.decorator.js"
import { WorkspaceDataService } from "./workspace-data.service.js"

class DeleteWorkspaceDto extends createZodDto(deleteWorkspaceSchema) {}

/** Download all workspace data, or delete the workspace. Owners by default. */
@ApiTags("workspace")
@Controller({ path: "workspace", version: "1" })
export class WorkspaceDataController {
  constructor(private readonly data: WorkspaceDataService) {}

  /** ZIP of CSV files (one per kind of record) plus a README. */
  @Get("export")
  @RequirePermission("workspace.export")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Header("cache-control", "private, no-store")
  async export(@Res() reply: FastifyReply) {
    const { filename, body } = await this.data.export()
    void reply
      .header("content-type", "application/zip")
      .header("content-disposition", `attachment; filename="${filename}"`)
      .send(body)
  }

  /** Permanently deletes the workspace, its records and its files. */
  @Post("delete")
  @HttpCode(204)
  @RequirePermission("workspace.delete")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async remove(@Body() body: DeleteWorkspaceDto) {
    await this.data.remove(body.confirmSlug)
  }
}
