import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Put,
} from "@nestjs/common"
import { ApiTags } from "@nestjs/swagger"
import { memberSchema } from "@workspace/contracts"
import { createZodDto, ZodResponse } from "nestjs-zod"

import { RequirePermission } from "../../common/decorators/require-permission.decorator.js"
import { AssignMemberRolesDto } from "../roles/roles.dto.js"
import { MembersService } from "./members.service.js"

class MemberDto extends createZodDto(memberSchema) {}

@ApiTags("members")
@Controller({ path: "members", version: "1" })
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get()
  @RequirePermission("member.read")
  @ZodResponse({ status: 200, type: [MemberDto] })
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

  @Delete(":id")
  @HttpCode(204)
  @RequirePermission("member.remove")
  remove(@Param("id", ParseUUIDPipe) id: string) {
    return this.members.remove(id)
  }
}
