# Dokploy runbook

Step by step from an empty server to Billleaf running in production, and then the everyday tasks: deploy, roll back, restore, rotate secrets.

Background (what Dokploy is, costs, sizing): [Hosting playbook](hosting-playbook.md). Deploy rules: [Deployment](deployment.md).

> Dokploy's menus move a little between versions. Where a label here doesn't match your screen exactly, look for the same idea nearby.

**Time:** about 1–2 hours the first time. **You need:** a domain on Cloudflare, a GitHub account with this repo, a card for the VPS.

Throughout, replace `example.com` with your domain and `your-github-user` with the GitHub owner of the repo, in lower case. Container names below (`billleaf-production-api-1` …) assume the default project name; check `docker ps` for the exact names on your server.

---

## 1. Server

1. **Create a VPS:** Ubuntu 24.04, 4 GB RAM or more (Hetzner CX33 or a 4 GB DigitalOcean droplet). Add your **SSH key** while creating it; don't use password login.
2. **Firewall** (provider firewall, or `ufw` on the server): allow **22, 80, 443** from anywhere, and **3000** from your IP only. Port 3000 is the Dokploy dashboard until it gets its own domain in step 2.
3. **Log in and update:**

   ```bash
   ssh root@<server-ip>
   apt update && apt -y upgrade && apt -y install unattended-upgrades
   dpkg-reconfigure -plow unattended-upgrades
   ```

4. **Swap** (a safety net on small servers):

   ```bash
   fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
   echo '/swapfile none swap sw 0 0' >> /etc/fstab
   ```

5. Turn off password SSH: in `/etc/ssh/sshd_config` set `PasswordAuthentication no`, then `systemctl reload ssh`.

## 2. Dokploy

1. Install it (this also installs Docker):

   ```bash
   curl -sSL https://dokploy.com/install.sh | sh
   ```

2. Open `http://<server-ip>:3000` and create the **admin account**. Use a strong password and turn on **2FA** under your profile.
3. **Give the dashboard a domain:** create a DNS record `dokploy.example.com` → server IP (see step 3). In Dokploy go to **Settings → Server / Web Server → Domain**, enter it, and enable HTTPS (Let's Encrypt).
4. Once `https://dokploy.example.com` works, **close port 3000** in the firewall.
5. **Settings → Cleanup:** enable the daily cleanup of unused images, so old images don't fill the disk.

## 3. Cloudflare DNS

In Cloudflare → your domain → **DNS**, add **A** records to the server IP:

| Name                         | Purpose                |
| ---------------------------- | ---------------------- |
| `app`                        | web (production)       |
| `api`                        | API (production)       |
| `dokploy`                    | Dokploy dashboard      |
| `app.staging`, `api.staging` | staging, if you run it |

1. Create them as **DNS only (grey cloud)** at first. Let's Encrypt needs to reach the server directly to issue the first certificates.
2. After the first successful deploy (step 9), switch them to **Proxied (orange cloud)**. Set **SSL/TLS → Overview → Full (strict)**.
3. Optionally, **Security → Bots:** turn on Bot Fight Mode.

## 4. Cloudflare R2 (files and backups)

1. **R2 → Create bucket** (twice), both private, location Automatic:
   - `billleaf-production` for app files;
   - `billleaf-production-backups` for database dumps.
2. **R2 → Manage API tokens → Create API token**, twice, each with **Object Read & Write** on **one bucket only**. Note the access key ID, the secret, and the S3 endpoint `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`.
   - The **app** token is for `billleaf-production` and goes in `S3_*`.
   - The **backup** token is for `billleaf-production-backups` and goes in `BACKUP_*`.

   With separate tokens, a leaked app key can't delete your backups.

3. Optionally, on the backups bucket add a **lifecycle rule** to delete objects after 30 days, as a second line of defence besides `BACKUP_RETENTION_DAYS`.

## 5. Email (Resend)

1. In Resend, go to **Domains → Add domain** (e.g. `example.com`). Add the DNS records it shows (SPF, DKIM, and a DMARC TXT `v=DMARC1; p=none`) in Cloudflare as **DNS only**, then wait for **Verified**.
2. **API Keys → Create** with sending access.
3. Your values:
   - `SMTP_URL=smtps://resend:<API_KEY>@smtp.resend.com:465`
   - `EMAIL_FROM="Billleaf <no-reply@example.com>"`

## 6. Let the server pull images from GHCR

Skip this if the packages are public.

1. In GitHub go to **Settings → Developer settings → Personal access tokens (classic)**. Create a token with only **`read:packages`**, with no expiry or a long one, and set a reminder to rotate it.
2. On the server, log Docker in once (the credentials are saved for root, which Dokploy uses):

   ```bash
   echo '<TOKEN>' | docker login ghcr.io -u your-github-user --password-stdin
   ```

3. Also add the same registry in Dokploy under **Settings → Registry** (`ghcr.io`, user, token). Dokploy uses it for single-image applications.

## 7. GitHub: environments, variables, secrets

All of these are in the repo's **Settings**.

1. **Environments:** create `staging` and `production`. On `production`, add **Required reviewers** (yourself), so a release waits for your click.
2. **Secrets and variables → Actions → Variables** (repository variables):

   | Name                        | Example                               |
   | --------------------------- | ------------------------------------- |
   | `PRODUCTION_WEB_URL`        | `https://app.example.com`             |
   | `PRODUCTION_API_URL`        | `https://api.example.com`             |
   | `PRODUCTION_WEB_SENTRY_DSN` | (optional) Sentry DSN for the browser |
   | `STAGING_WEB_URL`           | `https://app.staging.example.com`     |
   | `STAGING_API_URL`           | `https://api.staging.example.com`     |
   | `STAGING_WEB_SENTRY_DSN`    | (optional)                            |

3. **Environments → production → Environment secrets** (and the same for staging):
   - `DOKPLOY_WEBHOOK`: added in step 8.
   - `HEALTH_CHECK_TOKEN`: generate it with `openssl rand -base64 36`. Use the same value in Dokploy.

## 8. The Billleaf app in Dokploy

1. **Projects → Create project** `billleaf-production`.
2. In it, **Create service → Compose**, named `billleaf`.
3. **General → Provider:** **GitHub** (connect the GitHub app and pick this repo), or **Git** with the repo URL plus a deploy key.
   - **Branch:** `main`.
   - **Compose path:** `./infra/docker-compose.prod.yml`.
   - **Compose type:** Docker Compose (not Stack).
   - Turn **Autodeploy off**. Deploys come from the GitHub workflow (after tests and approval), not from every push.
4. **Environment:**
   - Copy [`infra/.env.production.example`](../../infra/.env.production.example) and fill in every value.
   - Generate secrets with `openssl rand -base64 48`.
   - Set `IMAGE_TAG=production` and `STACK_NAME=production`.
   - Use the same `HEALTH_CHECK_TOKEN` as in GitHub.
   - Save.
5. **Domains → Add domain**, twice:
   - `app.example.com` → service **web**, port **3000**, HTTPS on, certificate **Let's Encrypt**;
   - `api.example.com` → service **api**, port **4000**, HTTPS on, Let's Encrypt.

   Dokploy adds the routing labels and its network to those services.

6. **Deployments** (or **General → Webhook**): copy the **webhook URL** into the GitHub `production` environment secret `DOKPLOY_WEBHOOK`.
7. **Backups:** the stack's `backup` service already dumps Postgres nightly to R2. Dokploy's own database backups only cover databases created as Dokploy services, so they aren't needed here.

**Staging (optional, same server):** repeat step 8 in a project `billleaf-staging` with these changes:

- `STACK_NAME=staging` and `IMAGE_TAG=staging`;
- the staging URLs and domains;
- its own R2 buckets, tokens and secrets;
- its webhook in the GitHub `staging` environment.

## 9. First deploy

1. In GitHub go to **Actions → Deploy → Run workflow**, choose **production** (or staging first), and approve when asked.
2. The workflow does four things:
   - builds `billleaf-api` and `billleaf-web`;
   - points the `production` tag at the new build;
   - calls Dokploy, which pulls the images, runs `migrate`, then starts api, worker and web, switching traffic only when they're healthy;
   - runs the **smoke test** until the new version answers: health, sign-in page, auth + CORS, then the deep check (database, Redis, R2 round-trip, PDF, queue, worker).
3. The workflow summary shows the version. Open `https://app.example.com`, **sign up** (your owner account) and create your workspace.
4. Switch the Cloudflare records to **Proxied** (step 3.2).
5. **Run a restore drill now**, while there's nothing to lose. See [Backup & restore](backup-restore.md).

## 10. Everyday tasks

| Task                    | How                                                                                                                                                                                                                                                              |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Release**             | Merge to `main`, then push a tag: `git tag v0.2.0 && git push origin v0.2.0`. Approve in **Actions**. The smoke test confirms it.                                                                                                                                |
| **Deploy staging**      | **Actions → Deploy → Run workflow → staging**.                                                                                                                                                                                                                   |
| **Roll back**           | Dokploy → app → **Environment**: set `IMAGE_TAG=production-sha-<previous 7 chars>` (tags are listed in the workflow summaries), save, **Deploy**. Later, set it back to `production`. Migrations are backward compatible, so the old app runs on the new schema. |
| **Logs**                | Dokploy → app → **Logs** (pick the service), or `docker logs -f billleaf-production-api-1` on the server.                                                                                                                                                        |
| **Is it healthy?**      | `curl https://api.example.com/health`, or run `infra/smoke.sh` locally with `API_URL`, `WEB_URL` and `HEALTH_CHECK_TOKEN` set.                                                                                                                                   |
| **Restart one service** | Dokploy → app → **Services** → restart, or `docker restart billleaf-production-worker-1`.                                                                                                                                                                        |
| **Change a setting**    | Dokploy → **Environment** → edit → save → **Deploy**. Env changes need a redeploy.                                                                                                                                                                               |
| **Rotate a secret**     | Generate a new one, update it in Dokploy (and in GitHub for `HEALTH_CHECK_TOKEN`), then redeploy. Rotating `BETTER_AUTH_SECRET` signs everyone out.                                                                                                              |
| **Update Dokploy**      | Dokploy → **Settings → Updates**. Check the release notes first.                                                                                                                                                                                                 |
| **Disk filling up**     | Dokploy **Cleanup**, or `docker system prune -af` (removes stopped containers and unused images, never volumes). Check `df -h`.                                                                                                                                  |
| **Database shell**      | `docker exec -it billleaf-production-postgres-1 psql -U billleaf billleaf`                                                                                                                                                                                       |
| **Restore a backup**    | [Backup & restore](backup-restore.md).                                                                                                                                                                                                                           |

## 11. Troubleshooting

| Symptom                                           | Likely cause and fix                                                                                                                                                          |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deploy fails at `migrate`                         | Read the `migrate` logs. A migration error leaves the old version running. Fix it forward in a new release.                                                                   |
| `required variable … is missing a value`          | A variable from `.env.production.example` isn't set in Dokploy.                                                                                                               |
| `pull access denied` / `unauthorized` for ghcr.io | Step 6 isn't done, or the token expired: run `docker login ghcr.io` again on the server.                                                                                      |
| Certificate errors right after setup              | The DNS records were proxied before Let's Encrypt issued certificates. Set them to DNS-only, redeploy, wait a minute, then turn the proxy back on with SSL **Full (strict)**. |
| Signed in on app but API says unauthorised        | `COOKIE_DOMAIN` must be `.example.com` (leading dot), and `WEB_URL`/`API_URL` must be the real `https://` URLs.                                                               |
| Smoke test: "does not allow origin"               | `WEB_URL` in Dokploy doesn't match the browser URL exactly (scheme, sub-domain, no trailing slash).                                                                           |
| Smoke test: deep check `worker` down              | Check the worker logs. Usually Redis is unreachable or the worker crashed at boot (a missing env var).                                                                        |
| Smoke test: deep check `storage` down             | R2 endpoint, bucket name or token scope is wrong (`S3_*`).                                                                                                                    |
| Smoke test waits, then "not serving …"            | Dokploy didn't redeploy (check the webhook secret and Dokploy → Deployments), or the new containers are unhealthy (logs).                                                     |
| Emails not arriving                               | Worker logs show the SMTP error. Check that the Resend domain is verified and `EMAIL_FROM` uses that domain.                                                                  |
