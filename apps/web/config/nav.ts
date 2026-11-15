import {
  Agreement01Icon,
  Clock01Icon,
  DashboardSquare01Icon,
  Folder01Icon,
  Invoice01Icon,
  MoneyReceive01Icon,
  QuoteDownIcon,
  RepeatIcon,
  Settings01Icon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons"
import type { IconSvgElement } from "@hugeicons/react"
import type { Permission } from "@workspace/contracts"

export interface NavItem {
  title: string
  /** Path relative to /[workspaceSlug] ("" = home). */
  href: string
  icon: IconSvgElement
  permission?: Permission
  /** Extra words for the command menu. */
  keywords?: string[]
}

export interface NavGroup {
  /** Section label; null renders the items without a heading. */
  label: string | null
  items: NavItem[]
}

/**
 * Sidebar navigation in the order of the business journey. Items the member
 * lacks permission for are hidden; empty groups disappear.
 */
export const workspaceNav: NavGroup[] = [
  {
    label: null,
    items: [
      {
        title: "Home",
        href: "",
        icon: DashboardSquare01Icon,
        keywords: ["dashboard", "overview"],
      },
    ],
  },
  {
    label: "Sell",
    items: [
      {
        title: "Clients",
        href: "/clients",
        icon: UserGroupIcon,
        permission: "client.read",
        keywords: ["customers"],
      },
      {
        title: "Quotes",
        href: "/quotes",
        icon: QuoteDownIcon,
        permission: "quote.read",
        keywords: ["estimates", "proposals"],
      },
      {
        title: "Contracts",
        href: "/contracts",
        icon: Agreement01Icon,
        permission: "contract.read",
        keywords: ["agreements"],
      },
    ],
  },
  {
    label: "Work",
    items: [
      {
        title: "Projects",
        href: "/projects",
        icon: Folder01Icon,
        permission: "project.read",
        keywords: ["tasks"],
      },
      {
        title: "Time",
        href: "/time",
        icon: Clock01Icon,
        permission: "time.track",
        keywords: ["timesheet", "timer", "hours"],
      },
    ],
  },
  {
    label: "Get paid",
    items: [
      {
        title: "Invoices",
        href: "/invoices",
        icon: Invoice01Icon,
        permission: "invoice.read",
        keywords: ["bills"],
      },
      {
        title: "Recurring",
        href: "/invoices/recurring",
        icon: RepeatIcon,
        permission: "invoice.read",
        keywords: ["subscriptions", "retainers"],
      },
      {
        title: "Payments",
        href: "/payments",
        icon: MoneyReceive01Icon,
        permission: "payment.read",
        keywords: ["receipts"],
      },
    ],
  },
]

export const settingsNavItem: NavItem = {
  title: "Settings",
  href: "/settings",
  icon: Settings01Icon,
  permission: "workspace.read",
  keywords: ["workspace", "billing", "members", "roles"],
}

/** Longest matching item wins, so /invoices/recurring highlights Recurring, not Invoices. */
export function activeHref(pathname: string, base: string, hrefs: string[]) {
  let best: string | null = null
  for (const h of hrefs) {
    const full = `${base}${h}`
    const hit =
      h === ""
        ? pathname === base
        : pathname === full || pathname.startsWith(`${full}/`)
    if (hit && (best === null || h.length > best.length)) best = h
  }
  return best
}
