# infra

| File                      | Purpose                                                     |
| ------------------------- | ----------------------------------------------------------- |
| `docker-compose.dev.yml`  | Local Postgres 17, Valkey, MinIO, Mailpit (`pnpm infra:up`) |
| `docker-compose.prod.yml` | Reference single-VPS production stack, deployed via Dokploy |
| `backup/backup.sh`        | Nightly `pg_dump` to R2 with retention                      |
| `backup/restore.sh`       | Restore a dump (use for monthly restore drills)             |

Local URLs: Mailpit http://localhost:8025 · MinIO console http://localhost:9001

See `docs/infrastructure/` for deployment, environments and the backup/restore runbook.
