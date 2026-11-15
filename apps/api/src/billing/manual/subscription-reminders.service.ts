import { Inject, Injectable, Logger } from "@nestjs/common"
import {
  isPlanKey,
  MANUAL_GRACE_DAYS,
  PLANS,
  RENEWAL_REMINDER_DAYS,
} from "@workspace/contracts"
import { subscriptionReminderEmail } from "@workspace/emails"
import { workspaceSubscriptions } from "@workspace/db"
import { and, eq, gt, isNull, lt, ne } from "drizzle-orm"

import { ENV, type Env } from "../../core/config/env.js"
import { InjectDb, type Database } from "../../core/database/database.module.js"
import { SubscriptionPaymentsService } from "./subscription-payments.service.js"

const DAY = 86_400_000

export type ReminderStage = "7d" | "1d" | "ended"
const STAGES: ReminderStage[] = ["7d", "1d", "ended"]

/** Which reminder is due for a period ending at `end` (null = none). */
export function reminderStage(end: Date, now: Date): ReminderStage | null {
  const left = end.getTime() - now.getTime()
  if (left <= 0) return -left <= MANUAL_GRACE_DAYS * DAY ? "ended" : null
  const [week, lastDay] = RENEWAL_REMINDER_DAYS
  if (left <= lastDay * DAY) return "1d"
  if (left <= week * DAY) return "7d"
  return null
}

/**
 * Renewal reminders for manually paid plans: 7 days and 1 day before the
 * period ends, and once when it has ended (with the grace period's end).
 * Runs hourly in the worker; `last_reminder` makes each one go out once
 * per period even with overlapping runs.
 */
@Injectable()
export class SubscriptionRemindersService {
  private readonly logger = new Logger(SubscriptionRemindersService.name)

  constructor(
    @InjectDb() private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly payments: SubscriptionPaymentsService
  ) {}

  async run(now = new Date()): Promise<number> {
    const subs = await this.db
      .select()
      .from(workspaceSubscriptions)
      .where(
        and(
          eq(workspaceSubscriptions.provider, "manual"),
          ne(workspaceSubscriptions.planKey, "free"),
          ne(workspaceSubscriptions.status, "canceled"),
          eq(workspaceSubscriptions.cancelAtPeriodEnd, true),
          gt(
            workspaceSubscriptions.currentPeriodEnd,
            new Date(now.getTime() - MANUAL_GRACE_DAYS * DAY)
          ),
          lt(
            workspaceSubscriptions.currentPeriodEnd,
            new Date(now.getTime() + RENEWAL_REMINDER_DAYS[0] * DAY)
          )
        )
      )
    let sent = 0
    for (const sub of subs) {
      const end = sub.currentPeriodEnd!
      const stage = reminderStage(end, now)
      if (!stage || !isPlanKey(sub.planKey) || sub.planKey === "free") continue
      const key = `${stage}@${end.toISOString()}`
      const [lastStage, lastEnd] = (sub.lastReminder ?? "").split("@")
      // Each stage once per period, never going back to an earlier one.
      if (
        lastEnd === end.toISOString() &&
        STAGES.indexOf(lastStage as ReminderStage) >= STAGES.indexOf(stage)
      )
        continue
      // Optimistic claim so overlapping runs can't both send it.
      const [claimed] = await this.db
        .update(workspaceSubscriptions)
        .set({ lastReminder: key })
        .where(
          and(
            eq(workspaceSubscriptions.workspaceId, sub.workspaceId),
            sub.lastReminder === null
              ? isNull(workspaceSubscriptions.lastReminder)
              : eq(workspaceSubscriptions.lastReminder, sub.lastReminder)
          )
        )
        .returning({ id: workspaceSubscriptions.workspaceId })
      if (!claimed) continue
      const plan = PLANS[sub.planKey].name
      const date = (
        stage === "ended"
          ? new Date(end.getTime() + MANUAL_GRACE_DAYS * DAY)
          : end
      )
        .toISOString()
        .slice(0, 10)
      await this.payments.notifyOwners(sub.workspaceId, (to, ws) =>
        subscriptionReminderEmail({
          to,
          workspaceName: ws.name,
          plan,
          stage,
          date,
          url: `${this.env.WEB_URL}/${encodeURIComponent(ws.slug)}/settings/billing`,
        })
      )
      sent++
    }
    if (sent) this.logger.log(`Sent ${sent} renewal reminder(s)`)
    return sent
  }
}
