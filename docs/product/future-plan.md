# Future plan

Work we've agreed to do later, with enough detail to pick up without re-research. The [roadmap](roadmap.md) lists phases; this page holds the next concrete items and their order.

**Done:** Clockify-style time tracking: tracker (timer bar, tags, entries without a project, continue/duplicate, bulk edit), weekly timesheet grid, Summary/Detailed/Weekly reports with CSV export, and Clockify CSV import. Client portal, part 1 (magic-link sign-in, read-only quotes/contracts/invoices/receipts, portal links in document emails; [ADR-0012](../adr/0012-client-portal-magic-links.md)). Client portal, part 2: quotes accepted or declined online; contracts e-signed by typed name, with a signature certificate on the PDF; the business is notified. Next: production deploy readiness, then online invoice payments.

**Suggested order afterwards:** Client portal → Production deploy readiness → Online invoice payments → small follow-ups as capacity allows. The billing provider adapter goes in whenever the company's jurisdiction is settled.

---

## Client portal (recommended next)

**Goal:** clients act on documents themselves instead of the freelancer recording outcomes by hand.

**Scope:**

- A magic-link or tokenised portal per client, scoped to one workspace, read-only by default.
- View and **accept or decline quotes**. This replaces "mark accepted" and records who accepted and when.
- View and **sign contracts** (typed-name e-sign with IP, user agent and timestamp; signed PDF with an audit trail page). This replaces "record signature".
- View invoices, receipts and payment history; download PDFs.
- Branded with the workspace logo and colour (paid plans), "Made with Billleaf" on Free.
- Emails link to the portal instead of only attaching PDFs.

**Depends on:** nothing new. It reuses the document services, snapshots and entitlements (`portal.enabled` flag for Team).

**Size:** large. Part 1 (done): sign-in, sessions, read-only documents and PDFs, email links. Part 2 (done): accept/decline quotes and typed-name e-sign for contracts (IP, user agent, timestamp, signature certificate on the signed PDF).

## Production deploy readiness

**Status:** the repo side is ready:

- the hardened compose stack and a production env template;
- pinned image tags, an approval gate and GHCR cleanup;
- a smoke test with a deep health check;
- the [Dokploy runbook](../infrastructure/dokploy-runbook.md).

What remains is the deploy session itself (VPS, Dokploy, DNS, R2, email), done by the founder with the runbook.

**Goal:** Phase 1 counts as shipped once it runs on the VPS (Dokploy + Cloudflare R2).

**Scope:**

- Review `infra/docker-compose.prod.yml` and the web/api/worker images: healthchecks, resource limits, non-root users.
- Run migrations as a one-off `migrate` job before the API rolls.
- A post-deploy smoke test script: health, sign-in, PDF render, email enqueue, storage round-trip.
- Walk through `docs/infrastructure/deployment.md` and the backup/restore runbook end to end, then fix the gaps.
- Production env checklist: secrets, `BILLING_PROVIDER`, `COOKIE_DOMAIN`, Sentry, SMTP provider, R2 bucket and CORS.

**Depends on:** access to the VPS and Dokploy (done by the founder; we prepare everything in the repo).

**Size:** medium (1 PR + a deploy session).

## SaaS billing provider adapter

**Goal:** take real subscription payments. See [ADR-0011](../adr/0011-billing-core-with-test-provider.md).

**Scope:**

- A `PaddleBillingProvider` or `LemonSqueezyBillingProvider` implementing `BillingProvider`: checkout, portal, change plan, webhook verification and normalisation.
- Map provider prices to `PLANS`, set final prices, and add the env vars and webhook URL in production.
- An app-wide "payment failed" banner for past-due workspaces.

**Depends on:** choosing the provider (company jurisdiction).

**Size:** medium (1 PR).

## Online invoice payments

**Goal:** a freelancer's clients pay invoices online.

**Scope:**

- Payment links on invoices and in the portal (Stripe and/or PayPal Connect accounts owned by the freelancer).
- Webhooks record payments and issue receipts automatically; an optional small platform fee.
- Partial payments, currency support per provider, and refunds synced back.

**Depends on:** the client portal; the provider's availability per freelancer country.

**Size:** large.

## Small follow-ups

| Item            | Notes                                                          | Size |
| --------------- | -------------------------------------------------------------- | ---- |
| Past-due banner | Show billing problems app-wide, not only on Settings → Billing | S    |
| Audit log UI    | Settings → Audit log over `audit_logs` (filters, `audit.read`) | S–M  |
| CJK PDF fonts   | Noto Sans SC/JP/KR subsets on demand; keep image size in check | S    |
| E-sign          | Comes with the client portal (typed signature + audit trail)   | —    |

## Later (Phase 3+)

- **Outgoing webhooks and integrations:** signed event deliveries (invoice issued, payment recorded, …) with retries and a delivery log; Zapier/Make templates.
- **i18n:** translated UI (start with Burmese, Thai, Vietnamese), localised emails and PDFs.
- **Teams/agencies:** per-seat pricing and approvals.

## Time tracking — later tier

After core Clockify parity (tracker, timesheet grid, tags, reports, CSV export, Clockify import):

- Calendar view (drag to create and resize entries).
- Billable rate hierarchy: workspace → member → project (→ task), with cost rates for profitability.
- Project estimates (hours or money) with budget progress and alerts.
- Favorites / pinned entries, and keyboard shortcuts.
- Idle detection and reminders (a browser extension or desktop app later).
- Rounding rules for reports and invoicing (e.g. up to 15 minutes).
- Timesheet approvals (submit week → approve/reject) and locked periods.
- Imports from Toggl and Harvest CSVs, reusing the Clockify importer.
- Import history with "undo this import" (entries already carry `import_batch_id`), and a background job for files beyond today's 10 MB / 50,000-row limit.
