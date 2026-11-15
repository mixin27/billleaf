# Hosting playbook: a SaaS on one VPS with Dokploy

A reusable guide for running a small SaaS (a web app, an API, background workers, Postgres and Redis/Valkey) on your own server for **US$12–25 a month** until it has real traction.

It's written for Billleaf but applies unchanged to any containerised SaaS (for example a Next.js + Node app). [Billleaf specifics](#billleaf-specifics) at the end is the only project-specific part.

> **Prices** were checked in November 2026 and are list prices excluding VAT. Providers change them, and Hetzner raised prices twice in 2026, so re-check the [sources](#sources) before buying.

---

## 1. The setup at a glance

```
            Users
              │  HTTPS
              ▼
   Cloudflare (DNS, proxy, SSL, DDoS)          free
              │
              ▼
 ┌──────────── VPS (one server) ────────────────────────┐
 │  Dokploy (dashboard)  +  Traefik (HTTPS routing)      │
 │                                                       │
 │  app.example.com ──► web      (Next.js container)     │
 │  api.example.com ──► api      (Node container)        │
 │                      worker   (same image, jobs)      │
 │                      migrate  (runs once per deploy)  │
 │                      postgres + valkey (volumes)      │
 └───────────────────────────────────────────────────────┘
        │ files, nightly DB backups          ▲ pulls images
        ▼                                    │
  Cloudflare R2 (object storage)      GitHub Container Registry (GHCR)
                                             ▲ pushes images
                                      GitHub Actions (tests + build)
```

**The rule of the setup:** build images in CI and only _run_ them on the server. The VPS never compiles code, so a small server is enough and a deploy takes seconds.

---

## 2. Building blocks and why

| Concern                  | Choice                                                     | Why                                                                                                       | Alternatives                                      |
| ------------------------ | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Server                   | One VPS (Hetzner or DigitalOcean)                          | Cheapest predictable compute; everything in one place while small                                         | Managed PaaS (Render, Railway): 3–10× the cost    |
| Deploy and ops dashboard | **Dokploy**, self-hosted                                   | Free and open source. HTTPS, domains, env vars, zero-downtime deploys, rollbacks, logs, backups in one UI | Coolify (similar), plain `docker compose` + Caddy |
| Images                   | **GHCR**                                                   | Next to the code; free for public repos, within quota for private ones                                    | Docker Hub, DigitalOcean Container Registry       |
| CI                       | **GitHub Actions**                                         | Builds and tests on every PR; pushes an image on merge                                                    | —                                                 |
| DNS, SSL, DDoS           | **Cloudflare** (free)                                      | Hides the server IP, caches static files, free SSL                                                        | —                                                 |
| File storage and backups | **Cloudflare R2**                                          | S3-compatible, 10 GB free, **no download (egress) fees**                                                  | DigitalOcean Spaces ($5/mo), Backblaze B2, AWS S3 |
| Email                    | **Resend** (simple) or **Amazon SES** (cheapest at volume) | Free tier to start; SES is $0.10 per 1,000                                                                | Postmark, Mailgun                                 |
| Errors                   | **Sentry** (free Developer plan)                           | Stack traces from web, API and worker                                                                     | —                                                 |
| Docs or marketing site   | Same VPS, or Vercel Pro                                    | Vercel's free Hobby plan is for **non-commercial** use only                                               | Cloudflare Pages                                  |

---

## 3. How Dokploy works

Dokploy is a web app you install once on your VPS (one command). Under the hood it's **Docker Swarm + Traefik**: it runs your containers and routes your domains to them over HTTPS. If you stop using it, the same containers run with plain `docker compose`. There's no lock-in.

### Concepts

| Dokploy term       | What it means                                                                                                               |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| **Project**        | A folder, e.g. `billleaf-production`, `billleaf-staging`, `fom-production`. Each SaaS or environment gets its own.          |
| **Application**    | One container from an image (or built from Git). Has env vars, domains, health check and deploy history.                    |
| **Compose**        | A whole `docker-compose.yml` stack deployed as one unit. **We use this**: the same file we test locally runs in production. |
| **Database**       | Managed Postgres, MySQL, Redis and others with volumes and **scheduled backups to S3/R2**.                                  |
| **Domains**        | Map a hostname to a service and port. Traefik gets the Let's Encrypt certificate automatically.                             |
| **Environment**    | Env vars per app or compose, stored by Dokploy (never in Git).                                                              |
| **Registry**       | Saved credentials for pulling private images (a GHCR token with `read:packages`).                                           |
| **Deploy webhook** | A secret URL; calling it redeploys. GitHub Actions calls it after pushing a new image.                                      |
| **Deployments**    | History of every deploy, with logs. **Rollback** means redeploying an earlier one.                                          |
| **Monitoring**     | CPU, memory, disk and network per container and for the server.                                                             |
| **Remote servers** | Optional: one Dokploy dashboard can manage several VPSs over SSH, e.g. separate servers for two SaaS products.              |

### What a deploy looks like

1. You merge a PR. GitHub Actions runs the tests, builds the images and pushes them to GHCR as `sha-<commit>`.
2. Actions calls the Dokploy webhook with the new tag.
3. Dokploy pulls the images and runs the **migrate** container first. If it fails, the deploy stops and the old version keeps running.
4. Dokploy starts the new api/worker/web containers. Traefik switches traffic **only after the health check passes**, so there's no downtime.
5. To roll back, redeploy the previous tag. This is safe because migrations are always backward compatible (add columns first, remove them in a later release).

### What you still do yourself

- Harden the VPS once: SSH keys only, firewall (22, 80, 443), automatic security updates.
- Keep Dokploy updated (one click in the dashboard).
- Test restoring a backup every few months. An untested backup isn't a backup.

---

## 4. Costs

### 4.1 Server prices (November 2026)

| Plan                                | vCPU | RAM   | Disk   | Traffic | Price / month          |
| ----------------------------------- | ---- | ----- | ------ | ------- | ---------------------- |
| **Hetzner CX23** (EU)               | 2    | 4 GB  | 40 GB  | 20 TB   | ~€5.49 (+ €0.50 IPv4)  |
| **Hetzner CX33** (EU)               | 4    | 8 GB  | 80 GB  | 20 TB   | ~€8.49 (+ €0.50 IPv4)  |
| **Hetzner CX43** (EU)               | 8    | 16 GB | 160 GB | 20 TB   | ~€15.99 (+ €0.50 IPv4) |
| **DigitalOcean Basic** (any region) | 2    | 4 GB  | 80 GB  | 4 TB    | **$24**                |
| DigitalOcean Premium Intel          | 2    | 4 GB  | 80 GB  | 4 TB    | $32                    |

- Hetzner's cheapest line has at times been **temporarily unorderable** in 2026, so check the console.
- Hetzner's **US and Singapore** locations cost more and include much less traffic than the EU prices above.
- Hetzner server backups (daily snapshots, 7 kept) add 20% of the server price.

### 4.2 Everything else

| Item                       | Free allowance                                      | After that                                             |
| -------------------------- | --------------------------------------------------- | ------------------------------------------------------ |
| Dokploy (self-hosted)      | Free (open source)                                  | Optional Dokploy Cloud dashboard from $4.50/server/mo  |
| Cloudflare DNS, proxy, SSL | Free plan                                           | —                                                      |
| Cloudflare R2              | 10 GB storage, 1M writes, 10M reads / month         | $0.015/GB-month; egress always free                    |
| Resend                     | 3,000 emails/month (100/day)                        | $20/mo for 50,000                                      |
| Amazon SES                 | —                                                   | $0.10 per 1,000 emails                                 |
| Sentry                     | 5,000 errors/month                                  | Team plan                                              |
| GitHub Actions (private)   | 2,000 minutes/month (Free plan)                     | Per-minute billing, or GitHub Pro (3,000 min) at $4/mo |
| GHCR (private images)      | **500 MB** storage, 1 GB transfer/month (Free plan) | ~$0.25/GB; **delete old image tags automatically**     |
| Domain                     | —                                                   | ~$10–15/year                                           |

**About GHCR on the Free plan:** two images of ~300 MB each fill the 500 MB quota after one build. Either keep only the last ~10 tags with a cleanup workflow, make the packages public (fine if the image has no secrets), or move up to GitHub Pro or Team.

### 4.3 Monthly totals

| Stage                                          | Hetzner (EU) | DigitalOcean        |
| ---------------------------------------------- | ------------ | ------------------- |
| **Launch**: 1 VPS (4 GB), free tiers           | **~€6–7**    | **$24**             |
| **Comfortable**: 8 GB VPS + server backups     | **~€11**     | $48 + $9.60 backups |
| **With staging**: + a small staging VPS        | ~€17         | +$12–24             |
| **Growing**: 16 GB VPS, paid email, GitHub Pro | ~€45–55      | ~$110+              |

Add the domain (~$1/month). Payment-provider fees (Paddle/Lemon Squeezy ~5% + $0.50 per sale) only apply when you earn money.

### 4.4 Hetzner or DigitalOcean?

| You care most about…                              | Pick                                                                                                                 |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Lowest price per GB of RAM                        | **Hetzner EU**: roughly 3–4× more server for the money                                                               |
| Users mostly in Southeast Asia (latency)          | **DigitalOcean Singapore**, or Hetzner Singapore (pricier, less traffic). Test the latency from your users' country. |
| Managed extras (managed DB, Spaces, App Platform) | DigitalOcean                                                                                                         |
| Already set up and working                        | Stay; Dokploy runs the same on both                                                                                  |

Moving between them is easy with this setup: everything is containers, files are in R2, and the database moves with a backup and restore.

---

## 5. Sizing: will it fit?

Rough memory use for a typical Next.js + Node SaaS at low traffic:

| Container                  | RAM           |
| -------------------------- | ------------- |
| Dokploy + Traefik          | ~300–400 MB   |
| Postgres (small DB, tuned) | ~200–500 MB   |
| Valkey/Redis               | ~20–50 MB     |
| API (Node)                 | ~150–300 MB   |
| Worker (Node, PDFs, email) | ~150–400 MB   |
| Web (Next.js standalone)   | ~150–300 MB   |
| **Total**                  | **~1.2–2 GB** |

- **4 GB** (CX23 or the $24 droplet) runs one SaaS comfortably, with headroom for spikes and backups.
- **8 GB** (CX33) runs **two small SaaS products** side by side, e.g. Billleaf and another product, each in its own Dokploy project with its own Postgres.
- Add **2 GB of swap** on small servers as a safety net, never as a plan.
- Move Postgres to its own server once the database outgrows a few GB or CPU stays above ~60%.

**Two products on one server, the trade-off:** it's cheaper and there's one thing to maintain, but one product's spike or outage affects the other, and a server failure takes both down. Fine while small; split them once either has paying customers who'd notice.

---

## 6. From a manual droplet to Dokploy (migration path)

If you currently SSH in and run `docker pull` + `docker compose up` by hand with GHCR images (as on a $24 DigitalOcean droplet), Dokploy replaces the manual part, not the images.

**Recommended:** set up Dokploy on a fresh server, then switch DNS. There's no downtime and the old server stays as a fallback.

1. **New VPS** (Hetzner CX33, or a new droplet). Harden it, then install Dokploy:
   `curl -sSL https://dokploy.com/install.sh | sh`
   Open `http://<ip>:3000` and create the admin account.
2. **Registry:** add GHCR with a token that has only `read:packages`.
3. **Project and stack:** create a project, add a **Compose** service, and paste your production compose file. Set env vars in Dokploy, not in a file on the server.
4. **Data:** take a `pg_dump` on the old server, restore it into the new Postgres, and copy the uploaded files (or point both at the same R2 bucket).
5. **Domains:** add them in Dokploy. To test before switching DNS, point a temporary subdomain at the new server.
6. **Switch:** lower the DNS TTL beforehand, put the old app in maintenance mode (or accept a short window), take a final dump and restore, then point DNS at the new IP.
7. **Automate:** copy the Dokploy deploy webhook into a GitHub Actions secret and call it after the image push.
8. **Backups:** add a scheduled Postgres backup to R2 in Dokploy, then do a test restore.
9. Keep the old server for a week, then delete it.

**In place, on the same droplet:** possible, but Dokploy needs ports 80/443 and 3000. Stop the existing nginx/Caddy first and expect a short outage. Only worth it to avoid paying for two servers during the move.

---

## 7. Checklist for a new SaaS

Copy this per product (Billleaf, FOM Order Manager, …):

- [ ] **Images:** the CI pipeline builds and pushes `ghcr.io/<owner>/<product>-<service>:sha-<commit>`. **Never deploy `latest`.**
- [ ] **GHCR cleanup:** a workflow keeps the last N tags.
- [ ] **Compose file:** one `docker-compose.prod.yml` with:
  - a one-off `migrate` service that the app waits for;
  - health checks on every service;
  - non-root users;
  - memory limits;
  - named volumes for Postgres and Redis.
- [ ] **Health endpoint** (`/health`) on the API and web.
- [ ] **Env template:** an `.env.production.example` listing every variable, with no values in Git.
- [ ] **Dokploy:**
  - project `<product>-production` (and `-staging`);
  - registry credentials;
  - env vars;
  - domains;
  - the deploy webhook saved in GitHub secrets.
- [ ] **Cloudflare:** DNS records proxied (orange cloud), SSL mode **Full (strict)**.
- [ ] **R2:** one bucket per product per environment; CORS for browser uploads; a lifecycle rule for old backups.
- [ ] **Email:** domain verified (SPF, DKIM, DMARC) with Resend or SES.
- [ ] **Sentry:** a project per product, with the DSN in env vars.
- [ ] **Backups:** nightly Postgres backup to R2; **restore tested**.
- [ ] **Smoke test after each deploy:** health, sign-in, one write, email enqueued, file upload/download.
- [ ] **Runbook:** deploy, roll back, restore, rotate secrets.

---

## Billleaf specifics

- **Services** (`infra/docker-compose.prod.yml`):
  - `migrate`, `api` and `worker` all use the api image (`node dist/migrate.js`, `dist/main.js`, `dist/worker.js`);
  - `web` is Next.js standalone;
  - plus `postgres:17`, `valkey:8` and a `backup` job.
- **Domains:** `app.<domain>` → web:3000, `api.<domain>` → api:4000. Set `COOKIE_DOMAIN=.<domain>` so the session and client-portal cookies work across both.
- **Deploy order and rollback rules:** [Deployment](deployment.md). Backups: [Backup & restore](backup-restore.md). Hardening: [Security checklist](security-checklist.md).
- **Start with:** one Hetzner CX33 (8 GB) or the existing 4 GB droplet, Cloudflare in front, R2 for files and backups, Resend's free tier.
- **Known gaps:** the deploy-readiness work closes these:
  - the compose file falls back to `IMAGE_TAG=latest`, which should be a required, pinned tag;
  - there's no GHCR cleanup workflow;
  - there's no smoke-test script;
  - the deploy doc describes separate Dokploy apps, but we deploy the compose stack.

---

## Sources

Checked November 2026.

- **Hetzner:** [price changes in 2026](https://northflank.com/blog/hetzner-cloud-server-price-increases) · [plans and prices](https://trackvps.com/hetzner-cloud-pricing) · [EU price overview](https://www.eucloudcost.com/providers/hetzner/) · [orderability notes](https://sideship.moritarot.com/blogs/hetzner-price-rise-2026)
- **DigitalOcean:** [Droplet pricing](https://www.digitalocean.com/pricing/droplets) · [2 vCPU / 4 GB cost and bandwidth](https://www.fluence.network/blog/digitalocean-droplets-vs-fluence/) · [Basic Regular 4 GB](https://www.vpsbenchmarks.com/hosters/digitalocean/plans/std_4gb_2cores)
- **Dokploy:** [Cloud vs self-hosted](https://docs.dokploy.com/docs/core/differences) · [Dokploy Cloud](https://docs.dokploy.com/docs/core/cloud) · [pricing explained](https://massivegrid.com/blog/dokploy-pricing-explained-2026/)
- **Cloudflare R2:** [pricing](https://developers.cloudflare.com/r2/pricing/)
- **Email:** [Resend pricing](https://resend.com/pricing.md) · [SES vs Resend](https://costbench.com/compare/amazon-ses-vs-resend/)
- **GitHub:** [plans](https://docs.github.com/en/get-started/learning-about-github/githubs-plans) · [billing](https://docs.github.com/en/billing/using-the-billing-platform/about-billing-on-github)
- **Vercel:** [Hobby plan](https://vercel.com/docs/plans/hobby) · [Terms](https://vercel.com/terms)
