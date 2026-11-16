import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
} from "@nestjs/common"
import { ApiTags } from "@nestjs/swagger"
import {
  updateDefaultRateSchema,
  updateMemberRateSchema,
  workspaceRatesSchema,
} from "@workspace/contracts"
import { createZodDto, ZodResponse } from "nestjs-zod"

import { RequirePermission } from "../../common/decorators/require-permission.decorator.js"
import { RatesService } from "./rates.service.js"

class WorkspaceRatesDto extends createZodDto(workspaceRatesSchema) {}
class UpdateDefaultRateDto extends createZodDto(updateDefaultRateSchema) {}
class UpdateMemberRateDto extends createZodDto(updateMemberRateSchema) {}

@ApiTags("rates")
@Controller({ path: "rates", version: "1" })
export class RatesController {
  constructor(private readonly rates: RatesService) {}

  @Get()
  @RequirePermission("rate.read")
  @ZodResponse({ status: 200, type: WorkspaceRatesDto })
  list() {
    return this.rates.list()
  }

  @Put("default")
  @RequirePermission("rate.manage")
  @ZodResponse({ status: 200, type: WorkspaceRatesDto })
  setDefault(@Body() body: UpdateDefaultRateDto) {
    return this.rates.setDefault(body.hourlyRate)
  }

  @Put("members/:memberId")
  @RequirePermission("rate.manage")
  @ZodResponse({ status: 200, type: WorkspaceRatesDto })
  setMember(
    @Param("memberId", new ParseUUIDPipe()) memberId: string,
    @Body() body: UpdateMemberRateDto
  ) {
    return this.rates.setMember(memberId, body)
  }
}
