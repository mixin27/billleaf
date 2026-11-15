import {
  assignMemberRolesSchema,
  createRoleSchema,
  roleSchema,
  updateRoleSchema,
} from "@workspace/contracts"
import { createZodDto } from "nestjs-zod"

export class CreateRoleDto extends createZodDto(createRoleSchema) {}
export class UpdateRoleDto extends createZodDto(updateRoleSchema) {}
export class RoleDto extends createZodDto(roleSchema) {}
export class AssignMemberRolesDto extends createZodDto(
  assignMemberRolesSchema
) {}
