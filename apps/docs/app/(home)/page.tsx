import { LogoMark } from "@workspace/brand/logo"
import Link from "next/link"

import { appUrl } from "@/lib/shared"

const sections = [
  {
    title: "Getting started",
    text: "Set up your workspace, branding, team and plan.",
    href: "/docs/getting-started",
  },
  {
    title: "Selling",
    text: "Clients, quotes and contracts your clients can sign online.",
    href: "/docs/selling/clients",
  },
  {
    title: "Work",
    text: "Projects, tasks, time tracking, rates and budgets.",
    href: "/docs/work/projects",
  },
  {
    title: "Getting paid",
    text: "Invoices, payment methods, proofs, receipts, reminders and credit notes.",
    href: "/docs/getting-paid/invoices",
  },
  {
    title: "Books",
    text: "Expenses with receipts, billing them to clients, and profit & loss.",
    href: "/docs/books/expenses",
  },
  {
    title: "Developers",
    text: "API keys, webhooks and the API reference.",
    href: "/docs/developers",
  },
]

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-4 py-16 sm:px-6">
      <div className="flex flex-col items-start gap-4">
        <LogoMark size={56} />
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Billleaf help & docs
        </h1>
        <p className="text-fd-muted-foreground max-w-2xl">
          Guides for running your work in Billleaf — from the first quote to the
          receipt — and docs for connecting it to your other tools.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/docs/getting-started"
            className="bg-fd-primary text-fd-primary-foreground rounded-md px-4 py-2 text-sm font-medium"
          >
            Start here
          </Link>
          <a
            href={`${appUrl}/app`}
            className="rounded-md border px-4 py-2 text-sm font-medium"
          >
            Open Billleaf
          </a>
        </div>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((s) => (
          <li key={s.href}>
            <Link
              href={s.href}
              className="bg-fd-card hover:bg-fd-accent flex h-full flex-col gap-1 rounded-xl border p-5 transition-colors"
            >
              <span className="font-medium">{s.title}</span>
              <span className="text-fd-muted-foreground text-sm">{s.text}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
