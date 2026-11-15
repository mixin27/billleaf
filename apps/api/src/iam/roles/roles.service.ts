import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common"
import type {
  CreateRoleInput,
  Role,
  UpdateRoleInput,
} from "@workspace/contracts"

import { EntitlementsService } from "../../billing/entitlements.service.js"
import { RequestContext } from "../../common/context/request-context.js"
import { AuditService } from "../audit/audit.service.js"
import { PermissionResolver } from "../permissions/permission-resolver.service.js"
import { RolesRepository, type RoleRow } from "./roles.repository.js"

function slugify(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

export function toRoleDto(r: RoleRow): Role {
  return {
    id: r.id,
    workspaceId: r.workspaceId,
    slug: r.slug,
    name: r.name,
    description: r.description,
    isSystem: r.isSystem,
    isLocked: r.isLocked,
    permissions: r.permissions,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }
}

@Injectable()
export class RolesService {
  constructor(
    private readonly repo: RolesRepository,
    private readonly resolver: PermissionResolver,
    private readonly audit: AuditService,
    private readonly ctx: RequestContext,
    private readonly entitlements: EntitlementsService
  ) {}

  async list(): Promise<Role[]> {
    return (await this.repo.list()).map(toRoleDto)
  }

  async get(id: string): Promise<Role> {
    const role = await this.repo.findById(id)
    if (!role) throw new NotFoundException("Role not found")
    return toRoleDto(role)
  }

  async create(input: CreateRoleInput): Promise<Role> {
    await this.entitlements.assertFeature("customRoles")
    const slug = slugify(input.name)
    if (!slug) throw new BadRequestException("Invalid role name")
    if (await this.repo.slugExists(slug)) {
      throw new ConflictException("A role with this name already exists")
    }
    const role = await this.repo.create(
      { slug, name: input.name, description: input.description },
      input.permissions
    )
    await this.audit.record("role.created", {
      resourceType: "role",
      resourceId: role.id,
    })
    return toRoleDto(role)
  }

  async update(id: string, input: UpdateRoleInput): Promise<Role> {
    const existing = await this.repo.findById(id)
    if (!existing) throw new NotFoundException("Role not found")
    if (existing.isLocked)
      throw new BadRequestException("This role cannot be modified")
    await this.entitlements.assertFeature("customRoles")

    const role = await this.repo.update(
      id,
      { name: input.name, description: input.description },
      input.permissions
    )
    await this.resolver.invalidateWorkspace(this.ctx.workspaceId)
    await this.audit.record("role.updated", {
      resourceType: "role",
      resourceId: id,
      metadata: { permissions: input.permissions },
    })
    return toRoleDto(role)
  }

  async remove(id: string): Promise<void> {
    const existing = await this.repo.findById(id)
    if (!existing) throw new NotFoundException("Role not found")
    if (existing.isLocked || existing.isSystem) {
      throw new BadRequestException("System roles cannot be deleted")
    }
    await this.repo.delete(id)
    await this.resolver.invalidateWorkspace(this.ctx.workspaceId)
    await this.audit.record("role.deleted", {
      resourceType: "role",
      resourceId: id,
    })
  }
}
