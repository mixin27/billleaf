import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
} from "@nestjs/common"
import { ApiTags } from "@nestjs/swagger"

import { RequirePermission } from "../../common/decorators/require-permission.decorator.js"
import { AssignMemberRolesDto } from "../roles/roles.dto.js"
import { MembersService } from "./members.service.js"

@ApiTags("members")
@Controller({ path: "members", version: "1" })
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get()
  @RequirePermission("member.read")
  list() {
    return this.members.list()
  }

  @Put(":id/roles")
  @RequirePermission("member.update")
  setRoles(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: AssignMemberRolesDto
  ) {
    return this.members.setRoles(id, body.roleIds)
  }
}
