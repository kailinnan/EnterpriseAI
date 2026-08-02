#!/usr/bin/env sh
set -eu
test -n "${1:-}" || { echo "usage: rollback.sh <previous-image-tag>" >&2; exit 1; }
export IMAGE_TAG="$1"
docker compose --env-file .env.production -f docker-compose.production.yml up -d --no-build
docker compose --env-file .env.production -f docker-compose.production.yml ps
