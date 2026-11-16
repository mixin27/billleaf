# Future plan

Work we've agreed to do later, with enough detail to pick up without re-research. The [roadmap](roadmap.md) lists phases; this page holds the next concrete items and their order.

## Done so far

- **Core loop:** clients, quotes, contracts, projects and tasks, time tracking, invoices, payments and receipts, recurring invoices, dashboard.
- **Time tracking (Clockify-style):** tracker with tags, weekly timesheet grid, reports with CSV export, Clockify CSV import.
- **Client portal:** magic-link sign-in; quotes accepted or declined online; contracts e-signed with a signature certificate; invoices and receipts; payment proofs ([ADR-0012](../adr/0012-client-portal-magic-links.md)).
- **Getting paid without card gateways:** payment instructions (bank, wallet, QR) on invoices, emails and the portal; clients upload proof and the freelancer confirms it.
- **SaaS billing:** plans and limits; manual subscription payments approved by platform admins, with reminders and a 7-day grace period ([ADR-0013](../adr/0013-manual-payments-for-subscriptions.md)).
- **Platform admin portal:** workspaces, users (ban, impersonate), jobs, audit log, approvals, pricing. Two-factor authentication for everyone, required for admins.
- **Launch readiness:** public home and pricing pages, Terms and Privacy pages, data export (ZIP of CSVs) and workspace deletion.
- **Payment reminders:** clients are emailed about unpaid invoices on the days the workspace picks (before, on and after the due date), each once; paused per invoice.
- **Account deletion:** users delete their own login once they aren't the only owner of a workspace.
- **Rates and budgets:** billable rates per task, project, member and workspace default (the most specific wins; invoiced time keeps its rate), member cost rates with cost and profit on projects and reports, time and money estimates with progress bars, a dashboard card, and owner alerts at 80% / 100%.
- **Export with PDFs:** owners get a ZIP of every record plus all document PDFs by email; admins see each workspace's plan payments.
- **Deploy readiness:** production compose stack, pinned images, approval gate, smoke test, [Dokploy runbook](../infrastructure/dokploy-runbook.md).

## Next, in order

Production deploy is on hold until there's budget for it (see [On hold](#on-hold)). Until then, build in this order:

1. **Outgoing webhooks.** Let a workspace send events to other tools:
   - **Settings → Webhooks:** endpoint URL, which events, a signing secret (HMAC-SHA256 header with a timestamp), enable/disable.
   - **Events:** client created, quote accepted/declined, contract signed, invoice issued/sent/paid/voided, payment recorded, payment proof submitted.
   - **Delivery:** a `webhooks` BullMQ queue with exponential retries; a delivery log with status, response code and a "Resend" button; disable an endpoint after repeated failures and email the owner.
   - **Safety:** HTTPS only in production, no private/internal addresses, short timeouts. Pro/Team plan feature.
   - Later: Zapier/Make templates on top.
2. **Small follow-ups** (table below), when someone needs them.

## On hold

- **Production deploy.** The repo is ready (production compose stack, smoke test, [Dokploy runbook](../infrastructure/dokploy-runbook.md)). It can share the existing server with another app; the only new costs are a domain and possibly more server memory. When there's budget:
  - run the deploy session (Dokploy, DNS, R2, email, secrets) with the runbook;
  - set prices and Billleaf's payment methods in `/admin/pricing`;
  - set `SUPPORT_EMAIL`;
  - have the Terms and Privacy pages reviewed for the operating country.

## Later

### Online payments

When a provider serves the operating country (a Merchant of Record for subscriptions, or a local gateway such as KBZPay / 2C2P merchant APIs):

- **Subscriptions:** another `BillingProvider` adapter next to `manual`. Both can coexist, since each subscription records its provider.
- **Invoices:** payment links on invoices and in the portal. Webhooks record payments and issue receipts automatically.

### Product

- **Teams/agencies:** per-seat pricing, timesheet approvals.
- **i18n:** translated UI, emails and PDFs, if a market needs it.

### Time tracking, later tier

- **Calendar:** a view where you drag to create and resize entries.
- **Faster entry:** favourites; keyboard shortcuts.
- **Rules:** rounding rules; locked periods.
- **Reminders:** idle detection and reminders (needs a browser extension or desktop app).
- **Imports:** Toggl and Harvest CSV imports reusing the Clockify importer; import history with undo.

## Small follow-ups

| Item                    | Notes                                                                       | Size |
| ----------------------- | --------------------------------------------------------------------------- | ---- |
| CJK PDF fonts           | Noto Sans SC/JP/KR subsets on demand; keep the image size in check          | S    |
| Past-due banner (other) | For a future online provider's `past_due` status (manual plans have theirs) | S    |
