# Environments

|                | **local**                  | **staging**                                       | **production**                |
| -------------- | -------------------------- | ------------------------------------------------- | ----------------------------- |
| Where          | Developer machine          | Same VPS, separate Dokploy project/stack          | VPS (Dokploy)                 |
| Web            | `localhost:3000`           | `app.staging.billleaf.com`                        | `app.billleaf.com`            |
| API            | `localhost:4000`           | `api.staging.billleaf.com`                        | `api.billleaf.com`            |
| Docs           | `localhost` (Fumadocs dev) | Vercel preview                                    | `docs.billleaf.com` (Vercel)  |
| Postgres       | docker compose             | own container + own DB/credentials                | own container (later own VPS) |
| Valkey         | docker compose             | own container                                     | own container                 |
| Storage        | SeaweedFS (S3, :8333)      | R2 bucket `billleaf-staging`                      | R2 bucket `billleaf-prod`     |
| Email          | Mailpit (`localhost:8025`) | Resend (restricted / test domain)                 | Resend                        |
| Billing        | provider sandbox           | provider sandbox                                  | provider live                 |
| Deploy trigger | —                          | push to `main`                                    | tag `v*` + manual approval    |
| Data           | seed data                  | seed + anonymized fixtures, **never prod copies** | real                          |

Hostnames are indicative until the domain is confirmed.

## Local setup

```bash
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp packages/db/.env.example packages/db/.env
pnpm install
pnpm infra:up          # postgres, valkey, s3 (seaweedfs), mailpit
pnpm db:migrate && pnpm db:seed
pnpm dev               # web :3000, api :4000
```

## Configuration & secrets

- Each app validates its env with Zod at boot (`@workspace/env`) and **fails fast** on missing/invalid values.
- `.env.example` files list every variable with safe dev defaults; real `.env` files are never committed.
- Staging/production secrets live in **Dokploy environment settings** (per app). CI secrets live in GitHub Environments (`staging`, `production`).
- Key variables (api): `DATABASE_URL`, `REDIS_URL`, `BETTER_AUTH_SECRET`, `API_URL`, `WEB_URL`, `TRUSTED_ORIGINS`, `COOKIE_DOMAIN`, `GOOGLE_CLIENT_ID/SECRET`, `SMTP_URL`/Resend key, `EMAIL_FROM`, S3/R2 credentials, billing provider keys, `SENTRY_DSN`.
- `BETTER_AUTH_SECRET` and DB passwords differ per environment; rotate on staff changes.
