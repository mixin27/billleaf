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
- **Credit notes:** corrections and partial refunds for issued invoices (full or partial, numbered CN-0001), lowering the balance first and showing any refund due; PDF, email, void, a list page, and credits in the portal, dashboard and tax summary.
- **Expenses:** spending with receipts (photo or PDF) and categories; billable expenses onto a client's draft invoice (released if the draft is deleted or the invoice voided); Reports → profit & loss per month, expenses by category, and a tax summary.
- **Import history with undo:** Time → Import lists past imports (app, file, who, counts); Undo deletes an import's entries except invoiced or locked ones, and can be run again once they're freed.
- **CJK PDF fonts:** Chinese (Simplified/Traditional), Japanese and Korean on every PDF; fonts fetched on first use (pinned, checksummed, cached in a volume) so the image stays small.
- **Toggl Track and Harvest imports:** next to Clockify in Time → Import (one `import/{source}` endpoint); Harvest rows come in as duration-only entries; people matched by email or unique name.
- **Time rules:** per-entry rounding (up / nearest / down to 1–60 min) on invoices, project amounts and reports (with an exact-time toggle), and a lock date before which time can't change.
- **Faster time entry:** favourites (pinned entries started in one click or with keys 1–9) and keyboard shortcuts (S timer, N log time, arrows/T/W on the calendar and timesheet, ? for the list).
- **Timesheet approvals (Team):** members submit weeks; approvers approve or send back with a note (emails and webhooks both ways); submitted/approved weeks lock; only approved time is invoiced.
- **Time calendar:** a week/day calendar of your own time (workspace time zone) where you drag to log, move and resize entries; duration-only entries wait in a "No set time" row until placed.
- **Rates and budgets:** billable rates per task, project, member and workspace default (the most specific wins; invoiced time keeps its rate), member cost rates with cost and profit on projects and reports, time and money estimates with progress bars, a dashboard card, and owner alerts at 80% / 100%.
- **Developer API:** workspace API keys (Settings → API keys) that act as their creator with chosen permissions, a public API reference at `/docs/api`, per-key rate limits and audit; Pro and Team ([ADR-0015](../adr/0015-workspace-api-keys.md)).
- **Outgoing webhooks:** signed event deliveries to other apps (clients, quotes, contracts, invoices, payments, proofs) with retries, a delivery log with resend, test events, secret rotation, and auto-off after repeated failures; Pro and Team ([ADR-0014](../adr/0014-outgoing-webhooks.md)).
- **Export with PDFs:** owners get a ZIP of every record plus all document PDFs by email; admins see each workspace's plan payments.
- **Docs site and brand:** a public help center and developer docs (Fumadocs, static, with search and a generated API reference) linked from the app; the unfurling-leaf logo with icons for web, email and mobile ([ADR-0016](../adr/0016-docs-site.md), [brand](brand.md)).
- **Deploy readiness:** production compose stack, pinned images, approval gate, smoke test, [Dokploy runbook](../infrastructure/dokploy-runbook.md).
- **Quotes know their project:** an accepted quote links to the project started from it (one per quote), on the web and the phone.
- **Rich contract editor:** contracts and templates are written in a WYSIWYG editor (headings, lists, bold, italic, links, rules, merge-field chips, paste from Word or Google Docs, a Source tab). It still saves the same Markdown, so PDFs, the portal and signature evidence are unchanged.
- **Mobile app** ([ADR-0017](../adr/0017-mobile-app-expo-native-auth.md)): sign in, workspaces, Home, the timer and time entries, invoices and payments, quotes, contracts, clients and projects, expenses with receipt photos, and timesheet approvals in both directions.
- **Push notifications** ([ADR-0018](../adr/0018-push-notifications-expo.md)): through Expo's push service, behind a provider interface. Quotes answered, contracts signed, payments and proofs, timesheets submitted, and your own week reviewed; each type can be turned off per person.

## Next, in order

Production deploy is on hold until there's budget for it (see [On hold](#on-hold)). Until then, build in this order:

1. **Turn on real push delivery** (needs the owner's accounts): `eas init` and commit the project id, add `google-services.json` and the FCM key, upload the APNs key with `eas credentials`, and set `PUSH_PROVIDER=expo` on the worker. Steps: `apps/mobile/README.md`.
2. **Test the app on Android**, with real pushes: push, timesheet approvals and submitting your week (#85–#88) were tested on the iOS simulator only. Also check what the simulator couldn't: tapping a push while the app is closed, switching workspace from a push, and removing the push token on sign-out.
3. **Small follow-ups** (table below), when someone needs them.

## On hold

- **App store release.** EAS builds, store listings and screenshots, and the Apple and Google developer accounts. After the production deploy, since the app needs a public API.
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

- **Integrations:** Zapier/Make templates built on the webhooks and API keys.
- **OAuth applications:** third-party apps that other workspaces connect with a consent screen (client ID/secret, redirect URLs, per-app revocation), reusing API-key scopes.
- **Teams/agencies:** per-seat pricing.
- **i18n:** translated UI, emails and PDFs, if a market needs it.

### Time tracking, later tier

- **Reminders:** idle detection and reminders (needs a browser extension or desktop app).

## Small follow-ups

| Item                    | Notes                                                                       | Size |
| ----------------------- | --------------------------------------------------------------------------- | ---- |
| Past-due banner (other) | For a future online provider's `past_due` status (manual plans have theirs) | S    |
| Writing on mobile       | Create and edit invoices, quotes and contracts in the app (now web-only)    | L    |
