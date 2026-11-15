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
- **Export with PDFs:** owners get a ZIP of every record plus all document PDFs by email; admins see each workspace's plan payments.
- **Deploy readiness:** production compose stack, pinned images, approval gate, smoke test, [Dokploy runbook](../infrastructure/dokploy-runbook.md).

## Next, in order

1. **Production deploy.** The repo is ready. What's left is the deploy session (server, Dokploy, DNS, R2, email) with the runbook. After it:
   - set prices and Billleaf's payment methods in `/admin/pricing`;
   - set `SUPPORT_EMAIL`;
   - have the Terms and Privacy pages reviewed for the operating country.
2. **Small follow-ups** (table below).

## Later

### Online payments

When a provider serves the operating country (a Merchant of Record for subscriptions, or a local gateway such as KBZPay / 2C2P merchant APIs):

- **Subscriptions:** another `BillingProvider` adapter next to `manual`. Both can coexist, since each subscription records its provider.
- **Invoices:** payment links on invoices and in the portal. Webhooks record payments and issue receipts automatically.

### Product

- **Outgoing webhooks and integrations:** signed event deliveries (invoice issued, payment recorded, …) with retries and a delivery log; Zapier/Make templates.
- **Teams/agencies:** per-seat pricing, timesheet approvals.
- **i18n:** translated UI, emails and PDFs, if a market needs it.

### Time tracking, later tier

- **Calendar:** a view where you drag to create and resize entries.
- **Rates and budgets:** a billable rate hierarchy (workspace → member → project → task) with cost rates; project estimates with budget alerts.
- **Faster entry:** favourites; keyboard shortcuts.
- **Rules:** rounding rules; locked periods.
- **Reminders:** idle detection and reminders (needs a browser extension or desktop app).
- **Imports:** Toggl and Harvest CSV imports reusing the Clockify importer; import history with undo.

## Small follow-ups

| Item                    | Notes                                                                       | Size |
| ----------------------- | --------------------------------------------------------------------------- | ---- |
| CJK PDF fonts           | Noto Sans SC/JP/KR subsets on demand; keep the image size in check          | S    |
| Past-due banner (other) | For a future online provider's `past_due` status (manual plans have theirs) | S    |
