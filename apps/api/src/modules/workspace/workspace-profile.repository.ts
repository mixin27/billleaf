import { Injectable } from "@nestjs/common"
import { organization, workspaceProfiles } from "@workspace/db"
import { eq } from "drizzle-orm"

import { RequestContext } from "../../common/context/request-context.js"
import { InjectDb, type Database } from "../../core/database/database.module.js"

export type ProfileRow = typeof workspaceProfiles.$inferSelect & {
  name: string
  slug: string
}
export type ProfileUpdate = Partial<
  Omit<
    typeof workspaceProfiles.$inferInsert,
    "workspaceId" | "createdAt" | "updatedAt"
  >
>

@Injectable()
export class WorkspaceProfileRepository {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly ctx: RequestContext
  ) {}

  /** Profile for the current workspace, creating the default row if missing. */
  async getOrCreate(): Promise<ProfileRow> {
    const workspaceId = this.ctx.workspaceId
    await this.db
      .insert(workspaceProfiles)
      .values({ workspaceId })
      .onConflictDoNothing()
    const [row] = await this.db
      .select({
        profile: workspaceProfiles,
        name: organization.name,
        slug: organization.slug,
      })
      .from(workspaceProfiles)
      .innerJoin(
        organization,
        eq(organization.id, workspaceProfiles.workspaceId)
      )
      .where(eq(workspaceProfiles.workspaceId, workspaceId))
      .limit(1)
    return { ...row!.profile, name: row!.name, slug: row!.slug }
  }

  async update(
    name: string | undefined,
    profile: ProfileUpdate
  ): Promise<ProfileRow> {
    const workspaceId = this.ctx.workspaceId
    await this.getOrCreate()
    await this.db.transaction(async (tx) => {
      if (name !== undefined) {
        await tx
          .update(organization)
          .set({ name })
          .where(eq(organization.id, workspaceId))
      }
      if (Object.keys(profile).length > 0) {
        await tx
          .update(workspaceProfiles)
          .set(profile)
          .where(eq(workspaceProfiles.workspaceId, workspaceId))
      }
    })
    return this.getOrCreate()
  }
}
