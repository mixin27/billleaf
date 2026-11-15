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
  Query,
} from "@nestjs/common"
import { ApiTags } from "@nestjs/swagger"
import { ZodResponse } from "nestjs-zod"

import { RequirePermission } from "../../common/decorators/require-permission.decorator.js"
import {
  ClientContactDto,
  ClientDetailDto,
  ClientDto,
  ClientListDto,
  CreateClientContactDto,
  CreateClientDto,
  ListClientsQueryDto,
  UpdateClientContactDto,
  UpdateClientDto,
} from "./clients.dto.js"
import type { ClientValues, ContactValues } from "./clients.repository.js"
import { ClientsService } from "./clients.service.js"

const uuid = new ParseUUIDPipe()

@ApiTags("clients")
@Controller({ path: "clients", version: "1" })
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Get()
  @RequirePermission("client.read")
  @ZodResponse({ status: 200, type: ClientListDto })
  list(@Query() query: ListClientsQueryDto) {
    return this.clients.list(query as never)
  }

  @Get(":id")
  @RequirePermission("client.read")
  @ZodResponse({ status: 200, type: ClientDetailDto })
  get(@Param("id", uuid) id: string) {
    return this.clients.get(id)
  }

  @Post()
  @RequirePermission("client.create")
  @ZodResponse({ status: 201, type: ClientDto })
  create(@Body() body: CreateClientDto) {
    return this.clients.create(body as unknown as ClientValues)
  }

  @Patch(":id")
  @RequirePermission("client.update")
  @ZodResponse({ status: 200, type: ClientDto })
  update(@Param("id", uuid) id: string, @Body() body: UpdateClientDto) {
    return this.clients.update(id, body as unknown as Partial<ClientValues>)
  }

  @Post(":id/archive")
  @HttpCode(200)
  @RequirePermission("client.update")
  @ZodResponse({ status: 200, type: ClientDto })
  archive(@Param("id", uuid) id: string) {
    return this.clients.archive(id)
  }

  @Post(":id/restore")
  @HttpCode(200)
  @RequirePermission("client.update")
  @ZodResponse({ status: 200, type: ClientDto })
  restore(@Param("id", uuid) id: string) {
    return this.clients.restore(id)
  }

  @Delete(":id")
  @HttpCode(204)
  @RequirePermission("client.delete")
  remove(@Param("id", uuid) id: string) {
    return this.clients.remove(id)
  }

  @Post(":id/contacts")
  @RequirePermission("client.update")
  @ZodResponse({ status: 201, type: ClientContactDto })
  addContact(
    @Param("id", uuid) id: string,
    @Body() body: CreateClientContactDto
  ) {
    return this.clients.addContact(id, body as unknown as ContactValues)
  }

  @Patch(":id/contacts/:contactId")
  @RequirePermission("client.update")
  @ZodResponse({ status: 200, type: ClientContactDto })
  updateContact(
    @Param("id", uuid) id: string,
    @Param("contactId", uuid) contactId: string,
    @Body() body: UpdateClientContactDto
  ) {
    return this.clients.updateContact(
      id,
      contactId,
      body as unknown as Partial<ContactValues>
    )
  }

  @Delete(":id/contacts/:contactId")
  @HttpCode(204)
  @RequirePermission("client.update")
  removeContact(
    @Param("id", uuid) id: string,
    @Param("contactId", uuid) contactId: string
  ) {
    return this.clients.removeContact(id, contactId)
  }
}
