#!/usr/bin/env sh
set -eu
source_dir="${1:-}"
test -f "$source_dir/postgres.dump" -a -f "$source_dir/minio-data.tar.gz" || { echo "usage: restore.sh <backup-directory>" >&2; exit 1; }
test "${CONFIRM_RESTORE:-}" = "RESTORE PRODUCTION DATA" || { echo "set CONFIRM_RESTORE='RESTORE PRODUCTION DATA'" >&2; exit 1; }
(cd "$source_dir" && sha256sum -c SHA256SUMS)
docker compose --env-file .env.production -f docker-compose.production.yml stop api worker web
docker compose --env-file .env.production -f docker-compose.production.yml exec -T postgres sh -c 'dropdb -U "$POSTGRES_USER" --if-exists "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
docker compose --env-file .env.production -f docker-compose.production.yml exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' < "$source_dir/postgres.dump"
docker compose --env-file .env.production -f docker-compose.production.yml exec -T minio sh -c 'rm -rf /data/* && tar -xzf - -C /' < "$source_dir/minio-data.tar.gz"
docker compose --env-file .env.production -f docker-compose.production.yml up -d
