# End-to-end tests (Playwright)

Critical journeys in a real browser against the real stack:

| Test                  | Journey                                                                                                                |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `auth.spec.ts`        | Sign up → verification email (Mailpit) → workspace → sign out and in                                                   |
| `invoicing.spec.ts`   | Client → quote → mark sent → email → client accepts in the portal → invoice → issue + email → record payment → receipt |
| `time.spec.ts`        | Timer start/stop → calendar drag-to-create → timesheet total → invoice unbilled time                                   |
| `permissions.spec.ts` | Invite by email → invitee signs up and joins as Member → owner-only settings hidden, API returns 403                   |
| `mobile.spec.ts`      | Phone width (Pixel 7): main pages don't scroll sideways, drawer menu, calendar in day view                             |

## Run

```bash
pnpm infra:up                          # Postgres, Valkey, S3, Mailpit
pnpm --filter e2e browsers             # once: Playwright's Chromium
pnpm test:e2e                          # builds the API, then runs everything
pnpm --filter e2e test:e2e:ui          # Playwright UI mode
```

It runs **next to `pnpm dev`** without touching dev data:

- API + worker on **:4100** with their own database **`billleaf_e2e_test`** (wiped and migrated at the start of every run) and Valkey database **5**;
- web on **:3100**, a production build in **`apps/web/.next-e2e`** (`NEXT_DIST_DIR`), so it never clashes with `next dev`;
- shares Postgres, Valkey, S3 and Mailpit from `infra:up`.

`support/stack.ts` starts the API side (Playwright's `webServer`); `support/env.ts` holds the ports and environment. Override with `E2E_DATABASE_URL`, `E2E_REDIS_URL`, `E2E_SMTP_URL`, `E2E_S3_ENDPOINT`, `MAILPIT_URL`. `E2E_DEBUG=1` shows API/worker output. A local run reuses a web server already on :3100; stop it after changing web code so it rebuilds.

## Writing tests

- Each test creates its own users and workspaces (`support/accounts.ts`) — never rely on another test's data.
- Set-up that isn't the journey under test can use the API (`support/api.ts`) or the database (`support/db.ts`: verify an email, change a plan).
- Read emails with `waitForEmail` / `linkIn` (`support/mailpit.ts`).
- Prefer roles and labels (`getByRole`, `getByLabel`) — the same names screen readers use. Add a `data-*` hook only when there's no accessible name (e.g. calendar day columns: `[data-day="2026-11-17"]`).

On CI (`.github/workflows/ci.yml`, job `e2e`) a failing run uploads the Playwright report and traces as an artifact.
