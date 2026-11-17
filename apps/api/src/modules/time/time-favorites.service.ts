import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common"
import type {
  CreateTimeFavoriteInput,
  Tag,
  TimeEntry,
  TimeFavorite,
} from "@workspace/contracts"
import { MAX_TIME_FAVORITES } from "@workspace/contracts"
import { clients, projects, tags, tasks, timeFavorites } from "@workspace/db"
import { and, asc, eq, inArray, sql, type SQL } from "drizzle-orm"

import { RequestContext } from "../../common/context/request-context.js"
import { InjectDb, type Database } from "../../core/database/database.module.js"
import { TimeService } from "./time.service.js"

/**
 * A member's pinned entries: description, project, task, tags and billable
 * to start a timer with in one click. Private to the member; at most
 * MAX_TIME_FAVORITES, kept in the member's order.
 */
@Injectable()
export class TimeFavoritesService {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly ctx: RequestContext,
    private readonly time: TimeService
  ) {}

  private assertCanTrack() {
    const p = this.ctx.permissions
    if (!p.has("time.track") && !p.has("time.manage"))
      throw new ForbiddenException("You can't track time")
  }

  private mine(): SQL {
    return and(
      eq(timeFavorites.workspaceId, this.ctx.workspaceId),
      eq(timeFavorites.memberId, this.ctx.memberId)
    )!
  }

  async list(): Promise<TimeFavorite[]> {
    const rows = await this.db
      .select({
        f: timeFavorites,
        projectName: projects.name,
        clientName: clients.name,
        taskTitle: tasks.title,
      })
      .from(timeFavorites)
      .leftJoin(projects, eq(projects.id, timeFavorites.projectId))
      .leftJoin(clients, eq(clients.id, projects.clientId))
      .leftJoin(tasks, eq(tasks.id, timeFavorites.taskId))
      .where(this.mine())
      .orderBy(asc(timeFavorites.position), asc(timeFavorites.createdAt))
    const tagIds = [...new Set(rows.flatMap((r) => r.f.tagIds))]
    const tagRows = tagIds.length
      ? await this.db
          .select({ id: tags.id, name: tags.name, color: tags.color })
          .from(tags)
          .where(
            and(
              eq(tags.workspaceId, this.ctx.workspaceId),
              inArray(tags.id, tagIds)
            )
          )
      : []
    // Deleted tags simply drop out.
    const byId = new Map(
      tagRows.map((t) => [
        t.id,
        { ...t, color: (t.color as Tag["color"]) ?? null } satisfies Tag,
      ])
    )
    return rows.map((r) => ({
      id: r.f.id,
      description: r.f.description,
      projectId: r.f.projectId,
      projectName: r.projectName,
      clientName: r.clientName,
      taskId: r.f.taskId,
      taskTitle: r.taskTitle,
      tags: r.f.tagIds.flatMap((id) => byId.get(id) ?? []),
      billable: r.f.billable,
    }))
  }

  async create(input: CreateTimeFavoriteInput): Promise<TimeFavorite> {
    this.assertCanTrack()
    const description = input.description?.trim() || null
    const projectId = input.projectId ?? null
    const taskId = projectId ? (input.taskId ?? null) : null
    if (!description && !projectId)
      throw new BadRequestException("Give it a description or a project")
    await this.assertTarget(projectId, taskId)
    const tagIds = [...new Set(input.tagIds ?? [])]
    if (tagIds.length) {
      const found = await this.db
        .select({ id: tags.id })
        .from(tags)
        .where(
          and(
            eq(tags.workspaceId, this.ctx.workspaceId),
            inArray(tags.id, tagIds)
          )
        )
      if (found.length !== tagIds.length)
        throw new BadRequestException("Unknown tag")
    }

    const existing = await this.list()
    if (existing.length >= MAX_TIME_FAVORITES)
      throw new BadRequestException({
        message: `You can pin up to ${MAX_TIME_FAVORITES} favourites. Remove one first.`,
        code: "favorites_full",
      })
    const same = existing.find(
      (f) =>
        (f.description ?? null) === description &&
        f.projectId === projectId &&
        f.taskId === taskId
    )
    if (same)
      throw new ConflictException({
        message: "That's already a favourite",
        code: "favorite_exists",
      })

    const [row] = await this.db
      .insert(timeFavorites)
      .values({
        workspaceId: this.ctx.workspaceId,
        memberId: this.ctx.memberId,
        description,
        projectId,
        taskId,
        tagIds,
        billable: input.billable ?? null,
        position: existing.length,
      })
      .returning({ id: timeFavorites.id })
    return (await this.list()).find((f) => f.id === row!.id)!
  }

  async remove(id: string) {
    const rows = await this.db
      .delete(timeFavorites)
      .where(and(this.mine(), eq(timeFavorites.id, id)))
      .returning({ id: timeFavorites.id })
    if (rows.length === 0) throw new NotFoundException("Favourite not found")
  }

  /** Set the order; ids not listed keep their place after the listed ones. */
  async reorder(ids: string[]): Promise<TimeFavorite[]> {
    const current = await this.list()
    const known = new Set(current.map((f) => f.id))
    const order = [
      ...ids.filter((id) => known.has(id)),
      ...current.map((f) => f.id).filter((id) => !ids.includes(id)),
    ]
    if (order.length) {
      await this.db
        .update(timeFavorites)
        .set({
          position: sql`array_position(${sql.param(order)}::uuid[], ${timeFavorites.id}) - 1`,
        })
        .where(this.mine())
    }
    return this.list()
  }

  /** Start a timer from a favourite (stopping the running one). */
  async start(id: string): Promise<TimeEntry> {
    const f = (await this.list()).find((x) => x.id === id)
    if (!f) throw new NotFoundException("Favourite not found")
    return this.time.start({
      description: f.description ?? undefined,
      projectId: f.projectId,
      taskId: f.taskId,
      tagIds: f.tags.map((t) => t.id),
      ...(f.billable !== null ? { billable: f.billable } : {}),
    })
  }

  private async assertTarget(projectId: string | null, taskId: string | null) {
    if (!projectId) return
    const [p] = await this.db
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(
          eq(projects.workspaceId, this.ctx.workspaceId),
          eq(projects.id, projectId)
        )
      )
    if (!p) throw new BadRequestException("Unknown project")
    if (taskId) {
      const [t] = await this.db
        .select({ id: tasks.id })
        .from(tasks)
        .where(and(eq(tasks.id, taskId), eq(tasks.projectId, projectId)))
      if (!t) throw new BadRequestException("That task isn't in the project")
    }
  }
}
