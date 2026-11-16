import { Injectable } from "@nestjs/common"
import { amountForSeconds, type ProjectUsage } from "@workspace/contracts"

import { RatesService } from "../rates/rates.service.js"
import { TimeRepository } from "./time.repository.js"

type ProjectRef = {
  id: string
  billing: string
  currency: string
  hourlyRate: number | null
}

/**
 * What tracked time on projects is worth and what it cost. Invoiced time
 * keeps the rate it was invoiced at; everything else uses today's rates.
 */
@Injectable()
export class ProjectUsageService {
  constructor(
    private readonly repo: TimeRepository,
    private readonly rates: RatesService
  ) {}

  async usage(
    projects: ProjectRef[],
    opts: { cost: boolean }
  ): Promise<Map<string, ProjectUsage>> {
    const [rows, book] = await Promise.all([
      this.repo.usageRows(projects.map((p) => p.id)),
      this.rates.book(),
    ])
    const out = new Map<string, ProjectUsage>(
      projects.map((p) => [
        p.id,
        {
          projectId: p.id,
          trackedSeconds: 0,
          billableSeconds: 0,
          unbilledSeconds: 0,
          billableAmount: p.billing === "hourly" ? 0 : null,
          unbilledAmount: p.billing === "hourly" ? 0 : null,
          unratedSeconds: 0,
          cost: opts.cost ? 0 : null,
          uncostedSeconds: 0,
          currency: p.currency,
        },
      ])
    )
    const byId = new Map(projects.map((p) => [p.id, p]))
    for (const r of rows) {
      const p = byId.get(r.projectId)
      const u = out.get(r.projectId)
      if (!p || !u) continue
      const s = r.seconds
      u.trackedSeconds += s
      if (r.billable) {
        u.billableSeconds += s
        if (!r.invoiced) u.unbilledSeconds += s
        if (p.billing === "hourly") {
          const rate =
            r.invoiced && r.billedRate !== null
              ? r.billedRate
              : book.rate({
                  billing: p.billing,
                  currency: p.currency,
                  projectRate: p.hourlyRate,
                  taskRate: r.taskRate,
                  memberId: r.memberId,
                })
          if (rate === null) {
            if (!r.invoiced) u.unratedSeconds += s
          } else {
            const amount = amountForSeconds(s, rate)
            u.billableAmount! += amount
            if (!r.invoiced) u.unbilledAmount! += amount
          }
        }
      }
      if (opts.cost) {
        const cost = book.cost(r.memberId, p.currency)
        if (cost === null) u.uncostedSeconds += s
        else u.cost! += amountForSeconds(s, cost)
      }
    }
    return out
  }
}
