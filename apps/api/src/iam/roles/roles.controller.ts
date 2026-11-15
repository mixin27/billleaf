import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from "@nestjs/common"
import { ApiTags } from "@nestjs/swagger"
import { ZodResponse } from "nestjs-zod"

import { RequirePermission } from "../../common/decorators/require-permission.decorator.js"
import { CreateRoleDto, RoleDto, UpdateRoleDto } from "./roles.dto.js"
import { RolesService } from "./roles.service.js"

@ApiTags("roles")
@Controller({ path: "roles", version: "1" })
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  @RequirePermission("role.read")
  @ZodResponse({ status: 200, type: [RoleDto] })
  list() {
    return this.roles.list()
  }

  @Get(":id")
  @RequirePermission("role.read")
  @ZodResponse({ status: 200, type: RoleDto })
  get(@Param("id", ParseUUIDPipe) id: string) {
    return this.roles.get(id)
  }

  @Post()
  @RequirePermission("role.create")
  @ZodResponse({ status: 201, type: RoleDto })
  create(@Body() body: CreateRoleDto) {
    return this.roles.create(body)
  }

  @Patch(":id")
  @RequirePermission("role.update")
  @ZodResponse({ status: 200, type: RoleDto })
  update(@Param("id", ParseUUIDPipe) id: string, @Body() body: UpdateRoleDto) {
    return this.roles.update(id, body)
  }

  @Delete(":id")
  @HttpCode(204)
  @RequirePermission("role.delete")
  remove(@Param("id", ParseUUIDPipe) id: string) {
    return this.roles.remove(id)
  }
}
