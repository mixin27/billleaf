# Security Checklist

Review before first production launch and quarterly after.

## Server

- [ ] SSH key-only, root login disabled, non-default user with sudo.
- [ ] Firewall: only 22 (restricted IPs if possible), 80, 443 open; Postgres/Valkey **not** exposed publicly.
- [ ] Origin accepts HTTP(S) only from Cloudflare IP ranges (or Cloudflare Tunnel).
- [ ] Unattended security upgrades; fail2ban/CrowdSec.
- [ ] Dokploy dashboard behind strong auth + 2FA, ideally restricted IP.
- [ ] Docker images run as non-root; minimal base images; Dependabot + image scanning in CI.

## Edge & transport

- [ ] Cloudflare SSL _Full (strict)_, HSTS, TLS ≥ 1.2.
- [ ] WAF managed rules; rate limiting on `/api/auth/*`.
- [ ] Security headers on web: CSP, `X-Content-Type-Options`, `Referrer-Policy`, `frame-ancestors`.

## Auth & sessions

- [ ] `BETTER_AUTH_SECRET` ≥ 32 random chars, unique per environment.
- [ ] Cookies `Secure`, `HttpOnly`, `SameSite=Lax`, domain `.billleaf.com`.
- [ ] `TRUSTED_ORIGINS` limited to known web origins; CORS allows only those with credentials.
- [ ] Email verification required before workspace actions; 2FA available and enforced for platform admins.
- [ ] Brute-force protection / throttling on sign-in, OTP, password reset.

## Authorization & tenancy

- [ ] Every non-public endpoint has `@RequirePermission` (test enforces it).
- [ ] Every repository query scoped by `workspace_id`; cross-tenant tests in CI.
- [ ] Platform admin endpoints separate and audited.
- [ ] `PLATFORM_ADMIN_EMAILS` lists only current staff; each admin has 2FA on (the portal refuses without it).
- [ ] Review `admin.*` entries in the audit log (impersonations, bans, plan changes) monthly.
- [ ] Sensitive actions written to `audit_logs`.

## Outgoing requests

- [ ] `WEBHOOKS_ALLOW_PRIVATE_URLS` is unset or `false` in production (webhooks reach only public `https://` addresses; checked at connect time, no redirects) — [ADR-0014](../adr/0014-outgoing-webhooks.md)

## Data

- [ ] Postgres least-privilege app role (no superuser); separate migrate role.
- [ ] Backups encrypted, key off-box; restore drill done ([runbook](backup-restore.md)).
- [ ] File uploads: size/type limits, private R2 bucket, signed URLs with short expiry.
- [ ] PII minimized in logs; Pino redaction configured.
- [ ] Webhooks: signature verification on raw body + idempotency.

## Secrets & supply chain

- [ ] No secrets in git (pre-commit/CI secret scan, e.g. gitleaks).
- [ ] GitHub: branch protection on `main`, required checks, 2FA for org members, least-privilege tokens.
- [ ] Lockfile committed; Dependabot enabled; review new dependencies.

## Privacy & compliance

- [ ] Terms (`/terms`) and Privacy Policy (`/privacy`) reviewed for the operating country, `SUPPORT_EMAIL` set; DPA template; no cookie banner needed while only essential cookies are used.
- [ ] Data export and workspace deletion (Settings → Data) and account deletion (Your account) tested on production.
- [ ] Billing via manual payments (ADR-0013): no card data touches our servers; payment screenshots stay private (presigned URLs).
