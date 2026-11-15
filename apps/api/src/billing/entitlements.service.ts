import { ForbiddenException, Injectable } from "@nestjs/common"
import { workspaceSubscriptions } from "@workspace/db"
import { eq } from "drizzle-orm"

import { RequestContext } from "../common/context/request-context.js"
import { InjectDb, type Database } from "../core/database/database.module.js"
import { type FeatureKey, type LimitKey, PLANS, type PlanKey } from "./plans.js"

/**
 * What the workspace's PLAN allows (distinct from RBAC, which is what a
 * MEMBER may do). Services call `assertWithinLimit` before creating records.
 */
@Injectable()
export class EntitlementsService {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly ctx: RequestContext
  ) {}

  async plan(): Promise<PlanKey> {
    const [row] = await this.db
      .select({ planKey: workspaceSubscriptions.planKey })
      .from(workspaceSubscriptions)
      .where(eq(workspaceSubscriptions.workspaceId, this.ctx.workspaceId))
      .limit(1)
    const key = (row?.planKey ?? "free") as PlanKey
    return key in PLANS ? key : "free"
  }

  async hasFeature(feature: FeatureKey) {
    return PLANS[await this.plan()].features[feature]
  }

  async assertWithinLimit(limit: LimitKey, currentUsage: number) {
    const max = PLANS[await this.plan()].limits[limit]
    if (max !== null && currentUsage >= max) {
      throw new ForbiddenException({
        message: `Plan limit reached for ${limit}`,
        code: "plan_limit_reached",
      })
    }
  }
}
