import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
} from "@nestjs/common"
import { ApiTags } from "@nestjs/swagger"
import {
  contractListSchema,
  contractSchema,
  contractTemplateSchema,
  createContractSchema,
  createContractTemplateSchema,
  listContractsQuerySchema,
  sendDocumentSchema,
  signContractSchema,
  updateContractSchema,
  updateContractTemplateSchema,
  voidContractSchema,
} from "@workspace/contracts"
import type { FastifyReply } from "fastify"
import { createZodDto, ZodResponse } from "nestjs-zod"

import { RequirePermission } from "../../common/decorators/require-permission.decorator.js"
import { ContractsService } from "./contracts.service.js"

class ContractDto extends createZodDto(contractSchema) {}
class ContractListDto extends createZodDto(contractListSchema) {}
class ListContractsQueryDto extends createZodDto(listContractsQuerySchema) {}
class CreateContractDto extends createZodDto(createContractSchema) {}
class UpdateContractDto extends createZodDto(updateContractSchema) {}
class SignContractDto extends createZodDto(signContractSchema) {}
class VoidContractDto extends createZodDto(voidContractSchema) {}
class SendDocumentDto extends createZodDto(sendDocumentSchema) {}
class TemplateDto extends createZodDto(contractTemplateSchema) {}
class CreateTemplateDto extends createZodDto(createContractTemplateSchema) {}
class UpdateTemplateDto extends createZodDto(updateContractTemplateSchema) {}

const uuid = new ParseUUIDPipe()

@ApiTags("contracts")
@Controller({ path: "contract-templates", version: "1" })
export class ContractTemplatesController {
  constructor(private readonly contracts: ContractsService) {}

  @Get()
  @RequirePermission("contract.read")
  @ZodResponse({ status: 200, type: [TemplateDto] })
  list() {
    return this.contracts.listTemplates()
  }

  @Get(":id")
  @RequirePermission("contract.read")
  @ZodResponse({ status: 200, type: TemplateDto })
  get(@Param("id", uuid) id: string) {
    return this.contracts.getTemplate(id)
  }

  @Post()
  @RequirePermission("contract.update")
  @ZodResponse({ status: 201, type: TemplateDto })
  create(@Body() body: CreateTemplateDto) {
    return this.contracts.createTemplate(body as never)
  }

  @Patch(":id")
  @RequirePermission("contract.update")
  @ZodResponse({ status: 200, type: TemplateDto })
  update(@Param("id", uuid) id: string, @Body() body: UpdateTemplateDto) {
    return this.contracts.updateTemplate(id, body as never)
  }

  @Delete(":id")
  @HttpCode(204)
  @RequirePermission("contract.update")
  remove(@Param("id", uuid) id: string) {
    return this.contracts.removeTemplate(id)
  }
}

@ApiTags("contracts")
@Controller({ path: "contracts", version: "1" })
export class ContractsController {
  constructor(private readonly contracts: ContractsService) {}

  @Get()
  @RequirePermission("contract.read")
  @ZodResponse({ status: 200, type: ContractListDto })
  list(@Query() query: ListContractsQueryDto) {
    return this.contracts.list(query as never)
  }

  @Get(":id")
  @RequirePermission("contract.read")
  @ZodResponse({ status: 200, type: ContractDto })
  get(@Param("id", uuid) id: string) {
    return this.contracts.get(id)
  }

  @Post()
  @RequirePermission("contract.create")
  @ZodResponse({ status: 201, type: ContractDto })
  create(@Body() body: CreateContractDto) {
    return this.contracts.create(body as never)
  }

  @Patch(":id")
  @RequirePermission("contract.update")
  @ZodResponse({ status: 200, type: ContractDto })
  update(@Param("id", uuid) id: string, @Body() body: UpdateContractDto) {
    return this.contracts.update(id, body as never)
  }

  @Delete(":id")
  @HttpCode(204)
  @RequirePermission("contract.delete")
  remove(@Param("id", uuid) id: string) {
    return this.contracts.remove(id)
  }

  /** Assign the number and freeze the text (does not email). */
  @Post(":id/send")
  @HttpCode(200)
  @RequirePermission("contract.send")
  @ZodResponse({ status: 200, type: ContractDto })
  send(@Param("id", uuid) id: string) {
    return this.contracts.send(id)
  }

  @Post(":id/sign")
  @HttpCode(200)
  @RequirePermission("contract.send")
  @ZodResponse({ status: 200, type: ContractDto })
  sign(@Param("id", uuid) id: string, @Body() body: SignContractDto) {
    return this.contracts.sign(id, body as never)
  }

  @Post(":id/decline")
  @HttpCode(200)
  @RequirePermission("contract.send")
  @ZodResponse({ status: 200, type: ContractDto })
  decline(@Param("id", uuid) id: string) {
    return this.contracts.decline(id)
  }

  @Post(":id/void")
  @HttpCode(200)
  @RequirePermission("contract.send")
  @ZodResponse({ status: 200, type: ContractDto })
  void(@Param("id", uuid) id: string, @Body() body: VoidContractDto) {
    return this.contracts.void(id, body.reason ?? null)
  }

  @Get(":id/pdf")
  @RequirePermission("contract.read")
  @Header("cache-control", "private, no-store")
  async pdf(@Param("id", uuid) id: string, @Res() reply: FastifyReply) {
    const { filename, content } = await this.contracts.pdf(id)
    void reply
      .header("content-type", "application/pdf")
      .header("content-disposition", `inline; filename="${filename}"`)
      .send(content)
  }

  @Post(":id/email")
  @HttpCode(200)
  @RequirePermission("contract.send")
  @ZodResponse({ status: 200, type: ContractDto })
  email(@Param("id", uuid) id: string, @Body() body: SendDocumentDto) {
    return this.contracts.email(id, body as never)
  }
}
