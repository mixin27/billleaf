import { Injectable, Logger } from "@nestjs/common"
import { invoiceReminders, invoices, workspaceProfiles } from "@workspace/db"
import { and, eq, gt, gte, inArray, isNotNull, lte, sql } from "drizzle-orm"
import { ClsService } from "nestjs-cls"

import type { RequestContextStore } from "../../common/context/request-context.js"
import { InjectDb, type Database } from "../../core/database/database.module.js"
import { addDays, todayIn } from "../documents/party-snapshot.js"
import { InvoicesService } from "./invoices.service.js"

/** A reminder missed by up to this many days (e.g. worker downtime) still goes out. */
export const REMINDER_CATCH_UP_DAYS = 2

const dayNumber = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000

/**
 * The reminder to send today for one invoice, or null. Offsets are days
 * relative to the due date. Never before the invoice existed, never more
 * than the catch-up window late, never one already sent, never an earlier
 * one after a later one went out, and at most one per run (the latest due).
 */
export function dueReminder(p: {
  offsets: number[]
  dueDate: string
  issueDate: string
  today: string
  sent: number[]
}): number | null {
  const lastSent = p.sent.length ? Math.max(...p.sent) : -Infinity
  let pick: number | null = null
  for (const offset of p.offsets) {
    const day = addDays(p.dueDate, offset)
    if (day <= p.issueDate || day > p.today) continue
    if (dayNumber(p.today) - dayNumber(day) > REMINDER_CATCH_UP_DAYS) continue
    if (offset <= lastSent) continue
    if (pick === null || offset > pick) pick = offset
  }
  return pick
}

/**
 * Hourly sweep (worker): email payment reminders for issued, unpaid
 * invoices in workspaces that turned them on. Each workspace runs in its
 * own request context so tenant scoping applies; the unique
 * (invoice, offset) row makes every reminder go out once.
 */
@Injectable()
export class InvoiceRemindersService {
  private readonly logger = new Logger(InvoiceRemindersService.name)

  constructor(
    @InjectDb() private readonly db: Database,
    private readonly cls: ClsService<RequestContextStore>,
    private readonly invoicesService: InvoicesService
  ) {}

  async run(now = new Date()): Promise<number> {
    const workspaces = await this.db
      .select({
        workspaceId: workspaceProfiles.workspaceId,
        offsets: workspaceProfiles.invoiceReminderOffsets,
        timezone: workspaceProfiles.timezone,
      })
      .from(workspaceProfiles)
      .where(sql`cardinality(${workspaceProfiles.invoiceReminderOffsets}) > 0`)
    let sent = 0
    for (const ws of workspaces) {
      await this.cls.run(async () => {
        this.cls.set("workspaceId", ws.workspaceId)
        try {
          sent += await this.runWorkspace(ws, todayIn(ws.timezone, now))
        } catch (err) {
          this.logger.error(
            { err, workspaceId: ws.workspaceId },
            "Invoice reminders failed"
          )
        }
      })
    }
    if (sent) this.logger.log(`Sent ${sent} invoice reminder(s)`)
    return sent
  }

  private async runWorkspace(
    ws: { workspaceId: string; offsets: number[] },
    today: string
  ) {
    const earliest = Math.min(...ws.offsets)
    const latest = Math.max(...ws.offsets)
    const candidates = await this.db
      .select({
        id: invoices.id,
        clientId: invoices.clientId,
        issueDate: invoices.issueDate,
        dueDate: invoices.dueDate,
        lastSentTo: invoices.lastSentTo,
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.workspaceId, ws.workspaceId),
          eq(invoices.status, "issued"),
          eq(invoices.remindersPaused, false),
          isNotNull(invoices.dueDate),
          sql`${invoices.total} > ${invoices.amountPaid} + ${invoices.amountCredited}`,
          // Due dates that some offset maps into the window ending today.
          gte(
            invoices.dueDate,
            addDays(today, -(latest + REMINDER_CATCH_UP_DAYS))
          ),
          lte(invoices.dueDate, addDays(today, -earliest))
        )
      )
    if (candidates.length === 0) return 0
    const already = await this.db
      .select({
        invoiceId: invoiceReminders.invoiceId,
        offsetDays: invoiceReminders.offsetDays,
      })
      .from(invoiceReminders)
      .where(
        inArray(
          invoiceReminders.invoiceId,
          candidates.map((c) => c.id)
        )
      )
    let sent = 0
    for (const inv of candidates) {
      const offset = dueReminder({
        offsets: ws.offsets,
        dueDate: inv.dueDate!,
        issueDate: inv.issueDate,
        today,
        sent: already
          .filter((a) => a.invoiceId === inv.id)
          .map((a) => a.offsetDays),
      })
      if (offset === null) continue
      const to = await this.invoicesService.reminderRecipient(inv)
      if (!to) continue
      // Claim first: a concurrent or retried run can't send it twice.
      const [claimed] = await this.db
        .insert(invoiceReminders)
        .values({
          workspaceId: ws.workspaceId,
          invoiceId: inv.id,
          offsetDays: offset,
          sentTo: to,
        })
        .onConflictDoNothing()
        .returning({ id: invoiceReminders.id })
      if (!claimed) continue
      await this.invoicesService.sendReminder(inv.id, offset, to)
      sent++
    }
    return sent
  }
}
