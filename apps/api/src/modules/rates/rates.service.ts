import { Injectable, NotFoundException } from "@nestjs/common"
import {
  resolveHourlyRate,
  type UpdateMemberRateInput,
  type WorkspaceRates,
} from "@workspace/contracts"
import { member, memberRates, user, workspaceProfiles } from "@workspace/db"
import { and, asc, eq } from "drizzle-orm"

import { RequestContext } from "../../common/context/request-context.js"
import { InjectDb, type Database } from "../../core/database/database.module.js"
import { AuditService } from "../../iam/audit/audit.service.js"

type MemberRateRow = {
  currency: string
  hourlyRate: number | null
  costRate: number | null
}

/**
 * The rates that price time in one workspace: the default billable rate and
 * each member's billable and cost rates. Load once, then resolve per entry.
 */
export class RateBook {
  constructor(
    readonly workspace: { currency: string; hourlyRate: number | null },
    readonly members: Map<string, MemberRateRow>
  ) {}

  /** Billable rate for time on a project (see `resolveHourlyRate`). */
  rate(p: {
    billing: string
    currency: string
    projectRate: number | null
    taskRate?: number | null
    memberId?: string | null
  }): number | null {
    return (
      resolveHourlyRate({
        ...p,
        member: p.memberId ? this.members.get(p.memberId) : null,
        workspace: this.workspace,
      })?.rate ?? null
    )
  }

  /** Cost rate of a member's time in `currency`, or null. */
  cost(memberId: string | null, currency: string): number | null {
    const m = memberId ? this.members.get(memberId) : undefined
    return m && m.currency === currency ? m.costRate : null
  }
}

/** Settings → Rates: the default hourly rate and member rates. */
@Injectable()
export class RatesService {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly ctx: RequestContext,
    private readonly audit: AuditService
  ) {}

  private async defaults() {
    const [p] = await this.db
      .select({
        currency: workspaceProfiles.defaultCurrency,
        hourlyRate: workspaceProfiles.defaultHourlyRate,
      })
      .from(workspaceProfiles)
      .where(eq(workspaceProfiles.workspaceId, this.ctx.workspaceId))
    return p ?? { currency: "USD", hourlyRate: null }
  }

  async book(): Promise<RateBook> {
    const [workspace, rows] = await Promise.all([
      this.defaults(),
      this.db
        .select()
        .from(memberRates)
        .where(eq(memberRates.workspaceId, this.ctx.workspaceId)),
    ])
    return new RateBook(workspace, new Map(rows.map((r) => [r.memberId, r])))
  }

  async list(): Promise<WorkspaceRates> {
    const ws = this.ctx.workspaceId
    const [defaults, rows] = await Promise.all([
      this.defaults(),
      this.db
        .select({
          memberId: member.id,
          name: user.name,
          email: user.email,
          currency: memberRates.currency,
          hourlyRate: memberRates.hourlyRate,
          costRate: memberRates.costRate,
        })
        .from(member)
        .innerJoin(user, eq(user.id, member.userId))
        .leftJoin(memberRates, eq(memberRates.memberId, member.id))
        .where(eq(member.organizationId, ws))
        .orderBy(asc(user.name)),
    ])
    return {
      currency: defaults.currency,
      defaultHourlyRate: defaults.hourlyRate,
      members: rows,
    }
  }

  async setDefault(hourlyRate: number | null): Promise<WorkspaceRates> {
    await this.db
      .update(workspaceProfiles)
      .set({ defaultHourlyRate: hourlyRate })
      .where(eq(workspaceProfiles.workspaceId, this.ctx.workspaceId))
    await this.audit.record("rates.default_updated", {
      metadata: { hourlyRate },
    })
    return this.list()
  }

  /** Saved in the workspace's current default currency. */
  async setMember(
    memberId: string,
    input: UpdateMemberRateInput
  ): Promise<WorkspaceRates> {
    const ws = this.ctx.workspaceId
    const [m] = await this.db
      .select({ id: member.id })
      .from(member)
      .where(and(eq(member.id, memberId), eq(member.organizationId, ws)))
    if (!m) throw new NotFoundException("Member not found")
    const { currency } = await this.defaults()
    const values = {
      currency,
      hourlyRate: input.hourlyRate ?? null,
      costRate: input.costRate ?? null,
    }
    await this.db
      .insert(memberRates)
      .values({ workspaceId: ws, memberId, ...values })
      .onConflictDoUpdate({
        target: memberRates.memberId,
        set: { ...values, updatedAt: new Date() },
      })
    await this.audit.record("rates.member_updated", {
      resourceType: "member",
      resourceId: memberId,
      metadata: values,
    })
    return this.list()
  }
}
