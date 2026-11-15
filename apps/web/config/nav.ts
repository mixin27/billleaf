import type { Permission } from "@workspace/contracts"

export interface NavItem {
  title: string
  /** Path relative to /[workspaceSlug] */
  href: string
  permission?: Permission
}

/** Sidebar navigation. Items whose permission the member lacks are hidden. */
export const workspaceNav: NavItem[] = [
  { title: "Dashboard", href: "" },
  { title: "Clients", href: "/clients", permission: "client.read" },
  { title: "Quotes", href: "/quotes", permission: "quote.read" },
  { title: "Projects", href: "/projects", permission: "project.read" },
  { title: "Invoices", href: "/invoices", permission: "invoice.read" },
  { title: "Payments", href: "/payments", permission: "payment.read" },
  { title: "Settings", href: "/settings", permission: "workspace.read" },
]
