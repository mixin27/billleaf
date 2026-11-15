import {
  clientContactSchema,
  clientDetailSchema,
  clientListSchema,
  clientSchema,
  createClientContactSchema,
  createClientSchema,
  listClientsQuerySchema,
  updateClientContactSchema,
  updateClientSchema,
} from "@workspace/contracts"
import { createZodDto } from "nestjs-zod"

export class ClientDto extends createZodDto(clientSchema) {}
export class ClientDetailDto extends createZodDto(clientDetailSchema) {}
export class ClientListDto extends createZodDto(clientListSchema) {}
export class CreateClientDto extends createZodDto(createClientSchema) {}
export class UpdateClientDto extends createZodDto(updateClientSchema) {}
export class ListClientsQueryDto extends createZodDto(listClientsQuerySchema) {}
export class ClientContactDto extends createZodDto(clientContactSchema) {}
export class CreateClientContactDto extends createZodDto(
  createClientContactSchema
) {}
export class UpdateClientContactDto extends createZodDto(
  updateClientContactSchema
) {}
