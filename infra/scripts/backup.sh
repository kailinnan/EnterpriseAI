#!/usr/bin/env sh
set -eu
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
target="${BACKUP_DIR:-./backups}/$stamp"
mkdir -p "$target"
docker compose --env-file .env.production -f docker-compose.production.yml exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$target/postgres.dump"
docker compose --env-file .env.production -f docker-compose.production.yml exec -T minio sh -c 'tar -czf - /data' > "$target/minio-data.tar.gz"
sha256sum "$target/postgres.dump" "$target/minio-data.tar.gz" > "$target/SHA256SUMS"
echo "$target"
