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

**Exit:** a freelancer can run their invoicing on Billleaf end-to-end. Remaining before calling Phase 1 shipped: production deploy (VPS + Dokploy + R2 bucket). PDFs embed Noto Sans (Latin/Greek/Cyrillic/Vietnamese), Noto Sans Thai and Noto Sans Myanmar; CJK fonts are a follow-up.

## Phase 2 — Connected work _(in progress)_

- ✅ Projects & tasks (task board, assignees, start a project from an accepted quote).
- ✅ Time tracking (global timer, week timesheet, manual entries) → billable time to invoice lines.
- ✅ Contracts (templates with merge fields, from a quote, PDF + email, recorded signatures; e-sign later).
- ✅ Recurring invoices (weekly → yearly, draft or auto-send, idempotent hourly generation, Pro/Team).
- ✅ SaaS billing core: plans, enforced limits, subscription lifecycle, signed webhooks, Settings → Billing, test provider ([ADR-0011](../adr/0011-billing-core-with-test-provider.md)).
- **SaaS billing live**: Paddle or Lemon Squeezy adapter once the company's jurisdiction is settled.

## Phase 3 — Teams & growth

- Teams/agencies: per-seat plans, custom roles exposed.
- Client portal (view/accept quotes, pay invoices).
- Online payments (Stripe/PayPal payment links).
- Audit log UI.
- Integrations & outgoing webhooks.
- i18n.

## Phase 4 — Mobile

- Expo / React Native app in `apps/mobile`, reusing `packages/contracts`, `packages/api-client`, and Better Auth's Expo client — no API changes.
- Focus: timers, quick invoices, notifications.

Related: [Modules](modules.md) · [Business model](business-model.md)
