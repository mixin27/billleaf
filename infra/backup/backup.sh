#!/bin/sh
# Nightly logical backup -> S3-compatible bucket (Cloudflare R2).
# Complements (does not replace) continuous WAL archiving; see
# docs/infrastructure/backup-restore.md for the full strategy and restore drill.
set -eu
apk add --no-cache aws-cli >/dev/null 2>&1 || true

while true; do
  ts=$(date -u +%Y%m%dT%H%M%SZ)
  file="/tmp/${PGDATABASE}-${ts}.dump"
  echo "[backup] dumping ${PGDATABASE} -> ${file}"
  pg_dump --format=custom --no-owner --file="$file"
  aws s3 cp "$file" "s3://${BACKUP_BUCKET}/postgres/${PGDATABASE}-${ts}.dump" --endpoint-url "$S3_ENDPOINT"
  rm -f -- "/tmp/${PGDATABASE}-${ts}.dump"

  # Retention: delete objects older than RETENTION_DAYS (bucket lifecycle rules are a fine alternative).
  cutoff=$(date -u -d "@$(( $(date +%s) - RETENTION_DAYS * 86400 ))" +%Y%m%d)
  aws s3 ls "s3://${BACKUP_BUCKET}/postgres/" --endpoint-url "$S3_ENDPOINT" | awk '{print $4}' | while read -r key; do
    day=$(echo "$key" | sed -E 's/.*-([0-9]{8})T.*/\1/')
    if [ "$day" \< "$cutoff" ]; then
      aws s3 rm "s3://${BACKUP_BUCKET}/postgres/${key}" --endpoint-url "$S3_ENDPOINT"
    fi
  done
  echo "[backup] done; sleeping 24h"
  sleep 86400
done
