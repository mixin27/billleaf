import {
  type Contract,
  formatMoney,
  type Payment,
  PUSH_TYPES,
  type PushType,
  type Quote,
  type TimesheetApproval,
} from "@workspace/contracts"

/** The domain events that can turn into a push. */
export const PUSH_EVENTS = [
  "quote.accepted",
  "quote.declined",
  "contract.signed",
  "payment.recorded",
  "payment_proof.submitted",
  "timesheet.submitted",
] as const
export type PushEvent = (typeof PUSH_EVENTS)[number]

export const isPushEvent = (type: string): type is PushEvent =>
  (PUSH_EVENTS as readonly string[]).includes(type)

/** A proof of payment as the portal emits it (plus the client's name). */
export interface ProofEvent {
  id: string
  invoiceId: string
  invoiceNumber: string | null
  clientName?: string | null
  amount: number
  currency: string
}

export interface PushContent {
  type: PushType
  title: string
  body: string
  /** Where the app opens it (an expo-router path), or null for Home. */
  path: string | null
}

const money = (amount: number, currency: string, locale?: string) => {
  try {
    return formatMoney({ amount, currency }, locale)
  } catch {
    return formatMoney({ amount, currency })
  }
}

const hours = (seconds: number) => {
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  return m ? `${h}:${String(m).padStart(2, "0")}` : `${h} h`
}

/**
 * What a push for this event says, short enough for a lock screen. Null
 * for anything that doesn't notify.
 */
export function pushContent(
  event: string,
  object: unknown,
  locale?: string
): PushContent | null {
  switch (event) {
    case "quote.accepted":
    case "quote.declined": {
      const q = object as Quote
      const accepted = event === "quote.accepted"
      const number = q.number ?? "a quote"
      return {
        type: "quote.answered",
        title: `${q.clientName} ${accepted ? "accepted" : "declined"} ${number}`,
        body: accepted
          ? [money(q.total, q.currency, locale), q.title]
              .filter(Boolean)
              .join(" · ")
          : q.declineReason
            ? `“${q.declineReason}”`
            : (q.title ?? money(q.total, q.currency, locale)),
        path: `/quote/${q.id}`,
      }
    }
    case "contract.signed": {
      const c = object as Contract
      return {
        type: "contract.signed",
        title: `${c.clientName} signed ${c.number ?? "a contract"}`,
        body: [c.title, c.signedByName ? `Signed by ${c.signedByName}` : null]
          .filter(Boolean)
          .join(" · "),
        path: `/contract/${c.id}`,
      }
    }
    case "payment.recorded": {
      const p = object as Payment
      return {
        type: "payment.received",
        title: `Payment received: ${money(p.amount, p.currency, locale)}`,
        body: [p.clientName, p.invoiceNumber].filter(Boolean).join(" · "),
        path: `/invoice/${p.invoiceId}`,
      }
    }
    case "payment_proof.submitted": {
      const p = object as ProofEvent
      return {
        type: "payment.received",
        title: `Proof of payment${p.clientName ? ` from ${p.clientName}` : ""}`,
        body: `${money(p.amount, p.currency, locale)} for ${p.invoiceNumber ?? "an invoice"}. Review it on the web.`,
        path: `/invoice/${p.invoiceId}`,
      }
    }
    case "timesheet.submitted": {
      const a = object as TimesheetApproval
      return {
        type: "timesheet.submitted",
        title: `${a.memberName} submitted a timesheet`,
        body: `Week of ${a.weekStart} · ${hours(a.totalSeconds)}`,
        path: `/approval/${a.id}`,
      }
    }
    default:
      return null
  }
}

/** The permission a push type needs (`PUSH_TYPES`). */
export const permissionFor = (type: PushType) =>
  PUSH_TYPES.find((t) => t.type === type)!.permission
