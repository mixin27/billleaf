#!/bin/sh
# Restore a dump into a target database (use a scratch DB for drills!).
#   S3_ENDPOINT=... ./restore.sh s3://bucket/postgres/billleaf-20261115T000000Z.dump postgres://user:pass@host:5432/restore_test
set -eu
src="$1"
target="$2"
aws s3 cp "$src" /tmp/restore.dump --endpoint-url "${S3_ENDPOINT:?}"
pg_restore --clean --if-exists --no-owner --dbname="$target" /tmp/restore.dump
rm -f -- /tmp/restore.dump
echo "restored $src -> $target"
