import { ForbiddenException, Injectable } from "@nestjs/common"
import {
  effectivePlan,
  FEATURE_LABELS,
  LIMIT_LABELS,
} from "@workspace/contracts"
import { workspaceSubscriptions } from "@workspace/db"
import { eq } from "drizzle-orm"

import { RequestContext } from "../common/context/request-context.js"
import { InjectDb, type Database } from "../core/database/database.module.js"
import { type FeatureKey, type LimitKey, PLANS, type PlanKey } from "./plans.js"

/**
 * What the workspace's PLAN allows (distinct from RBAC, which is what a
 * MEMBER may do). Services call `assertWithinLimit` before creating records
 * and `assertFeature` before using paid features. Errors carry
 * `plan_limit_reached` / `feature_not_in_plan` so the web can offer an upgrade.
 */
@Injectable()
export class EntitlementsService {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly ctx: RequestContext
  ) {}

  async subscription() {
    const [row] = await this.db
      .select()
      .from(workspaceSubscriptions)
      .where(eq(workspaceSubscriptions.workspaceId, this.ctx.workspaceId))
      .limit(1)
    return row ?? null
  }

  /** The plan whose entitlements apply right now. */
  async plan(now = new Date()): Promise<PlanKey> {
    return effectivePlan(await this.subscription(), now)
  }

  async hasFeature(feature: FeatureKey) {
    return PLANS[await this.plan()].features[feature]
  }

  async assertFeature(feature: FeatureKey) {
    const plan = await this.plan()
    if (!PLANS[plan].features[feature]) {
      throw new ForbiddenException({
        message: `${FEATURE_LABELS[feature]} isn't included in the ${PLANS[plan].name} plan. Upgrade to use it.`,
        code: "feature_not_in_plan",
      })
    }
  }

  /** Throws when adding `adding` more would exceed the plan's limit. */
  async assertWithinLimit(limit: LimitKey, currentUsage: number, adding = 1) {
    const plan = await this.plan()
    const max = PLANS[plan].limits[limit]
    if (max !== null && currentUsage + adding > max) {
      throw new ForbiddenException({
        message: `The ${PLANS[plan].name} plan includes up to ${max} ${LIMIT_LABELS[limit]}. Upgrade to add more.`,
        code: "plan_limit_reached",
      })
    }
  }
}
