import { Button } from "@workspace/ui/components/button"
import Link from "next/link"

import { siteConfig } from "@/config/site"

const FLOW = [
  "Client",
  "Quote",
  "Contract",
  "Project",
  "Time",
  "Invoice",
  "Payment",
  "Receipt",
]

const FEATURES: { title: string; body: string }[] = [
  {
    title: "Quotes clients accept online",
    body: "Send a quote by email. Your client accepts or declines it in their portal, and you can turn it into a project or an invoice in one step.",
  },
  {
    title: "Contracts with e-signatures",
    body: "Start from your templates, fill in the details from the quote, and have clients sign by typing their name. The signed PDF carries a signature certificate.",
  },
  {
    title: "Projects and time tracking",
    body: "A task board per project, a timer that follows you around the app, a weekly timesheet, and reports you can export or bill straight onto an invoice.",
  },
  {
    title: "Invoices that get paid",
    body: "Branded PDFs with gap-free numbering, taxes and any currency. Show your bank account, KBZPay or WavePay with QR codes; clients upload proof and you confirm it.",
  },
  {
    title: "Receipts and recurring invoices",
    body: "Recording a payment issues a receipt. Recurring invoices go out on schedule. Your dashboard shows what's outstanding and what's overdue.",
  },
  {
    title: "A portal for your clients",
    body: "Clients sign in with a link from their email to see quotes, contracts, invoices and receipts — no password, no account to set up.",
  },
]

/** The public home page. */
export function Landing() {
  return (
    <>
      <section className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-16 sm:px-6 sm:py-24">
        <p className="rounded-full border px-3 py-1 text-xs text-muted-foreground">
          For freelancers and small studios
        </p>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
          {siteConfig.tagline}
        </h1>
        <p className="max-w-2xl text-lg text-muted-foreground">
          Billleaf takes a job from the first quote to the final receipt:
          clients, contracts, projects, time, invoices and payments, in one
          workspace.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button
            size="lg"
            nativeButton={false}
            render={<Link href="/sign-up" />}
          >
            Start free
          </Button>
          <Button
            size="lg"
            variant="outline"
            nativeButton={false}
            render={<Link href="/pricing" />}
          >
            See pricing
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Free for your first clients. No card needed.
        </p>
      </section>

      <section className="border-y bg-muted/30">
        <ol className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-2 gap-y-2 px-4 py-6 text-sm sm:px-6">
          {FLOW.map((step, i) => (
            <li key={step} className="flex items-center gap-2">
              <span className="rounded-md border bg-background px-2.5 py-1 font-medium">
                {step}
              </span>
              {i < FLOW.length - 1 ? (
                <span aria-hidden className="text-muted-foreground">
                  →
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="text-2xl font-semibold tracking-tight">
          Everything a job needs, nothing to stitch together
        </h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="flex flex-col gap-2 rounded-lg border p-5"
            >
              <h3 className="font-semibold">{f.title}</h3>
              <p className="text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <div className="flex flex-col items-start gap-4 rounded-lg border bg-muted/30 p-6 sm:flex-row sm:items-center sm:p-8">
          <div className="flex-1">
            <h2 className="text-xl font-semibold tracking-tight">
              Your data stays yours
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Download everything as spreadsheets at any time. If you stop
              paying, nothing is deleted — you just move to the Free plan&apos;s
              limits.
            </p>
          </div>
          <Button nativeButton={false} render={<Link href="/sign-up" />}>
            Create your workspace
          </Button>
        </div>
      </section>
    </>
  )
}
