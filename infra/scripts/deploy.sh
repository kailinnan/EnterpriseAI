#!/usr/bin/env sh
set -eu
test -f .env.production || { echo ".env.production is required" >&2; exit 1; }
docker compose --env-file .env.production -f docker-compose.production.yml build
docker compose --env-file .env.production -f docker-compose.production.yml --profile migration run --rm migrate
docker compose --env-file .env.production -f docker-compose.production.yml up -d
docker compose --env-file .env.production -f docker-compose.production.yml ps
