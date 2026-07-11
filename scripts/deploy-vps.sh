#!/usr/bin/env bash
set -euo pipefail

APP_URL="${APP_URL:-http://127.0.0.1:5001}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"

cd "$(dirname "$0")/.."

echo "==> Updating code"
git pull --ff-only

echo "==> Building and restarting container"
docker compose -f "$COMPOSE_FILE" up -d --build

echo "==> Waiting for health check"
for attempt in {1..20}; do
  if curl -fsS "$APP_URL/health" >/dev/null; then
    echo "==> Deployed: $APP_URL"
    exit 0
  fi

  sleep 1
done

echo "Deployment finished, but health check failed: $APP_URL/health" >&2
docker compose -f "$COMPOSE_FILE" logs --tail=80 badam-satti >&2
exit 1
