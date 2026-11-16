import { Inject, Injectable, Logger } from "@nestjs/common"
import {
  BUDGET_THRESHOLDS,
  budgetThreshold,
  formatMoney,
  type ProjectBudget,
} from "@workspace/contracts"
import { budgetAlertEmail } from "@workspace/emails"
import {
  member,
  organization,
  projectBudgetAlerts,
  projects,
  user,
} from "@workspace/db"
import { and, eq, isNotNull, or } from "drizzle-orm"
import { ClsService } from "nestjs-cls"

import type { RequestContextStore } from "../../common/context/request-context.js"
import { ENV, type Env } from "../../core/config/env.js"
import { InjectDb, type Database } from "../../core/database/database.module.js"
import { MailService } from "../../mail/mail.service.js"
import {
  ProjectsRepository,
  type ProjectWithRefs,
} from "../projects/projects.repository.js"
import { ProjectUsageService } from "./project-usage.service.js"

const hours = (seconds: number) => `${Math.round((seconds / 3600) * 10) / 10} h`

/** Percent of each estimate a project has used (null where none is set). */
function shares(p: ProjectWithRefs, tracked: number, amount: number | null) {
  return {
    hours: p.estimateMinutes ? (tracked / 60 / p.estimateMinutes) * 100 : null,
    amount:
      p.estimateAmount && amount !== null
        ? (amount / p.estimateAmount) * 100
        : null,
  }
}

/**
 * Project estimates: the dashboard's budgets list, and an hourly sweep
 * (worker) that emails owners once when a project reaches 80% and 100% of
 * its time or money estimate.
 */
@Injectable()
export class BudgetsService {
  private readonly logger = new Logger(BudgetsService.name)

  constructor(
    @InjectDb() private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly cls: ClsService<RequestContextStore>,
    private readonly projects: ProjectsRepository,
    private readonly usage: ProjectUsageService,
    private readonly mail: MailService
  ) {}

  /** Active projects with an estimate, the most used first. */
  async list(): Promise<ProjectBudget[]> {
    const rows = await this.projects.withEstimates()
    const usage = await this.usage.usage(rows, { cost: false })
    return rows
      .map((p) => {
        const u = usage.get(p.id)!
        const s = shares(p, u.trackedSeconds, u.billableAmount)
        return {
          projectId: p.id,
          name: p.name,
          clientName: p.clientName,
          currency: p.currency,
          estimateMinutes: p.estimateMinutes,
          estimateAmount: p.estimateAmount,
          trackedSeconds: u.trackedSeconds,
          billableAmount: u.billableAmount,
          percent: Math.round(Math.max(s.hours ?? 0, s.amount ?? 0)),
        }
      })
      .sort((a, b) => b.percent - a.percent || a.name.localeCompare(b.name))
  }

  async run(): Promise<number> {
    const workspaces = await this.db
      .selectDistinct({ id: projects.workspaceId })
      .from(projects)
      .where(
        and(
          eq(projects.status, "active"),
          or(
            isNotNull(projects.estimateMinutes),
            isNotNull(projects.estimateAmount)
          )
        )
      )
    let sent = 0
    for (const ws of workspaces) {
      await this.cls.run(async () => {
        this.cls.set("workspaceId", ws.id)
        try {
          sent += await this.runWorkspace(ws.id)
        } catch (err) {
          this.logger.error({ err, workspaceId: ws.id }, "Budget alerts failed")
        }
      })
    }
    if (sent) this.logger.log(`Sent ${sent} budget alert(s)`)
    return sent
  }

  private async runWorkspace(workspaceId: string): Promise<number> {
    const rows = await this.projects.withEstimates()
    const usage = await this.usage.usage(rows, { cost: false })
    let sent = 0
    for (const p of rows) {
      const u = usage.get(p.id)!
      const checks = [
        {
          kind: "hours" as const,
          estimate: p.estimateMinutes,
          used: u.trackedSeconds / 60,
          label: () =>
            `${hours(u.trackedSeconds)} of ${hours(p.estimateMinutes! * 60)}`,
        },
        {
          kind: "amount" as const,
          estimate: p.estimateAmount,
          used: u.billableAmount ?? 0,
          label: () =>
            `${formatMoney({ amount: u.billableAmount ?? 0, currency: p.currency })} of ${formatMoney({ amount: p.estimateAmount!, currency: p.currency })}`,
        },
      ]
      for (const c of checks) {
        if (!c.estimate) continue
        const reached = budgetThreshold(c.used, c.estimate)
        if (reached === null) continue
        const thresholds = BUDGET_THRESHOLDS.filter((t) => t <= reached)
        const fresh = await this.db
          .insert(projectBudgetAlerts)
          .values(
            thresholds.map((threshold) => ({
              workspaceId,
              projectId: p.id,
              kind: c.kind,
              threshold,
              estimate: c.estimate!,
            }))
          )
          .onConflictDoNothing()
          .returning({ threshold: projectBudgetAlerts.threshold })
        // Only the highest new threshold is worth an email.
        if (!fresh.some((f) => f.threshold === reached)) continue
        await this.notify(workspaceId, p, reached, c.label())
        sent++
      }
    }
    return sent
  }

  private async notify(
    workspaceId: string,
    p: ProjectWithRefs,
    threshold: number,
    used: string
  ) {
    const [ws] = await this.db
      .select({ name: organization.name, slug: organization.slug })
      .from(organization)
      .where(eq(organization.id, workspaceId))
    if (!ws) return
    const owners = await this.db
      .select({ email: user.email })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(
        and(eq(member.organizationId, workspaceId), eq(member.role, "owner"))
      )
    const url = `${this.env.WEB_URL}/${encodeURIComponent(ws.slug ?? workspaceId)}/projects/${p.id}`
    for (const o of owners)
      await this.mail
        .send(
          budgetAlertEmail({
            to: o.email,
            workspaceName: ws.name,
            projectName: p.name,
            threshold,
            used,
            url,
          })
        )
        .catch((err) =>
          this.logger.error({ err, projectId: p.id }, "Budget alert not sent")
        )
  }
}
