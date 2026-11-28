import { canTrackTime, moneyPanes, type NavMe } from "./nav"

export type QuickActionKey =
  | "cashIn"
  | "cashOut"
  | "timer"
  | "logTime"
  | "expense"
  | "newBook"
  | "invoices"
  | "clients"
  | "approvals"
  | "quotes"

export type QuickAction = {
  key: QuickActionKey
  label: string
  icon:
    | "cashIn"
    | "cashOut"
    | "timer"
    | "clock"
    | "receipt"
    | "book"
    | "invoice"
    | "people"
    | "checklist"
    | "quote"
  tone: "in" | "out" | "primary" | "info" | "neutral"
}

/** Every quick action, in the default order. */
export const QUICK_ACTIONS: QuickAction[] = [
  { key: "cashIn", label: "Cash in", icon: "cashIn", tone: "in" },
  { key: "cashOut", label: "Cash out", icon: "cashOut", tone: "out" },
  { key: "timer", label: "Timer", icon: "timer", tone: "primary" },
  { key: "logTime", label: "Log time", icon: "clock", tone: "neutral" },
  { key: "expense", label: "Expense", icon: "receipt", tone: "neutral" },
  { key: "newBook", label: "New book", icon: "book", tone: "neutral" },
  { key: "invoices", label: "Invoices", icon: "invoice", tone: "info" },
  { key: "clients", label: "Clients", icon: "people", tone: "neutral" },
  { key: "quotes", label: "Quotes", icon: "quote", tone: "neutral" },
  { key: "approvals", label: "Approvals", icon: "checklist", tone: "neutral" },
]

/** At most this many tiles show. */
export const MAX_QUICK_ACTIONS = 8

/** Whether your role and plan let you use an action. */
export function canUse(key: QuickActionKey, me: NavMe | undefined): boolean {
  const has = (p: string) => me?.permissions.includes(p) ?? false
  const cashbook = moneyPanes(me?.permissions).includes("cashbook")
  switch (key) {
    case "cashIn":
    case "cashOut":
      return cashbook
    case "newBook":
      return has("cashbook.create")
    case "timer":
    case "logTime":
      return canTrackTime(me)
    case "expense":
      return has("expense.create")
    case "invoices":
      return has("invoice.read")
    case "quotes":
      return has("quote.read")
    case "clients":
      return has("client.read") || has("project.read")
    case "approvals":
      return has("time.approve")
  }
}

/**
 * The tiles to show: your own pick (kept on the phone) or the first
 * eight you can use, without any your role no longer allows.
 */
export function quickActionsFor(
  me: NavMe | undefined,
  picked: QuickActionKey[] | null
): QuickAction[] {
  const usable = QUICK_ACTIONS.filter((a) => canUse(a.key, me))
  if (!picked) return usable.slice(0, MAX_QUICK_ACTIONS)
  return picked
    .map((k) => usable.find((a) => a.key === k))
    .filter((a): a is QuickAction => Boolean(a))
    .slice(0, MAX_QUICK_ACTIONS)
}
