import { Injectable } from "@nestjs/common"
import type { Permission } from "@workspace/contracts"
import { rolePermissions, roles, type Transaction } from "@workspace/db"
import { and, asc, eq, inArray } from "drizzle-orm"

import { RequestContext } from "../../common/context/request-context.js"
import { InjectDb, type Database } from "../../core/database/database.module.js"

export type RoleRow = typeof roles.$inferSelect & { permissions: Permission[] }

/** Data access for roles. Every query is scoped to the current workspace. */
@Injectable()
export class RolesRepository {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly ctx: RequestContext
  ) {}

  async list(): Promise<RoleRow[]> {
    const rows = await this.db
      .select()
      .from(roles)
      .where(eq(roles.workspaceId, this.ctx.workspaceId))
      .orderBy(asc(roles.createdAt))
    return this.withPermissions(rows)
  }

  async findById(id: string, tx: Database | Transaction = this.db) {
    const rows = await tx
      .select()
      .from(roles)
      .where(and(eq(roles.id, id), eq(roles.workspaceId, this.ctx.workspaceId)))
      .limit(1)
    const [row] = await this.withPermissions(rows, tx)
    return row ?? null
  }

  async findManyByIds(ids: string[]) {
    if (ids.length === 0) return []
    return this.db
      .select()
      .from(roles)
      .where(
        and(inArray(roles.id, ids), eq(roles.workspaceId, this.ctx.workspaceId))
      )
  }

  async slugExists(slug: string) {
    const [row] = await this.db
      .select({ id: roles.id })
      .from(roles)
      .where(
        and(eq(roles.workspaceId, this.ctx.workspaceId), eq(roles.slug, slug))
      )
      .limit(1)
    return Boolean(row)
  }

  async create(
    input: { slug: string; name: string; description?: string },
    permissions: Permission[]
  ) {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(roles)
        .values({ ...input, workspaceId: this.ctx.workspaceId })
        .returning()
      await this.replacePermissions(tx, row!.id, permissions)
      return (await this.findById(row!.id, tx))!
    })
  }

  async update(
    id: string,
    input: { name?: string; description?: string },
    permissions?: Permission[]
  ) {
    return this.db.transaction(async (tx) => {
      if (input.name !== undefined || input.description !== undefined) {
        await tx
          .update(roles)
          .set(input)
          .where(
            and(eq(roles.id, id), eq(roles.workspaceId, this.ctx.workspaceId))
          )
      }
      if (permissions) await this.replacePermissions(tx, id, permissions)
      return (await this.findById(id, tx))!
    })
  }

  async delete(id: string) {
    await this.db
      .delete(roles)
      .where(and(eq(roles.id, id), eq(roles.workspaceId, this.ctx.workspaceId)))
  }

  private async replacePermissions(
    tx: Transaction,
    roleId: string,
    perms: Permission[]
  ) {
    await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId))
    const unique = [...new Set(perms)]
    if (unique.length > 0) {
      await tx
        .insert(rolePermissions)
        .values(unique.map((permissionKey) => ({ roleId, permissionKey })))
    }
  }

  private async withPermissions(
    rows: (typeof roles.$inferSelect)[],
    tx: Database | Transaction = this.db
  ): Promise<RoleRow[]> {
    if (rows.length === 0) return []
    const perms = await tx
      .select()
      .from(rolePermissions)
      .where(
        inArray(
          rolePermissions.roleId,
          rows.map((r) => r.id)
        )
      )
    return rows.map((r) => ({
      ...r,
      permissions: perms
        .filter((p) => p.roleId === r.id)
        .map((p) => p.permissionKey as Permission),
    }))
  }
}
