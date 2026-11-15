# Backup & Restore Runbook

## What is backed up

| Data                  | Method                                                            | Target                             | Retention            |
| --------------------- | ----------------------------------------------------------------- | ---------------------------------- | -------------------- |
| Postgres (continuous) | **WAL archiving** with WAL-G (or pgBackRest) + weekly base backup | R2 `billleaf-backups/pg/`          | 30 days PITR         |
| Postgres (logical)    | Nightly `pg_dump -Fc` (cron in `infra/` backup script)            | R2 `billleaf-backups/dumps/`       | 30 daily, 12 monthly |
| Files                 | Already in R2; bucket versioning / lifecycle rules                | R2                                 | per lifecycle        |
| Config                | Dokploy env exports (encrypted) + `infra/` in git                 | Password manager / private storage | latest + history     |

Valkey is a cache/queue — not backed up. Jobs must be safe to re-enqueue.

Targets: **RPO ≤ 15 min** (WAL), **RTO ≤ 2 h**.

## Backup credentials

- Dedicated R2 API token, write-only for the backup prefix where possible.
- Backups encrypted (WAL-G `libsodium` key / `age` for dumps). Store the key **outside** the VPS (password manager).

## Restore — point-in-time (WAL-G)

1. Declare incident; stop writers: scale `api` and `worker` to 0 in Dokploy.
2. Provision a fresh Postgres 17 container/volume (do not overwrite the broken one yet).
3. `wal-g backup-fetch $PGDATA LATEST` (or the chosen base backup).
4. Configure recovery: `restore_command = 'wal-g wal-fetch %f %p'`, `recovery_target_time = '<UTC timestamp before incident>'`, create `recovery.signal`.
5. Start Postgres; wait for recovery to finish; `select pg_wal_replay_resume();` if paused.
6. Verify: row counts on key tables, latest `audit_logs` entries, app smoke test against staging-like URL.
7. Point `DATABASE_URL` to the restored instance; scale `api`/`worker` back up.
8. Re-enable WAL archiving on the new instance and take a fresh base backup.
9. Post-incident write-up.

## Restore — logical dump (single workspace or full)

```bash
# full restore into an empty database
pg_restore --clean --if-exists --no-owner -d "$DATABASE_URL" billleaf-YYYYMMDD.dump
```

For a **single workspace**, restore the dump into a scratch database, then copy rows `where workspace_id = '<id>'` table by table in FK order. Never restore a full dump over production to recover one tenant.

## Monthly restore drill

- [ ] Restore last night's dump into a scratch DB on a separate host.
- [ ] Do a PITR to "1 hour ago" into a scratch instance.
- [ ] Run migrations check + smoke queries.
- [ ] Record duration and issues in the drill log; fix gaps.
