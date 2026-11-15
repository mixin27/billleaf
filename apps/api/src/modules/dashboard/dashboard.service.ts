import { Injectable } from "@nestjs/common"
import {
  AGING_BUCKETS,
  type Dashboard,
  invoiceState,
} from "@workspace/contracts"

import { RequestContext } from "../../common/context/request-context.js"
import { addDays, todayIn } from "../documents/party-snapshot.js"
import { PaymentProofsService } from "../payments/payment-proofs.service.js"
import { WorkspaceProfileService } from "../workspace/workspace-profile.service.js"
import {
  lastDayOfMonth,
  lastMonths,
  monthStart,
  shiftMonth,
} from "./dashboard-dates.js"
import { DashboardRepository } from "./dashboard.repository.js"

const MONTHS = 6

/** Workspace dashboard; sections the member can't read come back as null. */
@Injectable()
export class DashboardService {
  constructor(
    private readonly repo: DashboardRepository,
    private readonly profile: WorkspaceProfileService,
    private readonly ctx: RequestContext,
    private readonly proofs: PaymentProofsService
  ) {}

  async get(): Promise<Dashboard> {
    const profile = await this.profile.get()
    const today = todayIn(profile.timezone)
    const primary = profile.defaultCurrency
    const perms = this.ctx.permissions
    // Primary currency first, then alphabetical.
    const sortCur = <T extends { currency: string }>(rows: T[]) =>
      [...rows].sort((a, b) =>
        a.currency === primary
          ? -1
          : b.currency === primary
            ? 1
            : a.currency.localeCompare(b.currency)
      )

    const [receivables, received, quotes, pendingProofs] = await Promise.all([
      perms.has("invoice.read") ? this.receivables(today) : null,
      perms.has("payment.read") ? this.received(today) : null,
      perms.has("quote.read") ? this.quotes(today, profile.timezone) : null,
      perms.has("payment.read") ? this.proofs.pendingSummary() : null,
    ])

    return {
      today,
      primaryCurrency: primary,
      pendingProofs,
      receivables: receivables && {
        ...receivables,
        totals: sortCur(receivables.totals),
        aging: sortCur(receivables.aging),
      },
      received: received && {
        ...received,
        thisMonth: sortCur(received.thisMonth),
        lastMonth: sortCur(received.lastMonth),
        monthly: sortCur(received.monthly),
      },
      quotes: quotes && {
        ...quotes,
        open: sortCur(quotes.open),
        acceptedThisMonth: sortCur(quotes.acceptedThisMonth),
      },
    }
  }

  private async receivables(today: string) {
    const [totals, agingRows, draftCount, overdue] = await Promise.all([
      this.repo.receivableTotals(today),
      this.repo.aging(today),
      this.repo.draftInvoiceCount(),
      this.repo.overdueInvoices(today),
    ])
    const currencies = [...new Set(agingRows.map((r) => r.currency))]
    const aging = currencies.map((currency) => ({
      currency,
      buckets: AGING_BUCKETS.map((bucket) => ({
        bucket,
        amount:
          agingRows.find((r) => r.currency === currency && r.bucket === bucket)
            ?.amount ?? 0,
      })),
    }))
    return {
      totals,
      aging,
      draftCount,
      overdueInvoices: overdue.map((i) => ({
        id: i.id,
        number: i.number,
        clientName: i.clientName,
        currency: i.currency,
        amountDue: i.total - i.amountPaid,
        dueDate: i.dueDate!,
        daysOverdue: Number(i.daysOverdue),
        displayStatus: invoiceState(
          {
            status: "issued",
            total: i.total,
            amountPaid: i.amountPaid,
            dueDate: i.dueDate,
          },
          today
        ).displayStatus,
      })),
    }
  }

  private async received(today: string) {
    const thisStart = monthStart(today)
    const lastStart = shiftMonth(thisStart, -1)
    const months = lastMonths(today, MONTHS)
    const [thisMonth, lastMonth, monthlyRows, recent] = await Promise.all([
      this.repo.receivedBetween(thisStart, today),
      this.repo.receivedBetween(lastStart, lastDayOfMonth(lastStart)),
      this.repo.receivedByMonth(`${months[0]}-01`, today),
      this.repo.recentPayments(),
    ])
    const currencies = [...new Set(monthlyRows.map((r) => r.currency))]
    return {
      thisMonth,
      lastMonth,
      monthly: currencies.map((currency) => ({
        currency,
        months: months.map((month) => ({
          month,
          amount:
            monthlyRows.find(
              (r) => r.currency === currency && r.month === month
            )?.amount ?? 0,
        })),
      })),
      recent: recent.map((p) => ({ ...p })),
    }
  }

  private async quotes(today: string, timeZone: string) {
    // Start of this month in the workspace timezone, as an instant.
    const startOfMonth = new Date(
      new Date(`${monthStart(today)}T00:00:00Z`).getTime() -
        tzOffsetMs(timeZone, new Date())
    )
    const [open, acceptedThisMonth, expiringSoonCount] = await Promise.all([
      this.repo.openQuotes(today),
      this.repo.acceptedQuotesSince(startOfMonth),
      this.repo.quotesExpiringBetween(today, addDays(today, 7)),
    ])
    return { open, acceptedThisMonth, expiringSoonCount }
  }
}

/** Offset of `timeZone` from UTC at `at`, in ms (e.g. Asia/Singapore → +8h). */
function tzOffsetMs(timeZone: string, at: Date): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value])
  )
  const asUtc = Date.UTC(
    +parts.year!,
    +parts.month! - 1,
    +parts.day!,
    +parts.hour!,
    +parts.minute!,
    +parts.second!
  )
  return asUtc - Math.floor(at.getTime() / 1000) * 1000
}
