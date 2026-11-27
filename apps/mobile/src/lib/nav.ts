/**
 * What the navigation shows for your role and plan, and where the timer's
 * mini-player sits. Pure, so it's unit tested (src/lib/nav.test.ts).
 */

export type NavMe = {
  permissions: readonly string[]
  plan: { features: { timeTracking: boolean } }
}

export type MoneyPane = "cashbook" | "expenses"

/** The Money tab's panes you can see. */
export function moneyPanes(
  permissions: readonly string[] | undefined
): MoneyPane[] {
  const has = (p: string) => permissions?.includes(p) ?? false
  return (["cashbook", "expenses"] as const).filter((p) =>
    p === "cashbook"
      ? has("cashbook.create") || has("cashbook.manage")
      : has("expense.read")
  )
}

/** Who may track time here: the plan has it and the role allows it. */
export function canTrackTime(me: NavMe | undefined) {
  return Boolean(
    me?.plan.features.timeTracking &&
    (me.permissions.includes("time.track") ||
      me.permissions.includes("time.manage"))
  )
}

/** A tab route in src/app/(app)/(tabs). */
export type TabRoute = "index" | "expenses" | "time" | "invoices" | "clients"

export type NavSlot = {
  route: TabRoute | "more"
  label: string
  icon: "home" | "wallet" | "clock" | "invoice" | "people" | "more"
}

export type NavSlots = {
  /** The phone's bottom bar, left to right (the dock sits in the middle). */
  bar: NavSlot[]
  /** The tablet rail: every destination you have, then More. */
  rail: NavSlot[]
  /** The timer dock and mini-player (time tracking on). */
  timer: boolean
}

const HOME: NavSlot = { route: "index", label: "Home", icon: "home" }
const MORE: NavSlot = { route: "more", label: "More", icon: "more" }

/**
 * Home · Money · [timer] · Time · More. Without time tracking (or without
 * Money), the free places go to Sales (invoices, quotes, contracts) and then
 * Clients (clients, projects), which otherwise live in More on a phone.
 */
export function navSlotsFor(me: NavMe | undefined): NavSlots {
  const has = (p: string) => me?.permissions.includes(p) ?? false
  const money = moneyPanes(me?.permissions)
  const timer = canTrackTime(me)

  const candidates: NavSlot[] = []
  if (money.length > 0)
    candidates.push({
      route: "expenses",
      label:
        money.length > 1
          ? "Money"
          : money[0] === "expenses"
            ? "Expenses"
            : "Cashbook",
      icon: "wallet",
    })
  if (timer) candidates.push({ route: "time", label: "Time", icon: "clock" })
  if (has("invoice.read") || has("quote.read") || has("contract.read"))
    candidates.push({
      route: "invoices",
      label: has("invoice.read")
        ? "Invoices"
        : has("quote.read")
          ? "Quotes"
          : "Contracts",
      icon: "invoice",
    })
  if (has("client.read") || has("project.read"))
    candidates.push({
      route: "clients",
      label: has("client.read") ? "Clients" : "Projects",
      icon: "people",
    })

  return {
    bar: [HOME, ...candidates.slice(0, 2), MORE],
    rail: [HOME, ...candidates, MORE],
    timer,
  }
}

/**
 * The slot to highlight for the focused tab route: a route that isn't in
 * the bar (Invoices on a phone) is reached from More, so More lights up.
 */
export function activeSlot(slots: NavSlot[], route: string): NavSlot["route"] {
  return slots.find((s) => s.route === route)?.route ?? "more"
}

/** Routes presented as sheets or full-screen tasks (no mini-player). */
export const SHEET_ROUTES = [
  "project-picker",
  "expense-new",
  "entry-edit",
  "payment-new",
  "send",
  "contract-step",
  "payment-void",
  "book-new",
  "book-filters",
  "cashbook-entry-edit",
  "cashbook-transfer",
  "workspaces",
] as const

const TAB_PATHS = new Set([
  "/",
  "/expenses",
  "/time",
  "/invoices",
  "/clients",
  "/more",
])

export type MiniPlayerPlacement = "hidden" | "tabs" | "screen"

/**
 * Where the mini-player floats: above the tab bar on a tab, at the bottom
 * of a pushed screen, and nowhere on the timer screen or a sheet.
 */
export function miniPlayerPlacement(
  pathname: string,
  running: boolean
): MiniPlayerPlacement {
  if (!running) return "hidden"
  const path = pathname.split("?")[0]!.replace(/\/+$/, "") || "/"
  if (path === "/timer" || path === "/sign-in") return "hidden"
  const first = path.split("/")[1] ?? ""
  if ((SHEET_ROUTES as readonly string[]).includes(first)) return "hidden"
  return TAB_PATHS.has(path) ? "tabs" : "screen"
}
