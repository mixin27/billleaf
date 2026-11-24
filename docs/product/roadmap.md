# Roadmap

Phases are scope buckets, not dates. Each phase ends with a production deploy. Concrete next items and their order: [Future plan](future-plan.md).

## Phase 0 — Foundation _(done)_

- Docs, ADRs, agent guidance (`AGENTS.md`, `.claude/skills/`).
- Tooling: pnpm + Turborepo, lefthook, commitlint, CI.
- Packages: `db`, `contracts`, `env`, `api-client`, `emails` (stub).
- API skeleton: Better Auth (email/password, verification, Google, 2FA, organizations as workspaces), dynamic RBAC, `/health`, OpenAPI, BullMQ worker.
- Web shell: auth pages, workspace switcher, settings → roles UI skeleton.
- Local docker stack (Postgres, Valkey, SeaweedFS S3, Mailpit), deployment docs.

**Exit:** sign up → verify email → workspace with Owner → custom role → permission-guarded endpoint returns 403/200 correctly.

## Phase 1 — MVP _(feature-complete)_

- ✅ Workspace profile & branding (logo, colors, address, tax IDs, default currency, timezone, terms).
- ✅ Clients & contacts.
- ✅ Quotes (send, accept/decline, PDF, email, convert to invoice).
- ✅ Invoices: PDF, email, gap-free numbering, per-line tax, multi-currency, derived statuses (open/overdue/partially paid/paid/void).
- ✅ Payments (manual recording, refunds) & receipts (PDF, email).
- ✅ Dashboard: outstanding & overdue, aging, received this month vs last, 6-month revenue, open quotes, most overdue, recent payments — per currency, filtered by permission.

**Exit:** a freelancer can run their invoicing on Billleaf end-to-end. Remaining before calling Phase 1 shipped: production deploy (VPS + Dokploy + R2 bucket). PDFs embed Noto Sans (Latin/Greek/Cyrillic/Vietnamese), Noto Sans Thai and Noto Sans Myanmar, plus Noto Sans CJK (SC/TC/JP/KR) fetched on first use.

## Phase 2 — Connected work _(in progress)_

- ✅ Projects & tasks (task board, assignees, start a project from an accepted quote).
- ✅ Time tracking (global timer, week timesheet, manual entries) → billable time to invoice lines.
- ✅ Contracts (templates with merge fields, from a quote, PDF + email, recorded signatures; e-signed in the client portal), written in a rich editor that saves the same Markdown.
- ✅ Recurring invoices (weekly → yearly, draft or auto-send, idempotent hourly generation, Pro/Team).
- ✅ SaaS billing core: plans, enforced limits, subscription lifecycle, signed webhooks, Settings → Billing, test provider ([ADR-0011](../adr/0011-billing-core-with-test-provider.md)).
- ✅ Payment instructions on invoices (bank / wallet / QR) and proof of payment from the client portal.
- ✅ SaaS billing live with **manual payments**: pay by bank or wallet, upload proof, platform admin approves; reminders and a 7-day grace period ([ADR-0013](../adr/0013-manual-payments-for-subscriptions.md)).
- ✅ Platform admin portal: workspaces, users (ban, impersonate), jobs, audit log, approvals, pricing.
- ✅ Launch readiness: public home and pricing pages, Terms and Privacy, data export and workspace deletion.
- ✅ Payment reminders for unpaid invoices; users can delete their own account.
- ✅ Time tracking rates and budgets: rate hierarchy, cost rates and profit, project estimates with alerts.
- ✅ Credit notes for issued invoices (partial or full, refund due when already paid).
- ✅ Expenses with receipts (photo or PDF), categories, billable expenses onto client invoices, and a profit & loss report with a tax summary.
- Online subscription payments when a provider serves the operating country.

## Phase 3 — Teams & growth

- Teams/agencies: per-seat plans, custom roles exposed.
- ✅ Client portal (view/accept quotes, sign contracts, upload payment proof).
- Online invoice payments (payment links) where a gateway is available.
- ✅ Audit log UI (workspace and platform).
- ✅ Outgoing webhooks ([ADR-0014](../adr/0014-outgoing-webhooks.md)) and the Developer API with workspace API keys ([ADR-0015](../adr/0015-workspace-api-keys.md)); OAuth apps and Zapier/Make templates later.
- i18n.

## Phase 4 — Mobile _(feature-complete)_

- ✅ Expo / React Native app in `apps/mobile`, reusing `packages/contracts`, `packages/api-client`, and Better Auth's Expo client. The API adds one auth plugin (`expo`) and trusts the app scheme ([ADR-0017](../adr/0017-mobile-app-expo-native-auth.md)).
- ✅ Time: the timer (with a forgotten-timer reminder), favourites, logging and editing entries, a day at a time.
- ✅ Getting paid: invoices (share the PDF, email, record a payment and send the receipt), quotes (send, record the answer, invoice or start a project), and contracts (send, record a signature, decline, void).
- ✅ Clients and projects (tasks, invoicing unbilled time) and expenses with receipt photos.
- ✅ Push notifications through Expo's push service: quotes answered, contracts signed, payments and proofs, timesheets submitted and reviewed, each switchable per person ([ADR-0018](../adr/0018-push-notifications-expo.md)).
- ✅ Timesheet approvals: members submit and withdraw their week; approvers approve, send back or reopen.
- Writing documents (invoices, quotes, contracts) stays on the web.

**Exit:** the app is in the App Store and Google Play. Remaining: real push delivery (an EAS project plus Apple and Firebase keys), testing on Android, and store builds and listings.

Related: [Modules](modules.md) · [Business model](business-model.md)
