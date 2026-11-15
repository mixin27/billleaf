# infra

| File                      | Purpose                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------ |
| `docker-compose.dev.yml`  | Local Postgres 17, Valkey, SeaweedFS (S3), Mailpit (`pnpm infra:up`)                             |
| `docker-compose.prod.yml` | Production stack (one Dokploy Compose app): migrate, api, worker, web, Postgres, Valkey, backups |
| `.env.production.example` | Every production variable, with where to get each value                                          |
| `smoke.sh`                | Post-deploy smoke test (run by the deploy workflow; also by hand)                                |
| `backup/backup.sh`        | Nightly `pg_dump` to R2 with retention                                                           |
| `backup/restore.sh`       | Restore a dump (use for monthly restore drills)                                                  |

Local URLs: Mailpit http://localhost:8025 · S3 endpoint http://localhost:8333

See `docs/infrastructure/`: [Dokploy runbook](../docs/infrastructure/dokploy-runbook.md) (setup and everyday tasks), deployment, environments, backup/restore, and the hosting playbook.
